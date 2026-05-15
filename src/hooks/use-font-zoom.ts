import { useEffect, useState } from "react";

const STORAGE_KEY = "review-desk.font-zoom";
const MIN_ZOOM = 0.78;
const MAX_ZOOM = 1.26;
const STEP = 0.06;

export function useFontZoom() {
  const [fontZoom, setFontZoom] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? Number.parseFloat(saved) : 1;
    return Number.isFinite(parsed) ? clampZoom(parsed) : 1;
  });

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      fontZoom.toFixed(2),
    );
    window.localStorage.setItem(STORAGE_KEY, fontZoom.toFixed(2));
  }, [fontZoom]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        setFontZoom((current) => clampZoom(current + STEP));
      }

      if (event.key === "-") {
        event.preventDefault();
        setFontZoom((current) => clampZoom(current - STEP));
      }

      if (event.key === "0") {
        event.preventDefault();
        setFontZoom(1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return {
    fontZoom,
    resetFontZoom: () => setFontZoom(1),
  };
}

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
