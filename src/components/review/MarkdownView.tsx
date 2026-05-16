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
  | { kind: "link"; label: string; href: string }
  | { kind: "image"; alt: string; src: string };

export function MarkdownView({
  children,
  className,
  compact = false,
  disableLinks = false,
}: MarkdownViewProps) {
  const blocks = parseBlocks(normalizeMarkdownForDisplay(children));

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

function normalizeMarkdownForDisplay(value: string): string {
  return polishLinearSections(
    decodeHtmlEntities(
      value
        .replace(/\r\n?/g, "\n")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(
          /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
          (_match, _quote, href: string, label: string) =>
            `[${cleanHtmlText(label)}](${decodeHtmlEntities(href)})`,
        )
        .replace(/<summary\b[^>]*>([\s\S]*?)<\/summary>/gi, (_match, label) =>
          `\n\n### ${cleanHtmlText(label)}\n\n`,
        )
        .replace(/<\/p>\s*<p\b[^>]*>/gi, "\n\n")
        .replace(/<p\b[^>]*>/gi, "\n\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<li\b[^>]*>/gi, "\n- ")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/?(?:details|ul|ol|blockquote|div|span)\b[^>]*>/gi, "\n\n")
        .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
        .replace(/<b\b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
        .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
        .replace(/<i\b[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
        .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
        .replace(/\[([^\]]+)\]\(<(https?:\/\/[^>\s]+)>\)/g, "[$1]($2)")
        .replace(/<((?:https?:\/\/)[^>\s]+)>/g, "[$1]($1)")
        .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?>/g, ""),
    ),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function polishLinearSections(value: string): string {
  return value
    .replace(
      /(^|\s)\*\*(Problem|Current behavior|Expected behavior|Implementation|References)\*\*\s*/g,
      "\n\n### $2\n",
    )
    .replace(/\s+\*\s+(?=[A-Za-z0-9`])/g, "\n- ")
    .replace(/\s+(\d+\.)\s+(?=[A-Z`])/g, "\n$1 ");
}

function cleanHtmlText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<\/?[A-Za-z][A-Za-z0-9-]*(?:\s+[^<>]*)?>/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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
        return (
          <Fragment key={index}>
            {linkLabelForDisplay(token.label, token.href)}
          </Fragment>
        );
      }
      return (
        <a
          key={index}
          href={token.href}
          title={token.href}
          target="_blank"
          rel="noreferrer"
          className="text-[var(--rd-vermillion-2)] underline underline-offset-2"
        >
          {linkLabelForDisplay(token.label, token.href)}
        </a>
      );
    }
    if (token.kind === "image") {
      if (disableLinks) {
        return (
          <Fragment key={index}>
            {token.alt ? `[image: ${token.alt}]` : "[image]"}
          </Fragment>
        );
      }
      return (
        <a
          key={index}
          href={token.src}
          title={token.alt || token.src}
          target="_blank"
          rel="noreferrer"
          className="my-2 block overflow-hidden rounded-md border border-[var(--rd-hair)] bg-[var(--rd-ink-3)]"
        >
          <img
            src={token.src}
            alt={token.alt || "Attached image"}
            loading="lazy"
            className="max-h-64 w-full object-contain"
          />
        </a>
      );
    }
    return <Fragment key={index}>{token.value}</Fragment>;
  });
}

function linkLabelForDisplay(label: string, href: string): string {
  if (label !== href) return label;

  try {
    const url = new URL(href);
    const path = `${url.pathname}${url.hash}`.replace(/\/$/, "");
    if (!path || path === "/") return url.hostname;
    return `${url.hostname}${path}`;
  } catch {
    return label;
  }
}

function tokenizeInline(value: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern =
    /(!\[([^\]]*)\]\(<?(https?:\/\/[^)>\s]+)>?(?:\s+"[^"]*")?\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(<?(https?:\/\/[^)>\s]+)>?\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", value: value.slice(lastIndex, match.index) });
    }

    if (match[2] !== undefined && match[3]) {
      tokens.push({ kind: "image", alt: match[2], src: match[3] });
    } else if (match[5]) {
      tokens.push({ kind: "code", value: match[5] });
    } else if (match[7]) {
      tokens.push({ kind: "strong", value: match[7] });
    } else if (match[9]) {
      tokens.push({ kind: "em", value: match[9] });
    } else if (match[11] && match[12]) {
      tokens.push({ kind: "link", label: match[11], href: match[12] });
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
