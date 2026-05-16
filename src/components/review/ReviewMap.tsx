import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Code2,
  Minus,
  Move,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { compactPath } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReviewDiagram, ReviewSession } from "@/types/review";

type ReviewMapProps = {
  session: ReviewSession;
  diagram: ReviewDiagram | null;
  isLoading: boolean;
  error: string | null;
  onReload: () => void;
  onSave: (diagram: ReviewDiagram) => void;
  onSelectFile: (fileId: string) => void;
};

type MermaidRenderState =
  | { status: "idle"; svg: string; error: null }
  | { status: "loading"; svg: string; error: null }
  | { status: "ready"; svg: string; error: null }
  | { status: "failed"; svg: string; error: string };

export function ReviewMap({
  session,
  diagram,
  isLoading,
  error,
  onReload,
  onSave,
  onSelectFile,
}: ReviewMapProps) {
  const [draftSource, setDraftSource] = useState(diagram?.source ?? "");
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  useEffect(() => {
    setDraftSource(diagram?.source ?? "");
    setIsSourceOpen(false);
  }, [diagram?.id, diagram?.source]);

  const sessionFileIds = useMemo(
    () => new Set(session.files.map((file) => file.id)),
    [session.files],
  );
  const fileNodes = useMemo(
    () =>
      (diagram?.nodes ?? []).filter(
        (node) =>
          node.fileId &&
          node.path &&
          !node.collapsed &&
          sessionFileIds.has(node.fileId),
      ),
    [diagram, sessionFileIds],
  );
  const hasDirtySource = Boolean(diagram && draftSource !== diagram.source);

  function saveDraft() {
    if (!diagram) {
      return;
    }
    onSave({
      ...diagram,
      source: draftSource,
      updatedAt: new Date().toISOString(),
    });
  }

  if (!diagram) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
        <MapToolbar
          isLoading={isLoading}
          canSave={false}
          isSourceOpen={false}
          canEditSource={false}
          onReload={onReload}
          onSave={saveDraft}
          onToggleSource={() => setIsSourceOpen((current) => !current)}
        />
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <div>
            <div className="rd-display-italic text-[18px] text-[var(--rd-cream)]">
              No map for this session.
            </div>
            <div className="mt-2 font-mono text-[11px] text-[var(--rd-graphite)]">
              review-desk diagrams create --repo {shellQuote(session.repo.root)}
            </div>
            {error ? (
              <div className="mt-4 text-[12px] text-[var(--rd-del)]">{error}</div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--rd-ink)]">
      <MapToolbar
        isLoading={isLoading}
        canSave={hasDirtySource}
        isSourceOpen={isSourceOpen}
        canEditSource={true}
        onReload={onReload}
        onSave={saveDraft}
        onToggleSource={() => setIsSourceOpen((current) => !current)}
      />
      {error ? (
        <div className="flex items-center gap-2 border-b border-[var(--rd-del-line)] bg-[var(--rd-del-bg)] px-3 py-2 text-[12px] text-[var(--rd-del)]">
          <AlertCircle className="size-3.5" />
          {error}
        </div>
      ) : null}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col border-r border-[var(--rd-hair)]">
          <MermaidPreview source={draftSource} />
          {isSourceOpen ? (
            <div className="h-[34%] min-h-[180px] shrink-0 border-t border-[var(--rd-hair)]">
              <textarea
                value={draftSource}
                onChange={(event) => setDraftSource(event.currentTarget.value)}
                spellCheck={false}
                aria-label="Mermaid diagram source"
                className="h-full w-full resize-none border-0 bg-[var(--rd-ink-2)] p-3 font-mono text-[11px] leading-5 text-[var(--rd-cream-2)] outline-none placeholder:text-[var(--rd-graphite)] focus-visible:outline-2 focus-visible:outline-[var(--rd-vermillion-line)] focus-visible:outline-offset-[-2px]"
              />
            </div>
          ) : null}
        </div>
        <aside className="flex min-h-0 flex-col bg-[var(--rd-ink)]">
          <div className="border-b border-[var(--rd-hair)] px-4 py-4">
            <div className="flex items-baseline justify-between">
              <div className="rd-display-italic text-[16px] leading-none text-[var(--rd-cream)]">
                Map
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                {diagram.scope}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[10px] text-[var(--rd-pencil)]">
              <Stat label="Nodes" value={diagram.stats.nodes} />
              <Stat label="Edges" value={diagram.stats.edges} />
              <Stat label="Files" value={diagram.stats.files} />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              <div>
                <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                  Files
                </div>
                <div className="space-y-1">
                  {fileNodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => onSelectFile(node.fileId!)}
                      className="block w-full rounded-sm border border-transparent px-2.5 py-2 text-left hover:border-[var(--rd-hair-2)] hover:bg-[var(--rd-ink-2)]"
                    >
                      <span className="block truncate font-mono text-[11px] text-[var(--rd-cream-2)]">
                        {compactPath(node.path!, 36)}
                      </span>
                      <span className="block truncate text-[10px] text-[var(--rd-graphite)]">
                        {node.group}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {diagram.warnings.length > 0 ? (
                <div>
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--rd-pencil)]">
                    Warnings
                  </div>
                  <div className="space-y-1.5">
                    {diagram.warnings.slice(0, 6).map((warning, index) => (
                      <div
                        key={`${warning.code ?? "warning"}-${index}`}
                        className="rounded-sm bg-[var(--rd-ink-2)] px-2 py-1.5 text-[11px] leading-4 text-[var(--rd-graphite)]"
                      >
                        {warning.path ? (
                          <span className="font-mono text-[var(--rd-cream-2)]">
                            {compactPath(warning.path, 28)}:{" "}
                          </span>
                        ) : null}
                        {warning.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

function MapToolbar({
  isLoading,
  canSave,
  isSourceOpen,
  canEditSource,
  onReload,
  onSave,
  onToggleSource,
}: {
  isLoading: boolean;
  canSave: boolean;
  isSourceOpen: boolean;
  canEditSource: boolean;
  onReload: () => void;
  onSave: () => void;
  onToggleSource: () => void;
}) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-end gap-1.5 border-b border-[var(--rd-hair)] px-3">
      {canEditSource ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onToggleSource}
          className={
            isSourceOpen
              ? "h-6 rounded bg-[var(--rd-ink-4)] px-2 text-[11px] text-[var(--rd-cream)]"
              : "h-6 rounded px-2 text-[11px] text-[var(--rd-graphite)] hover:text-[var(--rd-cream)]"
          }
        >
          <Code2 className="size-3" />
          Source
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onReload}
        disabled={isLoading}
        aria-label="Reload review map"
      >
        <RefreshCw className={isLoading ? "size-3 animate-spin" : "size-3"} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onSave}
        disabled={!canSave}
        aria-label="Save review map source"
      >
        <Save className="size-3" />
      </Button>
    </div>
  );
}

function MermaidPreview({ source }: { source: string }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const renderId = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
  } | null>(null);
  const [transform, setTransform] = useState({ x: 20, y: 20, scale: 1 });
  const [state, setState] = useState<MermaidRenderState>({
    status: "idle",
    svg: "",
    error: null,
  });

  useEffect(() => {
    setTransform({ x: 20, y: 20, scale: 1 });
  }, [source]);

  useEffect(() => {
    if (state.status !== "ready") {
      return;
    }
    const frame = window.requestAnimationFrame(() => fitToView());
    return () => window.cancelAnimationFrame(frame);
  }, [state.status, state.svg]);

  useEffect(() => {
    const id = renderId.current + 1;
    renderId.current = id;

    if (!source.trim()) {
      setState({ status: "idle", svg: "", error: null });
      return;
    }

    setState((current) => ({ status: "loading", svg: current.svg, error: null }));
    void import("mermaid")
      .then(({ default: mermaid }) => {
        if (renderId.current !== id) {
          return null;
        }
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            darkMode: true,
            background: "#111017",
            mainBkg: "#1d2230",
            secondBkg: "#18241f",
            primaryColor: "#1d2230",
            primaryTextColor: "#f4efe2",
            primaryBorderColor: "#7aa2ff",
            lineColor: "#d8d2c3",
            secondaryColor: "#18241f",
            tertiaryColor: "#221b28",
            clusterBkg: "#202127",
            clusterBorder: "#595f69",
            edgeLabelBackground: "#111017",
            fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "14px",
          },
          flowchart: {
            htmlLabels: false,
            useMaxWidth: false,
            curve: "basis",
            nodeSpacing: 56,
            rankSpacing: 72,
          },
        });
        return mermaid.render(`review-map-${Date.now()}-${id}`, source);
      })
      .then((result) => {
        if (!result?.svg) {
          return;
        }
        if (renderId.current !== id) {
          return;
        }
        setState({ status: "ready", svg: result.svg, error: null });
      })
      .catch((caught) => {
        if (renderId.current !== id) {
          return;
        }
        setState({
          status: "failed",
          svg: "",
          error: caught instanceof Error ? caught.message : String(caught),
        });
      });
  }, [source]);

  if (state.status === "failed") {
    return (
      <div className="min-h-0 flex-1 p-5 text-[12px] leading-5 text-[var(--rd-del)]">
        {state.error}
      </div>
    );
  }

  if (!state.svg) {
    return (
      <div className="min-h-0 flex-1 p-5 rd-display-italic text-[13px] text-[var(--rd-graphite)]">
        {state.status === "loading" ? "Rendering map..." : "No Mermaid source."}
      </div>
    );
  }

  function zoomAt(clientX: number, clientY: number, factor: number) {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    const pointX = clientX - bounds.left;
    const pointY = clientY - bounds.top;
    setTransform((current) => {
      const nextScale = clamp(current.scale * factor, 0.25, 3);
      const ratio = nextScale / current.scale;

      return {
        scale: nextScale,
        x: pointX - (pointX - current.x) * ratio,
        y: pointY - (pointY - current.y) * ratio,
      };
    });
  }

  function zoomCenter(factor: number) {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    zoomAt(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, factor);
  }

  function fitToView() {
    const viewport = viewportRef.current;
    const svg = contentRef.current?.querySelector<SVGSVGElement>("svg");
    if (!viewport || !svg) {
      return;
    }

    const bounds = viewport.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const rawWidth = viewBox?.width || Number(svg.getAttribute("width")) || 1200;
    const rawHeight = viewBox?.height || Number(svg.getAttribute("height")) || 800;
    const scale = clamp(
      Math.min((bounds.width - 72) / rawWidth, (bounds.height - 72) / rawHeight),
      0.22,
      1.15,
    );

    setTransform({
      scale,
      x: Math.max(24, (bounds.width - rawWidth * scale) / 2),
      y: Math.max(24, (bounds.height - rawHeight * scale) / 2),
    });
  }

  return (
    <div
      ref={viewportRef}
      className={cn(
        "relative min-h-0 flex-1 touch-none overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(236,230,216,0.05),transparent_38%),var(--rd-ink)]",
        dragRef.current ? "cursor-grabbing" : "cursor-grab",
      )}
      onWheel={(event) => {
        event.preventDefault();
        zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.12 : 0.88);
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: transform.x,
          y: transform.y,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }
        setTransform((current) => ({
          ...current,
          x: drag.x + event.clientX - drag.startX,
          y: drag.y + event.clientY - drag.startY,
        }));
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId === event.pointerId) {
          dragRef.current = null;
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
    >
      <div
        className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md border border-[var(--rd-hair)] bg-[rgba(21,20,27,0.88)] p-1 shadow-lg backdrop-blur"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => zoomCenter(1.18)}
          aria-label="Zoom in"
        >
          <Plus className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => zoomCenter(0.82)}
          aria-label="Zoom out"
        >
          <Minus className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={fitToView}
          aria-label="Fit map to view"
        >
          <RotateCcw className="size-3" />
        </Button>
        <div className="px-1.5 font-mono text-[10px] text-[var(--rd-graphite)]">
          {Math.round(transform.scale * 100)}%
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-1.5 rounded-md border border-[var(--rd-hair)] bg-[rgba(21,20,27,0.78)] px-2 py-1 font-mono text-[10px] text-[var(--rd-graphite)] backdrop-blur">
        <Move className="size-3" />
        Drag to pan. Wheel to zoom.
      </div>
      <div
        ref={contentRef}
        className="rd-mermaid-map absolute left-0 top-0 origin-top-left p-4 [&_svg]:h-auto [&_svg]:max-w-none"
        style={{
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
        }}
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[var(--rd-graphite)]">{label}</div>
      <div className="mt-0.5 truncate text-[var(--rd-cream)]">{value}</div>
    </div>
  );
}

function shellQuote(value: string) {
  return value.includes(" ") ? `"${value.replace(/"/g, "\\\"")}"` : value;
}
