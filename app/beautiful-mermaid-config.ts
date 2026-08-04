export const POLISHED_DIAGRAM_TYPE_IDS = new Set(["flowchart", "state", "sequence", "class", "er", "xychart"]);

export const POLISHED_THEME_OPTIONS = [
  ["mermade-auto", "Mermade — adapts to app"],
  ["zinc-light", "Zinc Light"],
  ["zinc-dark", "Zinc Dark"],
  ["tokyo-night", "Tokyo Night"],
  ["tokyo-night-storm", "Tokyo Night Storm"],
  ["tokyo-night-light", "Tokyo Night Light"],
  ["catppuccin-mocha", "Catppuccin Mocha"],
  ["catppuccin-latte", "Catppuccin Latte"],
  ["nord", "Nord"],
  ["nord-light", "Nord Light"],
  ["dracula", "Dracula"],
  ["github-light", "GitHub Light"],
  ["github-dark", "GitHub Dark"],
  ["solarized-light", "Solarized Light"],
  ["solarized-dark", "Solarized Dark"],
  ["one-dark", "One Dark"],
] as const;

export type PolishedTheme = typeof POLISHED_THEME_OPTIONS[number][0];

export type PolishedPaletteMode = "theme" | "custom";

export type BeautifulThemePreview = {
  bg: string;
  fg: string;
  accent: string;
  line?: string;
  muted?: string;
  surface?: string;
  border?: string;
};

export const POLISHED_THEME_PREVIEWS: Record<PolishedTheme, BeautifulThemePreview> = {
  "mermade-auto": { bg: "#fffdfa", fg: "#27232a", accent: "#e0095f" },
  "zinc-light": { bg: "#ffffff", fg: "#27272a", accent: "#71717a" },
  "zinc-dark": { bg: "#18181b", fg: "#f4f4f5", accent: "#a1a1aa" },
  "tokyo-night": { bg: "#1a1b26", fg: "#a9b1d6", line: "#3d59a1", accent: "#7aa2f7", muted: "#565f89" },
  "tokyo-night-storm": { bg: "#24283b", fg: "#a9b1d6", line: "#3d59a1", accent: "#7aa2f7", muted: "#565f89" },
  "tokyo-night-light": { bg: "#d5d6db", fg: "#343b58", line: "#34548a", accent: "#34548a", muted: "#9699a3" },
  "catppuccin-mocha": { bg: "#1e1e2e", fg: "#cdd6f4", line: "#585b70", accent: "#cba6f7", muted: "#6c7086" },
  "catppuccin-latte": { bg: "#eff1f5", fg: "#4c4f69", line: "#9ca0b0", accent: "#8839ef", muted: "#9ca0b0" },
  nord: { bg: "#2e3440", fg: "#d8dee9", line: "#4c566a", accent: "#88c0d0", muted: "#616e88" },
  "nord-light": { bg: "#eceff4", fg: "#2e3440", line: "#aab1c0", accent: "#5e81ac", muted: "#7b88a1" },
  dracula: { bg: "#282a36", fg: "#f8f8f2", line: "#6272a4", accent: "#bd93f9", muted: "#6272a4" },
  "github-light": { bg: "#ffffff", fg: "#1f2328", line: "#d1d9e0", accent: "#0969da", muted: "#59636e" },
  "github-dark": { bg: "#0d1117", fg: "#e6edf3", line: "#3d444d", accent: "#4493f8", muted: "#9198a1" },
  "solarized-light": { bg: "#fdf6e3", fg: "#657b83", line: "#93a1a1", accent: "#268bd2", muted: "#93a1a1" },
  "solarized-dark": { bg: "#002b36", fg: "#839496", line: "#586e75", accent: "#268bd2", muted: "#586e75" },
  "one-dark": { bg: "#282c34", fg: "#abb2bf", line: "#4b5263", accent: "#c678dd", muted: "#5c6370" },
};

export type PolishedCustomColours = {
  bg: string;
  fg: string;
  line: string;
  accent: string;
  muted: string;
  surface: string;
  border: string;
};

export type PolishedStyle = {
  styleModel: 4;
  theme: PolishedTheme;
  paletteMode: PolishedPaletteMode;
  customColours: PolishedCustomColours;
  font: string;
  padding: number;
  nodeSpacing: number;
  layerSpacing: number;
  componentSpacing: number;
  transparent: boolean;
  respectSourceStyles: boolean;
  interactive: boolean;
};

export const DEFAULT_POLISHED_STYLE: PolishedStyle = {
  styleModel: 4,
  theme: "mermade-auto",
  paletteMode: "theme",
  customColours: {
    bg: "#fffdfa",
    fg: "#27232a",
    line: "#77737f",
    accent: "#e0095f",
    muted: "#8a6373",
    surface: "#fde8f1",
    border: "#d8bdc8",
  },
  font: "Inter",
  padding: 40,
  nodeSpacing: 28,
  layerSpacing: 48,
  componentSpacing: 36,
  transparent: true,
  respectSourceStyles: false,
  interactive: true,
};

const MERMADE_ADAPTIVE_THEME = {
  bg: "var(--mermade-polished-bg, #fffdfa)",
  fg: "var(--mermade-polished-fg, #27232a)",
} as const;

export type BeautifulThemeColours = {
  bg: string;
  fg: string;
  line?: string;
  accent?: string;
  muted?: string;
  surface?: string;
  border?: string;
};

export type BeautifulTextRoles = {
  primary: string;
  secondary: string;
  muted: string;
  faint: string;
};

function colourChannels(colour: string) {
  const value = colour.trim();
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return rgb ? rgb.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel)))) : null;
}

function relativeLuminance(channels: number[]) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first: number[], second: number[]) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

/** Retain a theme's hue when possible while guaranteeing readable small text. */
export function accessiblePolishedTextColour(foreground: string, background: string, minimumRatio = 4.5) {
  const foregroundChannels = colourChannels(foreground);
  const backgroundChannels = colourChannels(background);
  if (!foregroundChannels || !backgroundChannels || contrastRatio(foregroundChannels, backgroundChannels) >= minimumRatio) return foreground;

  const black = [0, 0, 0];
  const white = [255, 255, 255];
  const target = contrastRatio(black, backgroundChannels) >= contrastRatio(white, backgroundChannels) ? black : white;
  let low = 0;
  let high = 1;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const amount = (low + high) / 2;
    const candidate = foregroundChannels.map((channel, index) => channel + (target[index] - channel) * amount);
    if (contrastRatio(candidate, backgroundChannels) >= minimumRatio) high = amount;
    else low = amount;
  }
  return `#${foregroundChannels.map((channel, index) => Math.round(channel + (target[index] - channel) * high).toString(16).padStart(2, "0")).join("")}`;
}

function mixPolishedColour(foreground: string, background: string, percentage: number) {
  const foregroundChannels = colourChannels(foreground);
  const backgroundChannels = colourChannels(background);
  if (!foregroundChannels || !backgroundChannels) return foreground;
  const amount = percentage / 100;
  return `#${foregroundChannels.map((channel, index) => Math.round(channel * amount + backgroundChannels[index] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Follow Beautiful Mermaid's four semantic text tiers while keeping every
 * tier readable. Muted palette hues remain visually distinct from primary
 * node copy instead of being flattened to one universal foreground colour.
 */
export function polishedTextRoles(theme: BeautifulThemeColours): BeautifulTextRoles {
  const primary = accessiblePolishedTextColour(theme.fg, theme.bg);
  if (!colourChannels(theme.fg) || !colourChannels(theme.bg)) {
    return { primary, secondary: primary, muted: primary, faint: primary };
  }
  const secondaryBase = theme.muted || mixPolishedColour(theme.fg, theme.bg, 60);
  const mutedBase = theme.muted || mixPolishedColour(theme.fg, theme.bg, 40);
  const faintBase = mixPolishedColour(theme.fg, theme.bg, 25);
  return {
    primary,
    secondary: accessiblePolishedTextColour(secondaryBase, theme.bg),
    muted: accessiblePolishedTextColour(mutedBase, theme.bg),
    faint: accessiblePolishedTextColour(faintBase, theme.bg),
  };
}

const LEGACY_DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

type StoredPolishedStyle = Omit<Partial<PolishedStyle>, "styleModel"> & { styleModel?: number };

/** Migrate earlier Beautiful settings models without loading their renderer. */
export function normalisePolishedStyle(style?: StoredPolishedStyle): PolishedStyle {
  const keepsExplicitSourcePreference = style?.styleModel === 4;
  return {
    ...DEFAULT_POLISHED_STYLE,
    ...style,
    styleModel: 4,
    paletteMode: style?.paletteMode || DEFAULT_POLISHED_STYLE.paletteMode,
    customColours: { ...DEFAULT_POLISHED_STYLE.customColours, ...style?.customColours },
    font: !style?.font || style.font === LEGACY_DEFAULT_FONT ? DEFAULT_POLISHED_STYLE.font : style.font,
    respectSourceStyles: keepsExplicitSourcePreference
      ? (style?.respectSourceStyles ?? DEFAULT_POLISHED_STYLE.respectSourceStyles)
      : DEFAULT_POLISHED_STYLE.respectSourceStyles,
  };
}

export function themeForPolishedRenderer(theme: PolishedTheme, themes: Record<string, BeautifulThemeColours>): BeautifulThemeColours {
  return theme === "mermade-auto" ? MERMADE_ADAPTIVE_THEME : (themes[theme] || MERMADE_ADAPTIVE_THEME);
}

export function supportsPolishedDiagram(diagramTypeId: string) {
  return POLISHED_DIAGRAM_TYPE_IDS.has(diagramTypeId);
}
