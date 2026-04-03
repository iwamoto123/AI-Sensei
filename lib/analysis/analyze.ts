import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-20250514";

export interface AnalysisResult {
  problem_summary: string;
  topic: string;
  solution_outline: string;
  why_this_method: string;
  common_pitfalls: string;
  model_name: string;
}

interface AnalysisInput {
  problemImageUrl: string;
  answerImageUrl: string;
}

const SYSTEM_PROMPT = `あなたは高校数学の教育専門家です。
問題画像と解答画像を分析し、以下の項目を日本語で返してください。
必ず指定された JSON 形式のみで返答してください。JSON 以外のテキストは含めないでください。

出力 JSON 形式:
{
  "problem_summary": "問題の要約（1〜2文）",
  "topic": "単元名（例: 高校数学I 二次関数）",
  "solution_outline": ["解法ステップ1", "解法ステップ2", ...],
  "why_this_method": "なぜその解法を使うのかの説明",
  "common_pitfalls": ["つまずきポイント1", "つまずきポイント2", ...]
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

  return {
    problem_summary: String(parsed.problem_summary),
    topic: String(parsed.topic),
    solution_outline: outline,
    why_this_method: String(parsed.why_this_method),
    common_pitfalls: pitfalls,
    model_name: MODEL,
  };
}
