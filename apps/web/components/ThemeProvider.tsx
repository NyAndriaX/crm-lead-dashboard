"use client";

/**
 * Fournisseur de thème : mode sombre / clair.
 *
 * Le mode est mémorisé dans un cookie (lu par le layout serveur → aucun flash au chargement)
 * et appliqué sur `<html data-theme>` (variables CSS) et sur l'Ant Design ConfigProvider (tokens).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConfigProvider } from "antd";
import frFR from "antd/locale/fr_FR";
import { buildTheme, THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import "@/lib/antdReact19";

type ThemeContextValue = { mode: ThemeMode; toggle: () => void; setMode: (m: ThemeMode) => void };

const ThemeContext = createContext<ThemeContextValue>({ mode: "dark", toggle: () => {}, setMode: () => {} });

export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function ThemeProvider({ initialMode, children }: { initialMode: ThemeMode; children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    document.documentElement.dataset.theme = m;
    document.cookie = `${THEME_COOKIE}=${m}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", m === "dark" ? "#060913" : "#f3f5fb");
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, toggle: () => setMode(mode === "dark" ? "light" : "dark") }),
    [mode, setMode],
  );
  const themeConfig = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider theme={themeConfig} locale={frFR}>
        {children}
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}
