export type CodeToken = {
  value: string;
  className: string;
  start: number;
};

const KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "const",
  "continue",
  "default",
  "else",
  "enum",
  "export",
  "false",
  "fn",
  "for",
  "from",
  "function",
  "if",
  "impl",
  "import",
  "in",
  "let",
  "match",
  "mod",
  "mut",
  "null",
  "pub",
  "return",
  "self",
  "static",
  "struct",
  "super",
  "true",
  "type",
  "undefined",
  "use",
  "where",
]);

const TYPES = new Set([
  "bool",
  "Error",
  "number",
  "Option",
  "Path",
  "PathBuf",
  "Result",
  "Self",
  "String",
  "str",
  "usize",
  "Vec",
]);

export function highlightCodeLine(content: string) {
  return tokenizeCodeLine(content).map((token, index) => (
    <span key={`${index}-${token.value}`} className={token.className}>
      {token.value}
    </span>
  ));
}

export function tokenizeCodeLine(line: string): CodeToken[] {
  if (!line) {
    return [];
  }

  const commentIndex = findCommentIndex(line);
  const code = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
  const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
  const tokens: CodeToken[] = [];
  const pattern =
    /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b|[{}()[\].,:;<>/=+\-*|&!?]+)/g;

  let cursor = 0;
  for (const match of code.matchAll(pattern)) {
    const value = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      tokens.push({
        value: code.slice(cursor, index),
        className: "text-current",
        start: cursor,
      });
    }

    tokens.push({ value, className: tokenClass(value, code, index), start: index });
    cursor = index + value.length;
  }

  if (cursor < code.length) {
    tokens.push({
      value: code.slice(cursor),
      className: "text-current",
      start: cursor,
    });
  }

  if (comment) {
    tokens.push({
      value: comment,
      className: "text-[#766d5d] italic",
      start: code.length,
    });
  }

  return tokens;
}

function findCommentIndex(line: string) {
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;

  for (let index = 0; index < line.length - 1; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    const previous = line[index - 1];

    if (previous !== "\\" && char === "'" && !inDouble && !inBacktick) {
      inSingle = !inSingle;
    }
    if (previous !== "\\" && char === '"' && !inSingle && !inBacktick) {
      inDouble = !inDouble;
    }
    if (previous !== "\\" && char === "`" && !inSingle && !inDouble) {
      inBacktick = !inBacktick;
    }
    if (!inSingle && !inDouble && !inBacktick && char === "/" && next === "/") {
      return index;
    }
  }

  return -1;
}

function tokenClass(value: string, code: string, index: number) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    return "text-[#cfa66b]";
  }

  if (/^\d/.test(value)) {
    return "text-[#b8a26a]";
  }

  if (KEYWORDS.has(value)) {
    return "text-[#d6b86e]";
  }

  if (TYPES.has(value) || /^[A-Z][A-Za-z0-9_]*$/.test(value)) {
    return "text-[#b2bb9d]";
  }

  if (/^[{}()[\].,:;<>/=+\-*|&!?]+$/.test(value)) {
    return "text-[#6e6555]";
  }

  const before = code.slice(0, index).trimEnd();
  if (before.endsWith("<") || before.endsWith("</")) {
    return "text-[#d0b36f]";
  }

  const afterAttribute = code.slice(index + value.length).trimStart();
  if (afterAttribute.startsWith("=")) {
    return "text-[#b9ad91]";
  }

  if (afterAttribute.startsWith("(")) {
    return "text-[#c9c3aa]";
  }

  return "text-[#ddd4c2]";
}
