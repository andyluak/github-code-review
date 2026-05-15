import { useCallback, useEffect, useState } from "react";

export type DiffViewMode = "split" | "unified";

const STORAGE_KEY = "rd:diffViewMode";
const DEFAULT_MODE: DiffViewMode = "split";

function readStoredMode(): DiffViewMode {
  if (typeof window === "undefined") {
    return DEFAULT_MODE;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "unified" || raw === "split" ? raw : DEFAULT_MODE;
}

export function useDiffViewMode(): [DiffViewMode, (next: DiffViewMode) => void, () => void] {
  const [mode, setModeState] = useState<DiffViewMode>(readStoredMode);

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) {
        return;
      }
      setModeState(readStoredMode());
    }
    function onCustom() {
      setModeState(readStoredMode());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("rd:diff-view-mode-change", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("rd:diff-view-mode-change", onCustom);
    };
  }, []);

  const setMode = useCallback((next: DiffViewMode) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("rd:diff-view-mode-change"));
    setModeState(next);
  }, []);

  const toggleMode = useCallback(() => {
    const next: DiffViewMode = readStoredMode() === "split" ? "unified" : "split";
    window.localStorage.setItem(STORAGE_KEY, next);
    window.dispatchEvent(new Event("rd:diff-view-mode-change"));
    setModeState(next);
  }, []);

  return [mode, setMode, toggleMode];
}
