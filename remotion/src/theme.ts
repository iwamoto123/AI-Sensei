import type { LessonDesign, Role } from "./ir/types";

export interface Theme {
  background: string;
  palette: Record<Role, string>;
  fontFamily: string;
}

const DEFAULT_PALETTE: Record<Role, string> = {
  neutral: "#111827",
  focus: "#dc2626",
  group: "#b45309",
  result: "#15803d",
  accent: "#2563eb",
};

export function resolveTheme(design?: LessonDesign): Theme {
  return {
    background: design?.background ?? "#ffffff",
    palette: { ...DEFAULT_PALETTE, ...(design?.palette ?? {}) },
    fontFamily:
      '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, -apple-system, sans-serif',
  };
}
