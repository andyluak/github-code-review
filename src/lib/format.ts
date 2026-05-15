export function compactPath(path: string, maxLength = 48) {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop() ?? path;
  if (parts.length === 0) {
    return truncateMiddle(fileName, maxLength);
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const candidate = `.../${[...parts.slice(index), fileName].join("/")}`;
    if (candidate.length <= maxLength) {
      return candidate;
    }
  }

  const parent = parts[parts.length - 1];
  const fixed = `.../${parent}/`;
  return `${fixed}${truncateMiddle(fileName, Math.max(maxLength - fixed.length, 12))}`;
}

export function pathParts(path: string) {
  const parts = path.split("/").filter(Boolean);
  const fileName = parts.pop() ?? path;
  return {
    directory: parts.join("/"),
    fileName,
  };
}

export function joinRepoPath(repoRoot: string, filePath: string) {
  const root = repoRoot.replace(/[\\/]+$/, "");
  const path = filePath.replace(/^[\\/]+/, "");
  return `${root}/${path}`;
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  if (maxLength <= 3) {
    return value.slice(0, maxLength);
  }

  const keep = maxLength - 3;
  const start = Math.ceil(keep / 2);
  const end = Math.floor(keep / 2);
  return `${value.slice(0, start)}...${value.slice(value.length - end)}`;
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

export function titleCase(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}
