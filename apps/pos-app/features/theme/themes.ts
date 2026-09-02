export interface ThemeDef {
  id:           string;
  name:         string;
  primary:      string;
  secondary:    string;
  primaryBg:    string;
  secondaryBg:  string;
}

// "Amber Roast" — 10 tones along one warm amber/espresso hue, dark-roast to
// light-roast, replacing the old zero-hue grayscale ladder. Same ids/count/
// ordering as before (only the hex values changed) so a staff member's saved
// theme_id keeps pointing at the same relative shade.
export const THEMES: ThemeDef[] = [
  { id: "onyx",   name: "Onyx",   primary: "#402d11", secondary: "#19110a", primaryBg: "rgba(64,45,17,0.14)",    secondaryBg: "rgba(25,17,10,0.14)"   },
  { id: "slate",  name: "Slate",  primary: "#62451a", secondary: "#302012", primaryBg: "rgba(98,69,26,0.14)",    secondaryBg: "rgba(48,32,18,0.14)"   },
  { id: "iron",   name: "Iron",   primary: "#835c22", secondary: "#462f1a", primaryBg: "rgba(131,92,34,0.14)",   secondaryBg: "rgba(70,47,26,0.14)"   },
  { id: "steel",  name: "Steel",  primary: "#a5742b", secondary: "#5c3e23", primaryBg: "rgba(165,116,43,0.14)",  secondaryBg: "rgba(92,62,35,0.14)"   },
  { id: "ash",    name: "Ash",    primary: "#c68b34", secondary: "#734e2b", primaryBg: "rgba(198,139,52,0.14)",  secondaryBg: "rgba(115,78,43,0.14)"  },
  { id: "smoke",  name: "Smoke",  primary: "#e8a33d", secondary: "#8b5e34", primaryBg: "rgba(232,163,61,0.14)",  secondaryBg: "rgba(139,94,52,0.14)"  },
  { id: "pewter", name: "Pewter", primary: "#ecb35e", secondary: "#99724d", primaryBg: "rgba(236,179,94,0.14)",  secondaryBg: "rgba(153,114,77,0.14)" },
  { id: "fog",    name: "Fog",    primary: "#f0c37f", secondary: "#a88666", primaryBg: "rgba(240,195,127,0.14)", secondaryBg: "rgba(168,134,102,0.14)"},
  { id: "mist",   name: "Mist",   primary: "#f4d2a0", secondary: "#b69a80", primaryBg: "rgba(244,210,160,0.14)", secondaryBg: "rgba(182,154,128,0.14)"},
  { id: "silver", name: "Silver", primary: "#f8e1c0", secondary: "#c5ae99", primaryBg: "rgba(248,225,192,0.14)", secondaryBg: "rgba(197,174,153,0.14)"},
];

export const DEFAULT_THEME_ID = "smoke";
export const getTheme = (id: string): ThemeDef => THEMES.find(t => t.id === id) ?? THEMES[0];
