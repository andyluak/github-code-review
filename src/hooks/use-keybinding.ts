import { useEffect } from "react";

export type Binding = {
  combo: string;
  label?: string;
  group?: string;
  disabled?: boolean;
  allowInTextEntry?: boolean;
  allowRepeat?: boolean;
  handler: (e: KeyboardEvent) => void;
};

type KeybindingOptions = {
  disabled?: boolean;
  singleKeyShortcutsEnabled?: boolean;
};

export function matchesShortcut(e: KeyboardEvent, combo: string): boolean {
  const parts = combo.split("+").map((part) => part.trim()).filter(Boolean);
  const key = parts.pop()!;
  const need = new Set(parts.map((p) => p.toLowerCase()));
  const wantsPrimary = need.has("cmd") || need.has("meta") || need.has("mod");
  const wantsCtrl = need.has("ctrl");
  const wantsShift = need.has("shift");
  const wantsAlt = need.has("alt") || need.has("option");
  if (wantsPrimary !== (e.metaKey || e.ctrlKey)) return false;
  if (wantsCtrl && !e.ctrlKey) return false;
  if (wantsShift && !e.shiftKey) return false;
  if (wantsAlt !== e.altKey) return false;
  if (!wantsPrimary && !wantsCtrl && e.ctrlKey) return false;
  if (!wantsPrimary && e.metaKey) return false;
  if (!wantsAlt && e.altKey) return false;
  if (key === "Enter" || key === "↩") return e.key === "Enter";
  if (key === "Escape" || key === "Esc") return e.key === "Escape";
  if (key === "Space") return e.key === " ";
  if (key === "Slash") return e.key === "/";
  if (key === "Backslash") return e.key === "\\";
  if (!wantsShift && e.shiftKey && /^[a-z]$/i.test(key)) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

export function useKeybinding(
  bindings: Binding[],
  options: KeybindingOptions = {},
): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (options.disabled || e.defaultPrevented || e.isComposing) return;
      const editing = isShortcutTextEntryTarget(e.target);
      for (const b of bindings) {
        if (b.disabled) continue;
        if (e.repeat && !b.allowRepeat) continue;
        if (
          options.singleKeyShortcutsEnabled === false &&
          isSingleCharacterShortcut(b.combo)
        ) {
          continue;
        }
        if (!matchesShortcut(e, b.combo)) continue;
        if (editing && !b.allowInTextEntry) continue;
        e.preventDefault();
        b.handler(e);
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bindings, options.disabled, options.singleKeyShortcutsEnabled]);
}

export function isShortcutTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      [
        "input",
        "textarea",
        "select",
        "[contenteditable='']",
        "[contenteditable='true']",
        "[role='textbox']",
        "[role='searchbox']",
        "[role='combobox']",
        "[data-shortcut-scope='text-entry']",
      ].join(","),
    ),
  );
}

export function isSingleCharacterShortcut(combo: string): boolean {
  const parts = combo.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 1) return false;
  const key = parts[0];
  return key.length === 1 || key === "Slash" || key === "Backslash";
}
