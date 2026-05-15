export function compactPath(path: string, maxLength = 48) {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split("/");
  const file = parts.pop() ?? path;
  const parent = parts.pop();

  if (!parent) {
    return file;
  }

  return `.../${parent}/${file}`;
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
