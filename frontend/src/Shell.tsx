import { useEffect, useLayoutEffect, useState } from "react";
import type { ReactNode } from "react";
import { Context } from "./shellContext";
import type { Palette, SettingsSection } from "./shellContext";
export function ShellProvider({ children }: { children: ReactNode }) {
  const [total, setTotal] = useState<number | null>(null);
  const [left, setLeft] = useState(true),
    [right, setRight] = useState(false);
  const [settings, setSettings] = useState<SettingsSection | null>(null);
  const [section, setSection] = useState<"info" | "description">("info");
  const [favorites, setFavorites] = useState(false);
  const [navImport, setNavImport] = useState<HTMLElement | null>(null),
    [navTools, setNavTools] = useState<HTMLElement | null>(null);
  const [palette, setPalette] = useState<Palette>(() => {
    try {
      const p = localStorage.getItem("beat-m-palette");
      return ["sobre", "lin", "sauge", "brume"].includes(p || "")
        ? (p as Palette)
        : "sobre";
    } catch {
      return "sobre";
    }
  });
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem("beat-m-mode") === "dark";
    } catch {
      return false;
    }
  });
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.palette = palette;
    root.dataset.mode = dark ? "dark" : "light";
    root.style.setProperty("--nav-width", left ? "256px" : "80px");
    root.style.setProperty("--detail-width", right ? "384px" : "72px");
  }, [palette, dark, left, right]);
  useEffect(() => {
    try {
      localStorage.setItem("beat-m-palette", palette);
      localStorage.setItem("beat-m-mode", dark ? "dark" : "light");
    } catch {
      /* Optional machine preference. */
    }
  }, [palette, dark]);
  return (
    <Context
      value={{
        total,
        setTotal,
        left,
        setLeft,
        right,
        setRight,
        settings,
        setSettings,
        section,
        setSection,
        palette,
        setPalette,
        dark,
        setDark,
        favorites,
        setFavorites,
        navImport,
        setNavImport,
        navTools,
        setNavTools,
      }}
    >
      {children}
    </Context>
  );
}
export function PaneIcon({
  side,
  open,
}: {
  side: "left" | "right";
  open: boolean;
}) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x={side === "left" ? 6 : 14.5}
        y="7"
        width="3.5"
        height="10"
        rx="1"
        fill={open ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={open ? 0 : 1.2}
      />
    </svg>
  );
}
