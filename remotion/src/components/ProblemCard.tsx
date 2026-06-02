import React from "react";
import { AbsoluteFill } from "remotion";
import type { Role } from "../ir/types";
import { Equation } from "./Equation";

interface Props {
  title: string;
  items: string[];
  palette: Record<Role, string>;
}

export const ProblemCard: React.FC<Props> = ({ title, items, palette }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          minWidth: 760,
          maxWidth: 1000,
          border: `2px solid ${palette.neutral}`,
          borderRadius: 14,
          padding: "44px 56px",
          position: "relative",
          background: "#ffffff",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -20,
            left: 40,
            background: palette.focus,
            color: "#fff",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 2,
            padding: "6px 18px",
            borderRadius: 8,
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", marginTop: 8 }}>
          {items.map((tex, i) => (
            <Equation key={i} tex={tex} palette={palette} fontSize={48} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
