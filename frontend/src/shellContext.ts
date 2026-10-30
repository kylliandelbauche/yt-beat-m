import { createContext, useContext } from "react";
export type Palette = "sobre" | "lin" | "sauge" | "brume";
export type SettingsSection = "diagnostic" | "library" | "themes";
type Shell = {
  total: number | null;
  setTotal: (value: number | null) => void;
  left: boolean;
  setLeft: (value: boolean) => void;
  right: boolean;
  setRight: (value: boolean) => void;
  settings: SettingsSection | null;
  setSettings: (value: SettingsSection | null) => void;
  section: "info" | "description";
  setSection: (value: "info" | "description") => void;
  palette: Palette;
  setPalette: (value: Palette) => void;
  dark: boolean;
  setDark: (value: boolean) => void;
  favorites: boolean;
  setFavorites: (value: boolean) => void;
  navImport: HTMLElement | null;
  setNavImport: (el: HTMLElement | null) => void;
  navTools: HTMLElement | null;
  setNavTools: (el: HTMLElement | null) => void;
};
export const Context = createContext<Shell | null>(null);
export function useShell() {
  const shell = useContext(Context);
  if (!shell) throw new Error("Shell manquant");
  return shell;
}
