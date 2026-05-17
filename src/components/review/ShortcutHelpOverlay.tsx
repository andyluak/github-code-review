import type { Binding } from "@/hooks/use-keybinding";
import { SlabButton } from "@/components/ui/slab-button";

type Props = {
  open: boolean;
  shortcuts: Binding[];
  singleKeyShortcutsEnabled: boolean;
  onSingleKeyShortcutsChange: (enabled: boolean) => void;
  onClose: () => void;
};

export function ShortcutHelpOverlay({
  open,
  shortcuts,
  singleKeyShortcutsEnabled,
  onSingleKeyShortcutsChange,
  onClose,
}: Props) {
  if (!open) return null;

  const groups = groupShortcuts(shortcuts);

  return (
    <div className="fixed inset-0 z-50 bg-black/55 p-6 text-[var(--rd-cream)]">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        className="mx-auto flex h-full max-h-[720px] w-full max-w-[760px] flex-col border border-[var(--rd-hair-2)] bg-[var(--rd-ink)] shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--rd-hair)] px-5 py-4">
          <div>
            <h2
              id="shortcut-help-title"
              className="rd-display-italic text-[18px] leading-none text-[var(--rd-cream)]"
            >
              Keyboard shortcuts
            </h2>
            <p className="mt-2 max-w-[56ch] text-[12px] leading-5 text-[var(--rd-pencil)]">
              Review shortcuts pause while you type in filters, comments, source
              editors, or publish fields. Use Escape to leave those surfaces.
            </p>
          </div>
          <SlabButton size="compact" onClick={onClose} aria-label="Close shortcuts">
            close
          </SlabButton>
        </header>

        <div className="shrink-0 border-b border-[var(--rd-hair)] px-5 py-3">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block font-mono text-[11px] text-[var(--rd-cream-2)]">
                Single-key review shortcuts
              </span>
              <span className="mt-1 block text-[11px] leading-4 text-[var(--rd-pencil)]">
                Turn this off if single letters interfere with dictation or
                keyboard habits. Function-key help stays available.
              </span>
            </span>
            <input
              type="checkbox"
              checked={singleKeyShortcutsEnabled}
              onChange={(event) => onSingleKeyShortcutsChange(event.currentTarget.checked)}
              className="size-4 accent-[var(--rd-vermillion)]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {groups.map((group) => (
            <section key={group.name} className="mb-5 last:mb-0">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--rd-pencil)]">
                {group.name}
              </h3>
              <div className="divide-y divide-[var(--rd-hair)] border border-[var(--rd-hair)]">
                {group.items.map((item) => (
                  <div
                    key={`${group.name}-${item.combo}-${item.label}`}
                    className="grid grid-cols-[130px_1fr] items-center gap-4 px-3 py-2"
                  >
                    <kbd className="w-fit bg-[var(--rd-ink-2)] px-2 py-1 font-mono text-[11px] text-[var(--rd-cream-2)]">
                      {formatCombo(item.combo)}
                    </kbd>
                    <span className="text-[12px] text-[var(--rd-cream-2)]">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

function groupShortcuts(shortcuts: Binding[]) {
  const map = new Map<string, Binding[]>();
  for (const shortcut of shortcuts) {
    if (!shortcut.label) continue;
    const group = shortcut.group ?? "General";
    map.set(group, [...(map.get(group) ?? []), shortcut]);
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
}

function formatCombo(combo: string) {
  return combo
    .replace(/cmd/g, "Cmd")
    .replace(/mod/g, "Cmd/Ctrl")
    .replace(/Escape/g, "Esc")
    .replace(/Slash/g, "/")
    .replace(/\+/g, " + ");
}
