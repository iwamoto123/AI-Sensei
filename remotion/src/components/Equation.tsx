import React from "react";
import type { Role, RoleSpan } from "../ir/types";
import { renderTex } from "../ir/tex";

interface Props {
  tex: string;
  roleSpans?: RoleSpan[];
  palette: Record<Role, string>;
  fontSize?: number;
}

export const Equation: React.FC<Props> = ({ tex, roleSpans, palette, fontSize = 46 }) => {
  const html = renderTex(tex, roleSpans, palette);
  return (
    <span
      style={{ fontSize, color: palette.neutral, lineHeight: 1.2 }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
