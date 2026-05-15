import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type MarkdownViewProps = {
  children: string;
  className?: string;
  compact?: boolean;
  disableLinks?: boolean;
};

type MarkdownPreviewProps = {
  children: string;
  className?: string;
};

type InlineToken =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; value: string }
  | { kind: "em"; value: string }
  | { kind: "link"; label: string; href: string };

export function MarkdownView({
  children,
  className,
  compact = false,
  disableLinks = false,
}: MarkdownViewProps) {
  const blocks = parseBlocks(children);

  return (
    <div
      className={cn(
        "rd-markdown break-words text-[12px] leading-5 text-[var(--rd-cream-2)]",
        compact ? "space-y-1" : "space-y-2",
        className,
      )}
    >
      {blocks.map((block, index) => {
        if (block.kind === "code") {
          return (
            <pre
              key={index}
              className="overflow-x-auto rounded bg-[var(--rd-ink-2)] px-2.5 py-2 font-mono text-[11px] leading-4 text-[var(--rd-cream)]"
            >
              <code>{block.value}</code>
            </pre>
          );
        }

        if (block.kind === "heading") {
          return (
            <div
              key={index}
              className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--rd-cream)]"
            >
              {renderInline(block.value, disableLinks)}
            </div>
          );
        }

        if (block.kind === "quote") {
          return (
            <blockquote
              key={index}
              className="border-l-2 border-[var(--rd-vermillion-line)] pl-2 text-[var(--rd-cream-2)]"
            >
              {renderInline(block.value, disableLinks)}
            </blockquote>
          );
        }

        if (block.kind === "list") {
          return (
            <ul key={index} className="list-disc space-y-1 pl-4">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item, disableLinks)}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="whitespace-pre-wrap">
            {renderInline(block.value, disableLinks)}
          </p>
        );
      })}
    </div>
  );
}

export function MarkdownPreview({ children, className }: MarkdownPreviewProps) {
  return (
    <span
      className={cn(
        "break-words text-[12px] leading-5 text-[var(--rd-cream-2)]",
        className,
      )}
    >
      {renderInline(compactMarkdownPreview(children), true)}
    </span>
  );
}

type MarkdownBlock =
  | { kind: "paragraph"; value: string }
  | { kind: "heading"; value: string }
  | { kind: "quote"; value: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; value: string };

function parseBlocks(value: string): MarkdownBlock[] {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push({ kind: "paragraph", value: paragraph.join("\n") });
    paragraph = [];
  }

  function flushList() {
    if (list.length === 0) {
      return;
    }
    blocks.push({ kind: "list", items: list });
    list = [];
  }

  for (const line of lines) {
    const fence = line.match(/^\s*```/);
    if (fence) {
      if (code) {
        blocks.push({ kind: "code", value: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        flushList();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", value: heading[1] });
      continue;
    }

    const listItem = line.match(/^\s{0,3}(?:[-*+]|\d+\.)\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      continue;
    }

    const quote = line.match(/^\s{0,3}>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "quote", value: quote[1] });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (code) {
    blocks.push({ kind: "code", value: code.join("\n") });
  }
  flushParagraph();
  flushList();
  return blocks.length > 0 ? blocks : [{ kind: "paragraph", value }];
}

function renderInline(value: string, disableLinks: boolean): ReactNode[] {
  return tokenizeInline(value).map((token, index) => {
    if (token.kind === "code") {
      return (
        <code
          key={index}
          className="rounded bg-[var(--rd-ink-2)] px-1 py-0.5 font-mono text-[11px] text-[var(--rd-cream)]"
        >
          {token.value}
        </code>
      );
    }
    if (token.kind === "strong") {
      return (
        <strong key={index} className="font-semibold text-[var(--rd-cream)]">
          {token.value}
        </strong>
      );
    }
    if (token.kind === "em") {
      return (
        <em key={index} className="text-[var(--rd-cream)]">
          {token.value}
        </em>
      );
    }
    if (token.kind === "link") {
      if (disableLinks) {
        return <Fragment key={index}>{token.label}</Fragment>;
      }
      return (
        <a
          key={index}
          href={token.href}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--rd-vermillion-2)] underline underline-offset-2"
        >
          {token.label}
        </a>
      );
    }
    return <Fragment key={index}>{token.value}</Fragment>;
  });
}

function tokenizeInline(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", value: value.slice(lastIndex, match.index) });
    }

    if (match[2]) {
      tokens.push({ kind: "code", value: match[2] });
    } else if (match[4]) {
      tokens.push({ kind: "strong", value: match[4] });
    } else if (match[6]) {
      tokens.push({ kind: "em", value: match[6] });
    } else if (match[8] && match[9]) {
      tokens.push({ kind: "link", label: match[8], href: match[9] });
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < value.length) {
    tokens.push({ kind: "text", value: value.slice(lastIndex) });
  }

  return tokens;
}

function compactMarkdownPreview(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !/^\s*```/.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, "")
        .replace(/^\s{0,3}>\s?/, "")
        .replace(/^\s{0,3}(?:[-*+]|\d+\.)\s+/, ""),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
