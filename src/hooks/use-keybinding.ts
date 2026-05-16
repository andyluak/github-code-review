import { useEffect } from "react";

export type Binding = {
  combo: string;
  handler: (e: KeyboardEvent) => void;
};

function matches(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+");
  const key = parts.pop()!;
  const need = new Set(parts.map((p) => p.toLowerCase()));
  const wantsMeta = need.has("cmd") || need.has("meta");
  const wantsCtrl = need.has("ctrl");
  const wantsShift = need.has("shift");
  const wantsAlt = need.has("alt") || need.has("option");
  if (wantsMeta !== (e.metaKey || e.ctrlKey)) return false;
  if (wantsCtrl && !e.ctrlKey) return false;
  if (wantsShift !== e.shiftKey) return false;
  if (wantsAlt !== e.altKey) return false;
  if (key === "Enter" || key === "↩") return e.key === "Enter";
  return e.key.toLowerCase() === key.toLowerCase();
}

export function useKeybinding(bindings: Binding[]): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable);
      for (const b of bindings) {
        if (!matches(e, b.combo)) continue;
        if (editing && !b.combo.toLowerCase().includes("cmd")) continue;
        e.preventDefault();
        b.handler(e);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings]);
}
