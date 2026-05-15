import {
  Bot,
  CheckCircle2,
  Eye,
  MessageSquare,
  NotebookPen,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { compactPath } from "@/lib/format";
import { statusTone } from "@/lib/status";
import type {
  InlineComment,
  ReviewFile,
  ReviewSession,
  ReviewWorkspaceState,
  SessionFileState,
} from "@/types/review";

type InspectorProps = {
  session: ReviewSession;
  file: ReviewFile | null;
  fileState: SessionFileState | null;
  workspaceState: ReviewWorkspaceState;
  onPatchFileState: (fileId: string, patch: Partial<SessionFileState>) => void;
  onMarkViewed: () => void;
  onMarkReviewed: () => void;
};

export function Inspector({
  session,
  file,
  fileState,
  workspaceState,
  onPatchFileState,
  onMarkViewed,
  onMarkReviewed,
}: InspectorProps) {
  const basket = session.files.flatMap((candidate): ReviewBasketItem[] => {
    const state = workspaceState[candidate.id];
    const items: ReviewBasketItem[] = [];
    const draft = state?.publishableDraft.trim() ?? "";

    if (draft) {
      items.push({
        id: `${candidate.id}-file-draft`,
        path: candidate.path,
        scope: "File draft",
        body: draft,
      });
    }

    for (const comment of state?.inlineComments ?? []) {
      if (comment.visibility !== "review") {
        continue;
      }

      items.push({
        id: comment.id,
        path: candidate.path,
        scope: `Line comment - ${lineRangeLabel(comment)}`,
        body: comment.body,
      });
    }

    return items;
  });

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-[var(--rd-border)] bg-[var(--rd-bg-soft)]">
      <div className="border-b border-[var(--rd-border)] px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--rd-text)]">Inspector</div>
            <div className="mt-1 text-xs text-[var(--rd-muted)]">
              Notes stay private until promoted
            </div>
          </div>
          {file ? (
            <Badge
              className={`border ${statusTone(fileState?.status ?? file.viewedStatus)}`}
            >
              {fileState?.status ?? file.viewedStatus}
            </Badge>
          ) : null}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4">
          {file ? (
            <>
              <div className="rounded-lg border border-[var(--rd-border)] bg-[var(--rd-panel)] p-3 shadow-[inset_0_1px_0_rgba(255,236,190,0.035)]">
                <div className="text-xs text-[var(--rd-muted)]">Current file</div>
                <div className="mt-2 break-words text-sm font-medium text-[var(--rd-text)]">
                  {compactPath(file.path, 80)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge className="border-[var(--rd-sage-border)] bg-[var(--rd-sage-soft)] text-[var(--rd-sage)]">
                    +{file.additions}
                  </Badge>
                  <Badge className="border-[var(--rd-clay-border)] bg-[var(--rd-clay-soft)] text-[var(--rd-clay)]">
                    -{file.deletions}
                  </Badge>
                  <Badge className="border-[var(--rd-border)] bg-[var(--rd-bg)] text-[var(--rd-text-soft)]">
                    {file.changeKind}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-text-soft)] hover:border-[var(--rd-accent-border)] hover:bg-[var(--rd-panel-3)]"
                  onClick={onMarkViewed}
                >
                  <Eye className="size-4" />
                  Viewed
                </Button>
                <Button
                  type="button"
                  className="bg-[var(--rd-accent)] text-[var(--rd-ink)] hover:bg-[var(--rd-accent-strong)]"
                  onClick={onMarkReviewed}
                >
                  <CheckCircle2 className="size-4" />
                  Reviewed
                </Button>
              </div>

              <Tabs defaultValue="private" className="w-full">
                <TabsList className="grid w-full grid-cols-3 border border-[var(--rd-border)] bg-[var(--rd-panel)]">
                  <TabsTrigger value="private">
                    <NotebookPen className="size-3.5" />
                    Private
                  </TabsTrigger>
                  <TabsTrigger value="draft">
                    <MessageSquare className="size-3.5" />
                    Draft
                  </TabsTrigger>
                  <TabsTrigger value="agent">
                    <Bot className="size-3.5" />
                    Agent
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="private" className="mt-3">
                  <Textarea
                    value={fileState?.privateNote ?? ""}
                    onChange={(event) =>
                      onPatchFileState(file.id, {
                        privateNote: event.currentTarget.value,
                      })
                    }
                    placeholder="Notes for me. These never publish to GitHub."
                    className="min-h-36 resize-none border-[var(--rd-border)] bg-[var(--rd-bg)] text-sm text-[var(--rd-text)] placeholder:text-[var(--rd-faint)]"
                  />
                </TabsContent>

                <TabsContent value="draft" className="mt-3">
                  <Textarea
                    value={fileState?.publishableDraft ?? ""}
                    onChange={(event) =>
                      onPatchFileState(file.id, {
                        publishableDraft: event.currentTarget.value,
                      })
                    }
                    placeholder="Draft a publishable review comment."
                    className="min-h-36 resize-none border-[var(--rd-border)] bg-[var(--rd-bg)] text-sm text-[var(--rd-text)] placeholder:text-[var(--rd-faint)]"
                  />
                </TabsContent>

                <TabsContent value="agent" className="mt-3">
                  <div className="rounded-lg border border-[var(--rd-border)] bg-[var(--rd-bg)] p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--rd-text-soft)]">
                      <Bot className="size-4 text-[var(--rd-accent)]" />
                      {session.order.source === "agent"
                        ? session.order.createdBy ?? "Agent session"
                        : "No agent session"}
                    </div>
                    {file.reviewReason ? (
                      <p className="mt-2 text-xs leading-5 text-[var(--rd-text-soft)]">
                        {file.reviewReason}
                      </p>
                    ) : null}
                    {file.agentNotes.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {file.agentNotes.map((note, index) => (
                          <div
                            key={`${file.id}-agent-note-${index}`}
                            className="rounded-md border border-[var(--rd-border)] bg-[var(--rd-panel)] p-2"
                          >
                            <div className="text-[0.66rem] uppercase tracking-[0.12em] text-[var(--rd-faint)]">
                              {note.source ?? "agent note"}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-[var(--rd-muted)]">
                              {note.body}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-xs leading-5 text-[var(--rd-muted)]">
                        {session.order.source === "agent"
                          ? "No agent note for this file."
                          : "Import an agent manifest to see review rationale here."}
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <div className="rounded-lg border border-[var(--rd-border)] bg-[var(--rd-panel)] p-4 text-sm text-[var(--rd-muted)]">
              Select a file to inspect review state and notes.
            </div>
          )}

          <Separator className="bg-[var(--rd-border)]" />

          {session.order.warnings.length > 0 ? (
            <div className="rounded-lg border border-[var(--rd-clay-border)] bg-[var(--rd-clay-soft)] p-3">
              <div className="text-sm font-semibold text-[var(--rd-clay)]">
                Import warnings
              </div>
              <div className="mt-2 space-y-1.5">
                {session.order.warnings.slice(0, 5).map((warning, index) => (
                  <div
                    key={`${warning.path ?? "session"}-${index}`}
                    className="text-xs leading-5 text-[var(--rd-muted)]"
                  >
                    {warning.path ? `${compactPath(warning.path, 42)}: ` : ""}
                    {warning.message}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-[var(--rd-text)]">
                  Review Basket
                </div>
                <div className="mt-1 text-xs text-[var(--rd-muted)]">
                  Drafts staged for a future GitHub review
                </div>
              </div>
              <Badge className="border-[var(--rd-border)] bg-[var(--rd-panel-2)] text-[var(--rd-text-soft)]">
                {basket.length}
              </Badge>
            </div>

            <div className="mt-3 space-y-2">
              {basket.length > 0 ? (
                basket.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-[var(--rd-border)] bg-[var(--rd-bg)] p-3"
                  >
                    <div className="text-xs font-medium text-[var(--rd-text-soft)]">
                      {compactPath(item.path, 46)}
                    </div>
                    <div className="mt-1 text-[0.66rem] uppercase tracking-[0.12em] text-[var(--rd-faint)]">
                      {item.scope}
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--rd-muted)]">
                      {item.body}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--rd-border)] p-3 text-xs leading-5 text-[var(--rd-faint)]">
                  Publishable comments will collect here.
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-[var(--rd-border)] p-3">
        <Button
          type="button"
          className="w-full bg-[var(--rd-accent)] text-[var(--rd-ink)] hover:bg-[var(--rd-accent-strong)]"
          disabled={basket.length === 0}
        >
          <Send className="size-4" />
          Publish Review Later
        </Button>
      </div>
    </aside>
  );
}

type ReviewBasketItem = {
  id: string;
  path: string;
  scope: string;
  body: string;
};

function lineRangeLabel(
  comment: Pick<InlineComment, "side" | "startLine" | "endLine">,
) {
  const side = comment.side === "old" ? "old" : "new";
  if (!comment.startLine && !comment.endLine) {
    return `${side} line`;
  }
  if (comment.startLine === comment.endLine || !comment.endLine) {
    return `${side} line ${comment.startLine}`;
  }

  return `${side} lines ${comment.startLine}-${comment.endLine}`;
}
