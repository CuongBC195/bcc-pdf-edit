import { useCallback, useEffect, useState } from 'react';
import { resolveToolId } from '../catalog';

const FAVORITES_KEY = 'bcc_hub_favorites_v1';
const RECENT_KEY = 'bcc_hub_recent_v1';
const THEME_KEY = 'bccpdf_theme';
const MAX_RECENT = 12;
const PREFS_EVENT = 'bcc-hub-prefs-changed';

export type HubTheme = 'dark' | 'light';

function readJsonList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeJsonList(key: string, list: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    // Bỏ qua lỗi quota localStorage
  }
}

export function getHubTheme(): HubTheme {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setHubTheme(theme: HubTheme): void {
  try {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
    window.dispatchEvent(new Event(PREFS_EVENT));
  } catch {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

export function getFavoriteToolIds(): string[] {
  return readJsonList(FAVORITES_KEY);
}

export function toggleFavoriteTool(rawId: string): boolean {
  const id = resolveToolId(rawId);
  const current = getFavoriteToolIds();
  const exists = current.includes(id);
  const next = exists ? current.filter((item) => item !== id) : [id, ...current];
  writeJsonList(FAVORITES_KEY, next);
  return !exists;
}

export function getRecentToolIds(): string[] {
  return readJsonList(RECENT_KEY);
}

export function recordRecentTool(rawId: string): void {
  const id = resolveToolId(rawId);
  const current = getRecentToolIds().filter((item) => item !== id);
  writeJsonList(RECENT_KEY, [id, ...current].slice(0, MAX_RECENT));
}

export function clearRecentTools(): void {
  writeJsonList(RECENT_KEY, []);
}

export function useHubPreferences() {
  const [theme, setThemeState] = useState<HubTheme>(() => getHubTheme());
  const [favorites, setFavorites] = useState<string[]>(() => getFavoriteToolIds());
  const [recent, setRecent] = useState<string[]>(() => getRecentToolIds());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const sync = () => {
      setThemeState(getHubTheme());
      setFavorites(getFavoriteToolIds());
      setRecent(getRecentToolIds());
    };
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PREFS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggleTheme = useCallback(() => {
    setHubTheme(getHubTheme() === 'dark' ? 'light' : 'dark');
  }, []);

  const toggleFavorite = useCallback((toolId: string) => {
    toggleFavoriteTool(toolId);
  }, []);

  const recordVisit = useCallback((toolId: string) => {
    recordRecentTool(toolId);
  }, []);

  return {
    theme,
    toggleTheme,
    favorites,
    recent,
    toggleFavorite,
    recordVisit,
    clearRecent: clearRecentTools,
  };
}
