import Anthropic from "@anthropic-ai/sdk";
import type {
  DiagramTarget,
  MeaningModel,
  MeaningModelGiven,
  MeaningModelContextLabel,
  SolutionResult,
  TrigRelation,
} from "@/lib/types";

const MODEL = "claude-sonnet-4-20250514";

export interface AnalysisResult {
  problem_summary: string;
  topic: string;
  solution_outline: string;
  why_this_method: string;
  common_pitfalls: string;
  solution_result: SolutionResult | null;
  visual_model: MeaningModel | null;
  model_name: string;
}

interface AnalysisInput {
  problemImageUrl: string;
  answerImageUrl: string;
}

const SYSTEM_PROMPT = `あなたは高校数学の教育専門家です。
問題画像と解答画像を分析し、動画・アニメーション図解を生成するための制作メタ情報を日本語で返してください。
必ず指定された JSON 形式のみで返答してください。JSON 以外のテキストは含めないでください。
problem_summary, topic, solution_outline, why_this_method, common_pitfalls はスライド本文ではなく、生成・検証・デバッグ用の内部情報です。

出力 JSON 形式:
{
  "problem_summary": "問題の要約（1〜2文）",
  "topic": "単元名（例: 高校数学I 二次関数）",
  "solution_outline": ["解法ステップ1", "解法ステップ2", ...],
  "why_this_method": "なぜその解法を使うのかの説明",
  "common_pitfalls": ["つまずきポイント1", "つまずきポイント2", ...],
  "solution_result": {
    "calculation_steps": [
      {
        "formula": "tan30° = 高さ / 20",
        "narration": "tan の定義を使って、高さと底辺の比を式にします。"
      },
      {
        "formula": "高さ = 20tan30° = 20/√3",
        "narration": "両辺に20をかけて高さを求めます。"
      }
    ],
    "final_answer": "20/√3 m",
    "answer_unit": "m"
  },
  "visual_model": null
}

visual_model は、問題に直角三角形・三角比・傾斜角などの図解が有効な場合だけ返してください。
SVG や HTML は絶対に返さないでください。図の意味だけを JSON で返してください。
読み取れない値や曖昧な対応を推測で埋めないでください。その場合は visual_model を null にしてください。
solution_result は解答画像に書かれている計算過程と最終答えをもとにしてください。解答が読み取れない場合は null にしてください。
diagram_type は、直角が明示されている場合だけ "right_triangle" にしてください。
正弦定理・余弦定理・内角の和を使う一般三角形は "triangle" にしてください。
105° や 120° など直角三角形ではありえない角が出る場合、必ず "triangle" にしてください。

直角三角形の visual_model 形式:
{
  "diagram_type": "right_triangle",
  "givens": [
    {
      "kind": "angle",
      "target": "angle",
      "value": 30,
      "unit": "degree",
      "source_text": "問題文または解答内の根拠"
    },
    {
      "kind": "length",
      "target": "base",
      "value": 20,
      "unit": "m",
      "source_text": "問題文または解答内の根拠"
    }
  ],
  "unknown": {
    "kind": "length",
    "target": "height",
    "label": "高さ"
  },
  "context_labels": [],
  "highlight_target": "height",
  "trig_relation": {
    "fn": "tan",
    "angle_value": 30,
    "numerator": "height",
    "denominator": "base"
  },
  "confidence": "high",
  "safe_to_render_specific_labels": true
}

一般三角形の visual_model 形式:
{
  "diagram_type": "triangle",
  "givens": [],
  "unknown": null,
  "context_labels": [],
  "highlight_target": "b",
  "trig_relation": null,
  "confidence": "high",
  "safe_to_render_specific_labels": true,
  "triangle_vertices": [
    { "id": "A", "label": "A", "angle_label": "105°" },
    { "id": "B", "label": "B", "angle_label": "30°" },
    { "id": "C", "label": "C", "angle_label": null }
  ],
  "triangle_sides": [
    { "id": "a", "from": "B", "to": "C", "label": "a", "value_label": null, "is_unknown": false },
    { "id": "b", "from": "C", "to": "A", "label": "b", "value_label": null, "is_unknown": true },
    { "id": "c", "from": "A", "to": "B", "label": "c", "value_label": "4", "is_unknown": false }
  ],
  "relation_label": "c/sinC = b/sinB"
}`;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY environment variable. Add it to .env.local"
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * 問題画像と解答画像を Claude に渡し、構造化された解析結果を返す。
 * 将来モデルを差し替える場合はこの関数内を変更する。
 */
export async function analyzeJob(
  _jobId: string,
  input: AnalysisInput
): Promise<AnalysisResult> {
  const client = getClient();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "url", url: input.problemImageUrl },
          },
          { type: "text", text: "上の画像は問題です。" },
          {
            type: "image",
            source: { type: "url", url: input.answerImageUrl },
          },
          { type: "text", text: "上の画像は解答です。" },
          {
            type: "text",
            text: "これらを分析して、指定された JSON 形式で結果を返してください。",
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  // レスポンスからテキストを取得
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AIからテキスト応答がありませんでした。");
  }

  const raw = textBlock.text;
  console.log("[AI raw output]", raw);

  // JSON パース
  let parsed: Record<string, unknown>;
  try {
    // コードブロックで囲まれている場合に対応
    const jsonStr = raw.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`AIの出力を JSON としてパースできませんでした: ${raw.slice(0, 200)}`);
  }

  // バリデーション
  const required = [
    "problem_summary",
    "topic",
    "solution_outline",
    "why_this_method",
    "common_pitfalls",
  ] as const;

  for (const key of required) {
    if (!(key in parsed) || !parsed[key]) {
      throw new Error(`AIの出力に必須項目 "${key}" がありません。`);
    }
  }

  // 配列フィールドを改行区切り文字列に変換して保存
  const outline = Array.isArray(parsed.solution_outline)
    ? (parsed.solution_outline as string[]).join("\n")
    : String(parsed.solution_outline);

  const pitfalls = Array.isArray(parsed.common_pitfalls)
    ? (parsed.common_pitfalls as string[]).join("\n")
    : String(parsed.common_pitfalls);
  const solutionResult = parseSolutionResult(parsed.solution_result);
  const visualModel = parseVisualModel(parsed.visual_model);

  return {
    problem_summary: String(parsed.problem_summary),
    topic: String(parsed.topic),
    solution_outline: outline,
    why_this_method: String(parsed.why_this_method),
    common_pitfalls: pitfalls,
    solution_result: solutionResult,
    visual_model: visualModel,
    model_name: MODEL,
  };
}

function parseSolutionResult(value: unknown): SolutionResult | null {
  if (!isRecord(value)) return null;
  if (typeof value.final_answer !== "string" || !value.final_answer.trim()) {
    return null;
  }

  const calculation_steps = Array.isArray(value.calculation_steps)
    ? value.calculation_steps.flatMap((step) => {
        if (!isRecord(step)) return [];
        if (
          typeof step.formula !== "string"
          || !step.formula.trim()
          || typeof step.narration !== "string"
          || !step.narration.trim()
        ) {
          return [];
        }

        return [{
          formula: step.formula.trim(),
          narration: step.narration.trim(),
        }];
      })
    : [];

  return {
    calculation_steps,
    final_answer: value.final_answer.trim(),
    answer_unit:
      typeof value.answer_unit === "string" && value.answer_unit.trim()
        ? value.answer_unit.trim()
        : null,
  };
}

function parseVisualModel(value: unknown): MeaningModel | null {
  if (!isRecord(value)) return null;
  if (value.diagram_type !== "right_triangle" && value.diagram_type !== "triangle") {
    return null;
  }

  const givens: MeaningModelGiven[] = [];
  if (Array.isArray(value.givens)) {
    for (const given of value.givens) {
      if (!isRecord(given)) continue;
      const kind = given.kind;
      const target = given.target;
      const numericValue = Number(given.value);
      const unit = typeof given.unit === "string" ? given.unit : "";
      const sourceText =
        typeof given.source_text === "string" ? given.source_text : "";

      if ((kind !== "length" && kind !== "angle") || !Number.isFinite(numericValue)) {
        continue;
      }
      if (!unit || !sourceText) continue;

      if (kind === "angle") {
        if (target !== "angle") continue;
        givens.push({
          kind,
          target: "angle",
          value: numericValue,
          unit,
          source_text: sourceText,
        });
        continue;
      }

      if (!isDiagramTarget(target)) continue;
      givens.push({
        kind,
        target,
        value: numericValue,
        unit,
        source_text: sourceText,
      });
    }
  }

  const unknown = isRecord(value.unknown)
    && value.unknown.kind === "length"
    && isDiagramTarget(value.unknown.target)
    && typeof value.unknown.label === "string"
    ? {
        kind: "length" as const,
        target: value.unknown.target,
        label: value.unknown.label,
      }
    : null;

  const context_labels: MeaningModelContextLabel[] = Array.isArray(value.context_labels)
    ? value.context_labels.flatMap((label) => {
        if (!isRecord(label)) return [];
        if (
          (isDiagramTarget(label.target) || label.target === "angle")
          && typeof label.label === "string"
        ) {
          return [{
            target: label.target,
            label: label.label,
          } as MeaningModelContextLabel];
        }
        return [];
      })
    : [];

  const highlight_target = isDiagramTarget(value.highlight_target)
    ? value.highlight_target
    : unknown?.target ?? null;

  const trig_relation: TrigRelation | null = isRecord(value.trig_relation)
    && (value.trig_relation.fn === "sin"
      || value.trig_relation.fn === "cos"
      || value.trig_relation.fn === "tan")
    && Number.isFinite(Number(value.trig_relation.angle_value))
    && isDiagramTarget(value.trig_relation.numerator)
    && isDiagramTarget(value.trig_relation.denominator)
    ? {
        fn: value.trig_relation.fn,
        angle_value: Number(value.trig_relation.angle_value),
        numerator: value.trig_relation.numerator,
        denominator: value.trig_relation.denominator,
      }
    : null;

  const confidence =
    value.confidence === "high" || value.confidence === "medium"
      ? value.confidence
      : "low";

  if (value.diagram_type === "right_triangle" && hasImpossibleRightTriangleAngle(givens)) {
    return null;
  }

  const triangleParts = value.diagram_type === "triangle"
    ? parseTriangleParts(value)
    : {};

  return {
    diagram_type: value.diagram_type,
    givens,
    unknown,
    context_labels,
    highlight_target,
    trig_relation,
    confidence,
    safe_to_render_specific_labels:
      value.safe_to_render_specific_labels === true && confidence !== "low",
    ...triangleParts,
  };
}

function parseTriangleParts(value: Record<string, unknown>): Pick<
  MeaningModel,
  "triangle_vertices" | "triangle_sides" | "relation_label"
> {
  const triangle_vertices = Array.isArray(value.triangle_vertices)
    ? value.triangle_vertices.flatMap((vertex) => {
        if (!isRecord(vertex)) return [];
        if (typeof vertex.id !== "string" || typeof vertex.label !== "string") {
          return [];
        }

        return [{
          id: vertex.id,
          label: vertex.label,
          angle_label: typeof vertex.angle_label === "string"
            ? vertex.angle_label
            : null,
        }];
      })
    : [];

  const triangle_sides = Array.isArray(value.triangle_sides)
    ? value.triangle_sides.flatMap((side) => {
        if (!isRecord(side)) return [];
        if (
          typeof side.id !== "string"
          || typeof side.from !== "string"
          || typeof side.to !== "string"
          || typeof side.label !== "string"
        ) {
          return [];
        }

        return [{
          id: side.id,
          from: side.from,
          to: side.to,
          label: side.label,
          value_label: typeof side.value_label === "string"
            ? side.value_label
            : null,
          is_unknown: side.is_unknown === true,
        }];
      })
    : [];

  return {
    triangle_vertices,
    triangle_sides,
    relation_label:
      typeof value.relation_label === "string" && value.relation_label.trim()
        ? value.relation_label.trim()
        : null,
  };
}

function hasImpossibleRightTriangleAngle(givens: MeaningModelGiven[]): boolean {
  return givens.some(
    (given) =>
      given.kind === "angle"
      && given.target === "angle"
      && given.value !== 90
      && given.value >= 90
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDiagramTarget(value: unknown): value is DiagramTarget {
  return value === "base" || value === "height" || value === "hypotenuse";
}
