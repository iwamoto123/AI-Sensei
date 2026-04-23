import type { Explanation } from "@/lib/types";
import {
  type SemanticRole,
  ROLE_VOCABULARY,
  SEEK_KEYWORDS,
  ANGLE_VALUE_RE,
  CONTEXT_OBJECTS,
} from "@/lib/visual/semantic/vocabulary";

export interface ExtractedQuantity {
  label: string;
  value: number | null;
  unit: string | null;
  role: SemanticRole;
  isKnown: boolean;
  source_text: string;
}

export interface SemanticExtraction {
  quantities: ExtractedQuantity[];
  seekTarget: SemanticRole | null;
  contextLabel: { label: string; role: SemanticRole } | null;
}

/**
 * explanation のテキストから既知量・未知量・角度・文脈語を抽出する。
 *
 * 前回との差分:
 * - 値→キーワード方向ではなく、**キーワード→値方向**で探索する
 * - これにより、値が誤った辺に配置される問題を防ぐ
 */
export function extractSemantics(explanation: Explanation): SemanticExtraction {
  const problemText = explanation.problem_summary;
  const reasoningText = [
    explanation.problem_summary,
    explanation.solution_outline,
    explanation.why_this_method,
  ].join(" ");

  const quantities: ExtractedQuantity[] = [];
  const matchedRoles = new Set<SemanticRole>();

  // 1. 角度抽出
  const angleMatches = [...reasoningText.matchAll(ANGLE_VALUE_RE)];
  if (angleMatches.length > 0) {
    const first = angleMatches[0];
    quantities.push({
      label: "角度",
      value: Number(first[1]),
      unit: "degree",
      role: "angle",
      isKnown: true,
      source_text: first[0],
    });
    matchedRoles.add("angle");
  }

  // 2. キーワード→値方向で探索（辺のみ。角度は上で処理済み）
  const edgeRoles: SemanticRole[] = [
    "horizontal_distance",
    "vertical_distance",
    "slope_distance",
  ];

  for (const role of edgeRoles) {
    const keywords = ROLE_VOCABULARY[role];
    const result = findValueForKeyword(problemText, keywords);

    if (result) {
      quantities.push({
        label: result.keyword,
        value: result.value,
        unit: result.unit,
        role,
        isKnown: true,
        source_text: result.vicinity,
      });
      matchedRoles.add(role);
    }
  }

  // 3. 数値が紐づかなかった語彙キーワード → 未知量
  for (const role of edgeRoles) {
    if (matchedRoles.has(role)) continue;

    for (const kw of ROLE_VOCABULARY[role]) {
      if (reasoningText.includes(kw)) {
        quantities.push({
          label: kw,
          value: null,
          unit: null,
          role,
          isKnown: false,
          source_text: kw,
        });
        matchedRoles.add(role);
        break;
      }
    }
  }

  // 4. seek target 判定
  const seekTarget = detectSeekTarget(reasoningText, quantities);

  // 5. 文脈語抽出
  const contextLabel = extractContextLabel(reasoningText);

  return { quantities, seekTarget, contextLabel };
}

/**
 * キーワード→値方向の探索。
 * キーワードの出現位置を見つけ、その近傍（前後50文字）に数値+単位があれば紐づける。
 * 複数キーワードが同じ値を狙う場合、最も近いものを優先。
 */
function findValueForKeyword(
  text: string,
  keywords: string[]
): { keyword: string; value: number; unit: string; vicinity: string } | null {
  for (const kw of keywords) {
    const escaped = escapeRegExp(kw);
    const patterns = [
      new RegExp(`(${escaped})\\s*(?:は|が|を|で|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(m|cm|km|メートル)`),
      new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(m|cm|km|メートル)\\s*の\\s*(${escaped})`),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (!match) continue;

      const keyword = match[1] === kw ? kw : match[3];
      const value = match[1] === kw ? Number(match[2]) : Number(match[1]);
      const unit = match[1] === kw ? match[3] : match[2];
      return {
          keyword,
          value,
          unit,
          vicinity: match[0].trim(),
        };
    }
  }

  // パターン一致がない場合だけ、キーワード直後の短い範囲に限定して数値を探す。
  for (const kw of keywords) {
    const kwIdx = text.indexOf(kw);
    if (kwIdx === -1) continue;

    const vicinity = text.slice(kwIdx, kwIdx + kw.length + 20);
    const match = /(\d+(?:\.\d+)?)\s*(m|cm|km|メートル)/.exec(vicinity);
    if (match) {
      return {
        keyword: kw,
        value: Number(match[1]),
        unit: match[2],
        vicinity: vicinity.trim(),
      };
    }
  }

  return null;
}

/**
 * seek target の判定。
 * 1. 「求め」系キーワード近傍の語彙マッチ
 * 2. フォールバック: 値が紐づいていない辺
 */
function detectSeekTarget(
  text: string,
  quantities: ExtractedQuantity[]
): SemanticRole | null {
  const seekCandidates: Array<{ role: SemanticRole; score: number }> = [];

  // 「求め」系キーワードの近傍で、最も近い語彙を優先する
  for (const seekKw of SEEK_KEYWORDS) {
    const idx = text.indexOf(seekKw);
    if (idx === -1) continue;

    const vicinity = text.slice(Math.max(0, idx - 40), idx + 80);

    for (const [role, keywords] of Object.entries(ROLE_VOCABULARY) as [SemanticRole, string[]][]) {
      if (role === "angle") continue;
      for (const kw of keywords) {
        const localIdx = vicinity.indexOf(kw);
        if (localIdx === -1) continue;

        const globalIdx = Math.max(0, idx - 40) + localIdx;
        const distance = Math.abs(globalIdx - idx);
        let score = 200 - Math.min(distance, 200);

        // seek語の直後にあるキーワードを強く優先する
        if (globalIdx >= idx && globalIdx - idx <= 24) {
          score += 60;
        }

        // 「高さを求める」「上昇高度を求める」のような直接表現を優先する
        if (new RegExp(`${escapeRegExp(kw)}\\s*(?:を|の)?\\s*${escapeRegExp(seekKw)}`).test(vicinity)) {
          score += 100;
        }

        seekCandidates.push({ role, score });
      }
    }
  }

  if (seekCandidates.length > 0) {
    seekCandidates.sort((a, b) => b.score - a.score);
    return seekCandidates[0].role;
  }

  // 解法内の「高さ = 20 × tan30°」のような式の左辺も unknown の手掛かりにする
  const equationTarget = detectEquationTarget(text);
  if (equationTarget) return equationTarget;

  // フォールバック: 値がない辺 = 未知量
  const unknowns = quantities.filter((q) => !q.isKnown && q.role !== "angle");
  if (unknowns.length === 1) return unknowns[0].role;

  return null;
}

function extractContextLabel(
  text: string
): { label: string; role: SemanticRole } | null {
  for (const ctx of CONTEXT_OBJECTS) {
    if (text.includes(ctx.word)) {
      return { label: ctx.word, role: ctx.role };
    }
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectEquationTarget(text: string): SemanticRole | null {
  const equations = text.split(/\n|。/);

  for (const equation of equations) {
    if (!equation.includes("=")) continue;

    const [left, right] = equation.split("=", 2).map((part) => part.trim());
    if (!right || !/(sin|cos|tan)/i.test(right)) continue;

    let best: { role: SemanticRole; keywordLength: number } | null = null;

    for (const [role, keywords] of Object.entries(ROLE_VOCABULARY) as [SemanticRole, string[]][]) {
      if (role === "angle") continue;
      for (const kw of keywords) {
        if (!left.includes(kw)) continue;
        if (!best || kw.length > best.keywordLength) {
          best = { role, keywordLength: kw.length };
        }
      }
    }

    if (best) return best.role;
  }

  return null;
}
