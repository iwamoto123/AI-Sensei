import React from "react";
import type { Role } from "../ir/types";

interface Props {
  title: string;
  palette: Record<Role, string>;
}

export const SceneChip: React.FC<Props> = ({ title, palette }) => {
  return (
    <div
      style={{
        position: "absolute",
        top: 44,
        left: 56,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ width: 8, height: 30, background: palette.focus, borderRadius: 4 }} />
      <span style={{ fontSize: 26, fontWeight: 800, color: palette.neutral, letterSpacing: 2 }}>{title}</span>
    </div>
  );
};
