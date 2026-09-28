// Parses free-text shopping requests into structured attribute filters that
// scoreProduct() (in recommendations.functions.ts) can match against the real
// catalog. Maps synonyms (e.g. "emerald", "ruby") to the canonical values in
// ATTRIBUTE_GROUPS (products.ts), and files each word under its correct
// attribute key so scoreProduct's exact/substring matching actually hits.

const COLOR_SYNONYMS: Record<string, string> = {
  black: "black", white: "white", "off white": "white", ivory: "white", cream: "beige",
  navy: "blue", blue: "blue", "sky blue": "blue", turquoise: "blue",
  red: "red", ruby: "red", maroon: "red", wine: "red",
  green: "green", emerald: "green", olive: "green", mint: "green",
  yellow: "yellow", mustard: "yellow", lemon: "yellow",
  pink: "pink", rose: "pink", magenta: "pink", fuchsia: "pink", mauve: "pink",
  coral: "coral", peach: "coral", salmon: "coral",
  beige: "beige", khaki: "beige", nude: "beige", taupe: "beige",
  brown: "brown", tan: "brown", camel: "brown", chocolate: "brown",
  purple: "purple", lavender: "purple", lilac: "purple", violet: "purple",
  orange: "orange", rust: "orange",
  gold: "gold", golden: "gold",
};

const FABRIC_WORDS = ["lace", "chiffon", "satin", "cotton", "knit", "linen", "georgette", "velvet", "silk", "denim", "tulle"];
const PATTERN_WORDS = ["solid", "floral", "printed", "print", "embellished", "embroidered", "striped"];
const PATTERN_MAP: Record<string, string> = { print: "printed", embroidered: "embellished" };

// Belongs to ATTRIBUTE_GROUPS "occasion".
const OCCASION_WORDS = ["casual", "party", "office", "vacation", "festive", "wedding", "date"];
// Belongs to ATTRIBUTE_GROUPS "style".
const STYLE_WORDS = ["breezy", "glamorous", "edgy", "minimal", "feminine", "ethnic", "festive", "casual"];
const STYLE_SYNONYMS: Record<string, string> = { formal: "minimal", elegant: "glamorous", chic: "glamorous" };

function findAll(lower: string, mapping: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const key of Object.keys(mapping).sort((a, b) => b.length - a.length)) {
    if (new RegExp(`\\b${key}\\b`).test(lower)) found.add(mapping[key]);
  }
  return [...found];
}

function findWords(lower: string, words: string[], remap: Record<string, string> = {}): string[] {
  const found = new Set<string>();
  for (const w of words) {
    if (new RegExp(`\\b${w}\\b`).test(lower)) found.add(remap[w] || w);
  }
  return [...found];
}

export function parsePreferenceText(text: string) {
  if (!text) return { attributes: {} as Record<string, string[]> };
  const lower = text.toLowerCase();
  const attributes: Record<string, string[]> = {};

  const colors = findAll(lower, COLOR_SYNONYMS);
  if (colors.length) attributes.color = colors;

  const fabrics = findWords(lower, FABRIC_WORDS);
  if (fabrics.length) attributes.fabric = fabrics;

  const patterns = findWords(lower, PATTERN_WORDS, PATTERN_MAP);
  if (patterns.length) attributes.pattern = patterns;

  const occasions = findWords(lower, OCCASION_WORDS);
  if (occasions.length) attributes.occasion = occasions;

  const styles = new Set([...findWords(lower, STYLE_WORDS), ...findAll(lower, STYLE_SYNONYMS)]);
  if (styles.size) attributes.style = [...styles];

  let maxPrice: number | undefined;
  const priceMatch = lower.match(/(?:under|max|below|less than|\u20b9|\$)\s*(\d{3,5})/i);
  if (priceMatch && priceMatch[1]) {
    maxPrice = parseInt(priceMatch[1], 10);
  }

  return { attributes, maxPrice };
}
