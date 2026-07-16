#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourcePath = new URL("../src/lib/review-reference-engine.ts", import.meta.url);
const locationsPath = new URL("../src/lib/review-reference-locations.ts", import.meta.url);
const tempPath = new URL("./.review-reference-engine-test.mjs", import.meta.url);
const tempLocationsPath = new URL(
  "./.review-reference-locations-test.mjs",
  import.meta.url,
);

const source = await readFile(sourcePath, "utf8");
const locationsSource = await readFile(locationsPath, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const transpiledLocations = ts.transpileModule(locationsSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

try {
  await writeFile(tempPath, transpiled);
  await writeFile(tempLocationsPath, transpiledLocations);
  const { buildReviewReferenceIndex } = await import(pathToFileURL(tempPath.pathname));
  const { buildReviewReferenceDiffIndex, mapReviewReferenceTargets } = await import(
    pathToFileURL(tempLocationsPath.pathname)
  );

  const sources = {
    "src/defs.ts": "export function target(value: number) { return value + 1; }\n",
    "src/use.ts": [
      'import { target as renamedTarget } from "./defs";',
      "",
      "export const result = renamedTarget(1);",
      "",
    ].join("\n"),
    "src/view.tsx": [
      'import { target } from "./defs";',
      "export function View() {",
      "  return <button onClick={() => target(2)} />;",
      "}",
      "",
    ].join("\n"),
    "src/shadow.ts": [
      "function target() { return 0; }",
      "export const local = target();",
      "",
    ].join("\n"),
    "src/state.tsx": [
      "export function CounterWidget() {",
      "  const [count, setCount] = useState(0);",
      "  return <button onClick={() => {",
      "    setCount(count + 1);",
      "  }} />;",
      "}",
      "",
    ].join("\n"),
  };

  const index = await buildReviewReferenceIndex(
    Object.entries(sources).map(([path, content]) => ({
      path,
      content,
      byteSize: Buffer.byteLength(content),
      isReviewFile: true,
    })),
  );

  const refs = index.findReferences(originFor(sources, "src/defs.ts", 1, "target"));
  assert(
    refs.some((ref) => ref.path === "src/use.ts" && ref.lineNumber === 3),
    "finds alias call references across imports",
  );
  assert(
    refs.some((ref) => ref.path === "src/view.tsx" && ref.lineNumber === 3),
    "finds JSX file references",
  );
  assert(
    refs.every((ref) => ref.path !== "src/shadow.ts"),
    "does not include same-name shadowed local symbols",
  );

  const setterRefs = index.findReferences(originFor(sources, "src/state.tsx", 2, "setCount"));
  assert(
    setterRefs.some((ref) => ref.path === "src/state.tsx" && ref.lineNumber === 4),
    "finds local useState setter references in callback bodies",
  );

  const session = {
    files: [
      {
        id: "src/defs.ts",
        path: "src/defs.ts",
        hunks: [
          {
            lines: [
              { kind: "context", newLine: 1, diffPosition: 1 },
              { kind: "addition", newLine: 3, diffPosition: 3 },
            ],
          },
        ],
      },
    ],
  };
  const diffIndex = buildReviewReferenceDiffIndex(session);
  const mapped = mapReviewReferenceTargets({
    index: diffIndex,
    origin: originFor(sources, "src/defs.ts", 1, "target"),
    references: [
      {
        path: "src/defs.ts",
        lineNumber: 1,
        column: 16,
        length: 6,
        lineText: sources["src/defs.ts"].trim(),
        isDefinition: true,
      },
      {
        path: "src/defs.ts",
        lineNumber: 3,
        column: 0,
        length: 6,
        lineText: "target(1)",
        isDefinition: false,
      },
      {
        path: "src/defs.ts",
        lineNumber: 99,
        column: 0,
        length: 6,
        lineText: "target(99)",
        isDefinition: false,
      },
    ],
  });
  assert.equal(mapped.length, 2, "filters the clicked origin occurrence");
  assert.equal(mapped[0].diffPosition, 3, "maps visible references to diff rows");
  assert.equal(mapped[1].diffPosition, null, "keeps outside-visible-diff references honest");

  console.log("review reference guards ok");
} finally {
  await rm(tempPath, { force: true });
  await rm(tempLocationsPath, { force: true });
}

function originFor(sources, path, lineNumber, symbol) {
  const line = sources[path].split(/\r?\n/)[lineNumber - 1];
  const column = line.indexOf(symbol);
  assert(column >= 0, `missing ${symbol} on ${path}:${lineNumber}`);
  return {
    fileId: path,
    path,
    lineNumber,
    column,
    length: symbol.length,
    symbol,
    diffPosition: lineNumber,
  };
}
