import type * as TypeScript from "typescript";
import type {
  ReviewReferenceLookupRequest,
  ReviewReferenceSourceLocation,
} from "@/types/references";
import type { ReviewReferenceSourceFile } from "@/types/review";

export type ReviewReferenceIndex = {
  sourceCount: number;
  reviewSourceCount: number;
  findReferences: (
    request: ReviewReferenceLookupRequest,
  ) => ReviewReferenceSourceLocation[];
};

type SourceRecord = ReviewReferenceSourceFile & {
  virtualPath: string;
  lineStarts: number[];
};

export async function buildReviewReferenceIndex(
  sourceFiles: ReviewReferenceSourceFile[],
): Promise<ReviewReferenceIndex> {
  const ts = await import("typescript");
  const sources = new Map<string, SourceRecord>();
  const pathToVirtual = new Map<string, string>();
  const reviewPaths = new Set<string>();

  for (const source of sourceFiles) {
    const path = normalizeRepoPath(source.path);
    const virtualPath = toVirtualPath(path);
    const record: SourceRecord = {
      ...source,
      path,
      virtualPath,
      lineStarts: lineStarts(source.content),
    };
    sources.set(virtualPath, record);
    pathToVirtual.set(path, virtualPath);
    if (source.isReviewFile) {
      reviewPaths.add(path);
    }
  }

  const service = ts.createLanguageService(
    languageServiceHost(ts, sources),
    ts.createDocumentRegistry(),
  );

  return {
    sourceCount: sources.size,
    reviewSourceCount: reviewPaths.size,
    findReferences(request) {
      const fileName = pathToVirtual.get(normalizeRepoPath(request.path));
      if (!fileName) {
        return [];
      }
      const source = sources.get(fileName);
      if (!source) {
        return [];
      }

      const position = offsetForLineColumn(source, request.lineNumber, request.column);
      if (position === null) {
        return [];
      }

      const referenceGroups = service.findReferences(fileName, position) ?? [];
      const seen = new Set<string>();
      const results: ReviewReferenceSourceLocation[] = [];

      for (const group of referenceGroups) {
        for (const reference of group.references) {
          const sourcePath = fromVirtualPath(reference.fileName);
          if (!reviewPaths.has(sourcePath)) {
            continue;
          }
          const referenceSource = sources.get(reference.fileName);
          if (!referenceSource) {
            continue;
          }
          const key = `${sourcePath}:${reference.textSpan.start}:${reference.textSpan.length}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const location = lineColumnForOffset(
            referenceSource,
            reference.textSpan.start,
          );
          results.push({
            path: sourcePath,
            lineNumber: location.lineNumber,
            column: location.column,
            length: reference.textSpan.length,
            lineText: lineText(referenceSource.content, location.lineNumber),
            isDefinition: Boolean(reference.isDefinition),
          });
        }
      }

      return results;
    },
  };
}

function languageServiceHost(
  ts: typeof TypeScript,
  sources: Map<string, SourceRecord>,
): TypeScript.LanguageServiceHost {
  const fileNames = [...sources.keys()];
  const compilerOptions: TypeScript.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2020,
  };

  return {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => "/",
    getDefaultLibFileName: () => "lib.d.ts",
    getScriptFileNames: () => fileNames,
    getScriptSnapshot: (fileName) => {
      const source = sources.get(normalizeVirtualPath(fileName));
      return source ? ts.ScriptSnapshot.fromString(source.content) : undefined;
    },
    getScriptVersion: () => "1",
    fileExists: (fileName) => sources.has(normalizeVirtualPath(fileName)),
    readFile: (fileName) => sources.get(normalizeVirtualPath(fileName))?.content,
    readDirectory: () => [],
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((moduleName) => {
        const resolved = resolveVirtualImport(
          normalizeVirtualPath(containingFile),
          moduleName,
          sources,
        );
        if (!resolved) {
          return undefined;
        }
        return {
          resolvedFileName: resolved,
          extension: extensionForPath(ts, resolved),
        };
      }),
  };
}

function resolveVirtualImport(
  containingFile: string,
  moduleName: string,
  sources: Map<string, SourceRecord>,
) {
  if (!moduleName.startsWith(".")) {
    return null;
  }
  const base = normalizeVirtualPath(`${dirname(containingFile)}/${moduleName}`);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mts`,
    `${base}.cts`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
    `${base}/index.jsx`,
  ];
  return candidates.find((candidate) => sources.has(candidate)) ?? null;
}

function extensionForPath(ts: typeof TypeScript, path: string): TypeScript.Extension {
  if (path.endsWith(".tsx")) return ts.Extension.Tsx;
  if (path.endsWith(".jsx")) return ts.Extension.Jsx;
  if (path.endsWith(".js") || path.endsWith(".mjs") || path.endsWith(".cjs")) {
    return ts.Extension.Js;
  }
  return ts.Extension.Ts;
}

function normalizeRepoPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function toVirtualPath(path: string) {
  return `/${normalizeRepoPath(path)}`;
}

function fromVirtualPath(path: string) {
  return normalizeRepoPath(path);
}

function normalizeVirtualPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

function dirname(path: string) {
  const normalized = normalizeVirtualPath(path);
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "/" : normalized.slice(0, index);
}

function lineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") {
      starts.push(index + 1);
    }
  }
  return starts;
}

function offsetForLineColumn(
  source: SourceRecord,
  lineNumber: number,
  column: number,
) {
  const lineStart = source.lineStarts[lineNumber - 1];
  if (lineStart === undefined) {
    return null;
  }
  return lineStart + Math.max(0, column);
}

function lineColumnForOffset(source: SourceRecord, offset: number) {
  let low = 0;
  let high = source.lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = source.lineStarts[middle];
    const next = source.lineStarts[middle + 1] ?? Number.POSITIVE_INFINITY;
    if (offset < start) {
      high = middle - 1;
    } else if (offset >= next) {
      low = middle + 1;
    } else {
      return {
        lineNumber: middle + 1,
        column: offset - start,
      };
    }
  }
  return { lineNumber: 1, column: offset };
}

function lineText(content: string, lineNumber: number) {
  const lines = content.split(/\r?\n/);
  return lines[lineNumber - 1] ?? "";
}
