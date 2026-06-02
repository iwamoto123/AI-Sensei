import React from "react";
import { AbsoluteFill } from "remotion";
import type { Role } from "../ir/types";

interface Props {
  text: string;
  palette: Record<Role, string>;
}

export const Callout: React.FC<Props> = ({ text, palette }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", paddingBottom: 70 }}>
      <div
        style={{
          background: "#f3f4f6",
          border: `2px solid ${palette.accent}`,
          borderRadius: 12,
          padding: "16px 28px",
          fontSize: 28,
          fontWeight: 700,
          color: palette.neutral,
          maxWidth: 1040,
          textAlign: "center",
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
