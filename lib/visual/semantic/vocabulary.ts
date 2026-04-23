/**
 * 直角三角形の辺・角に対応する語彙辞書。
 * 今後の拡張は各配列に語を追加するだけで済む。
 */

export type SemanticRole =
  | "horizontal_distance"
  | "vertical_distance"
  | "slope_distance"
  | "angle";

/**
 * 各 semantic role に対応する語彙。
 * 順序は優先度順: より具体的な語を先に置く。
 */
export const ROLE_VOCABULARY: Record<SemanticRole, string[]> = {
  horizontal_distance: [
    "水平距離",
    "底辺",
    "地面の長さ",
    "地面",
    "横の長さ",
    "進んだ距離",
    "水平",
    "隣辺",
  ],
  vertical_distance: [
    "上昇高度",
    "上昇分",
    "上昇距離",
    "垂直距離",
    "建物の高さ",
    "上がった距離",
    "高さ",
    "上昇",
    "垂直",
    "対辺",
    "縦",
  ],
  slope_distance: [
    "斜辺",
    "斜辺の長さ",
    "傾斜の長さ",
    "斜面の長さ",
    "傾斜面",
    "斜面",
  ],
  angle: [
    "傾斜角",
    "仰角",
    "俯角",
    "角度",
  ],
};

/** 「求める」を示す表現 */
export const SEEK_KEYWORDS = ["求め", "何m", "何メートル", "いくら", "計算せよ", "答えよ"];

/** 数値+単位を抽出する正規表現 */
export const VALUE_WITH_UNIT_RE = /(\d+(?:\.\d+)?)\s*(m|cm|km|メートル)/g;

/** 角度を抽出する正規表現 */
export const ANGLE_VALUE_RE = /(\d{1,3})\s*[°度]/g;

/**
 * 文脈語: 辺に対応する物体名（数値を持たないがラベルになる語）
 */
export const CONTEXT_OBJECTS: { word: string; role: SemanticRole }[] = [
  { word: "エスカレーター", role: "slope_distance" },
  { word: "はしご", role: "slope_distance" },
  { word: "坂道", role: "slope_distance" },
  { word: "ロープ", role: "slope_distance" },
  { word: "影", role: "horizontal_distance" },
];

/**
 * 三角関数と辺の関係。
 * tan = 対辺/隣辺 = height/base
 * sin = 対辺/斜辺 = height/hypotenuse
 * cos = 隣辺/斜辺 = base/hypotenuse
 */
export type TrigFn = "sin" | "cos" | "tan";

export const TRIG_EDGE_MAP: Record<TrigFn, { numerator: "base" | "height"; denominator: "base" | "height" | "hypotenuse" }> = {
  tan: { numerator: "height", denominator: "base" },
  sin: { numerator: "height", denominator: "hypotenuse" },
  cos: { numerator: "base", denominator: "hypotenuse" },
};

/** テキスト中の三角関数パターン */
export const TRIG_PATTERN_RE = /(sin|cos|tan)\s*(\d{1,3})\s*[°度]/gi;
