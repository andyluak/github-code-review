import { Folder, GitBranch, GitCommitHorizontal, GitCompare, GitPullRequest } from "lucide-react";
import type { ReviewTargetKind } from "@/types/review";

const TABS: { value: ReviewTargetKind; label: string; icon: React.ReactNode }[] = [
  { value: "workingTree", label: "Working", icon: <Folder className="size-3" /> },
  { value: "branch",      label: "Branch",  icon: <GitBranch className="size-3" /> },
  { value: "commit",      label: "Commit",  icon: <GitCommitHorizontal className="size-3" /> },
  { value: "commitRange", label: "Range",   icon: <GitCompare className="size-3" /> },
  { value: "pullRequest", label: "PR",      icon: <GitPullRequest className="size-3" /> },
];

export function TargetModeTabs({
  value,
  onChange,
  disabled,
}: {
  value: ReviewTargetKind;
  onChange: (next: ReviewTargetKind) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-1 border-b border-[var(--rd-hair)] bg-[var(--rd-ink)] p-1">
      {TABS.map((tab) => (
        <button
          key={tab.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(tab.value)}
          className={[
            "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[10.5px]",
            value === tab.value
              ? "bg-[var(--rd-vermillion-bg)] text-[var(--rd-vermillion-2)]"
              : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]",
          ].join(" ")}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
