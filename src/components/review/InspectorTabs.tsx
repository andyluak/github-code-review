export type InspectorTab = "notes" | "conversations" | "activity";

export function InspectorTabs({
  tab,
  show,
  onChange,
}: {
  tab: InspectorTab;
  show: { conversations: boolean; activity: boolean };
  onChange: (tab: InspectorTab) => void;
}) {
  const tabs: InspectorTab[] = ["notes"];
  if (show.conversations) tabs.push("conversations");
  if (show.activity) tabs.push("activity");
  return (
    <nav className="flex shrink-0 gap-3 border-b border-[var(--rd-hair)] px-4 py-2 font-mono text-[11px]">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={
            tab === t
              ? "text-[var(--rd-vermillion-2)]"
              : "text-[var(--rd-pencil)] hover:text-[var(--rd-cream)]"
          }
        >
          {labelFor(t)}
        </button>
      ))}
    </nav>
  );
}

function labelFor(t: InspectorTab): string {
  switch (t) {
    case "notes":
      return "Notes & drafts";
    case "conversations":
      return "Conversations";
    case "activity":
      return "Activity";
  }
}
