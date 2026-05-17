// Stable, deterministic preview fingerprints for review items.
// Backend recomputes equivalent fingerprints. UI-side is not a security boundary.

function normalize(body: string): string {
  return body.replace(/\r\n/g, "\n").trim();
}

function fnv1a(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function fingerprintInline(
  comment: {
    path: string;
    line: number;
    side?: string | null;
    startLine?: number | null;
    body: string;
  },
  prNumber: number,
  headSha: string,
): string {
  const side = comment.side ?? "RIGHT";
  const range =
    comment.startLine && comment.startLine !== comment.line
      ? `|${comment.startLine}-${comment.line}`
      : `|${comment.line}`;
  return fnv1a(
    `inline|${prNumber}|${headSha}|${comment.path}|${side}${range}|${normalize(comment.body)}`,
  );
}

export function fingerprintThreadReply(
  threadId: string,
  body: string,
  prNumber: number,
  headSha: string,
): string {
  return fnv1a(`reply|${prNumber}|${headSha}|${threadId}|${normalize(body)}`);
}

export function fingerprintBody(
  body: string,
  prNumber: number,
  headSha: string,
  event: string,
): string {
  return fnv1a(`body|${prNumber}|${headSha}|${event}|${normalize(body)}`);
}
