import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useWindowDimensions, useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { makeBaseTokens, Mode, makeFontSizes, FontSizes } from "./tokens";
import { THEMES, ThemeDef, DEFAULT_THEME_ID, getTheme } from "./themes";

const STORAGE_KEY      = "pos_theme_id";
const FONT_STORAGE_KEY = "pos_font_scale";
const MODE_STORAGE_KEY = "pos_mode";

export type ColorTokens = ReturnType<typeof makeBaseTokens>;

function buildC(theme: ThemeDef, mode: Mode): ColorTokens {
  return {
    ...makeBaseTokens(mode),
    amber:   theme.primary,
    rust:    theme.secondary,
    amberBg: theme.primaryBg,
    rustBg:  theme.secondaryBg,
  };
}

interface ThemeCtx {
  C:            ColorTokens;
  FS:           FontSizes;
  fontScale:    number;
  themeId:      string;
  themes:       ThemeDef[];
  mode:         Mode;
  setThemeId:   (id: string) => Promise<void>;
  setFontScale: (scale: number) => Promise<void>;
  setMode:      (mode: Mode) => Promise<void>;
}

const DEFAULT_SCALE = 1;
const DEFAULT_MODE: Mode = "dark";

const ThemeContext = createContext<ThemeCtx>({
  C:            buildC(getTheme(DEFAULT_THEME_ID), DEFAULT_MODE),
  FS:           makeFontSizes(DEFAULT_SCALE),
  fontScale:    DEFAULT_SCALE,
  themeId:      DEFAULT_THEME_ID,
  themes:       THEMES,
  mode:         DEFAULT_MODE,
  setThemeId:   async () => {},
  setFontScale: async () => {},
  setMode:      async () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId,   setThemeId]   = useState(DEFAULT_THEME_ID);
  const [fontScale, setFontScale] = useState(DEFAULT_SCALE);
  // System scheme is only the fallback for a first-ever launch — once the
  // staff member picks a mode explicitly, that choice sticks (see below).
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<Mode>(DEFAULT_MODE);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved && THEMES.some(t => t.id === saved)) setThemeId(saved);
    });
    AsyncStorage.getItem(FONT_STORAGE_KEY).then((saved) => {
      const n = saved ? Number.parseFloat(saved) : Number.NaN;
      if (!Number.isNaN(n) && n > 0) setFontScale(n);
    });
    AsyncStorage.getItem(MODE_STORAGE_KEY).then((saved) => {
      if (saved === "light" || saved === "dark") setModeState(saved);
      else if (systemScheme === "light") setModeState("light");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSetThemeId = useCallback(async (id: string) => {
    setThemeId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const handleSetFontScale = useCallback(async (scale: number) => {
    setFontScale(scale);
    await AsyncStorage.setItem(FONT_STORAGE_KEY, String(scale));
  }, []);

  const handleSetMode = useCallback(async (next: Mode) => {
    setModeState(next);
    await AsyncStorage.setItem(MODE_STORAGE_KEY, next);
  }, []);

  // Viewport-driven scale boost on small screens — combines with user preference.
  // Compact phones (<400px) get +15%, normal phones (<600px) get +8%, tablets unchanged.
  const { width } = useWindowDimensions();
  const viewportBoost = width < 400 ? 1.15 : width < 600 ? 1.08 : 1.0;
  const effectiveScale = fontScale * viewportBoost;

  const value = useMemo<ThemeCtx>(() => ({
    C:            buildC(getTheme(themeId), mode),
    FS:           makeFontSizes(effectiveScale),
    fontScale,
    themeId,
    themes:       THEMES,
    mode,
    setThemeId:   handleSetThemeId,
    setFontScale: handleSetFontScale,
    setMode:      handleSetMode,
  }), [themeId, fontScale, effectiveScale, mode, handleSetThemeId, handleSetFontScale, handleSetMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
