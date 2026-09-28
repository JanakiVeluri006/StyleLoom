export const ATTRIBUTE_GROUPS: { key: string; label: string; options: string[] }[] = [
  { key: "color", label: "Color", options: ["white","red","green","yellow","black","blue","pink","coral","beige","brown","purple","orange","gold"] },
  { key: "fabric", label: "Fabric", options: ["lace","chiffon","satin","cotton","knit","linen","georgette","velvet","silk","denim","tulle"] },
  { key: "pattern", label: "Pattern", options: ["solid","floral","printed","embellished","striped"] },
  { key: "neckline", label: "Neckline", options: ["off-shoulder","round","cowl","v-neck","square","collar","sweetheart","open"] },
  { key: "sleeve", label: "Sleeve", options: ["short","sleeveless","half","puff","full","long","three-quarter"] },
  { key: "length", label: "Length", options: ["mini","maxi","midi","knee","floor","gown","cropped"] },
  { key: "fit", label: "Fit", options: ["a-line","flared","bodycon","wrap","regular","tiered","relaxed","straight"] },
  { key: "occasion", label: "Occasion", options: ["casual","party","office","vacation","festive","wedding","date","all"] },
  { key: "style", label: "Style", options: ["breezy","glamorous","edgy","minimal","feminine","ethnic","festive","casual"] },
];

export function attrSignature(attrs: Record<string, string[]>, prompt?: string) {
  const parts: string[] = [];
  Object.keys(attrs).sort().forEach((k) => {
    const vals = [...(attrs[k] || [])].sort();
    if (vals.length) parts.push(`${k}:${vals.join(",")}`);
  });
  if (prompt) parts.push(`p:${prompt.trim().toLowerCase().slice(0, 60)}`);
  return parts.join("|");
}

export interface Product {
  id: string;
  brand: string;
  title: string;
  category: "men" | "women" | "kids" | "beauty" | "genz" | "home" | "dress" | "ethnic" | "accessory-shoes" | "accessory-bag" | "accessory-jewelry";
  color: string;
  fabric: string;
  pattern: string;
  neckline?: string;
  sleeve?: string;
  length?: string;
  fit?: string;
  occasion?: string;
  style?: string;
  price: number;
  original_price?: number;
  image_url: string;
}

// SAMPLE_PRODUCTS comes from the real, colour-verified Myntra-derived catalog.
// Regenerate with: python scripts/gen_catalog.py --csv path/to/myntra202305041052.csv
import { GENERATED_PRODUCTS } from "./products.generated";
export const SAMPLE_PRODUCTS: Product[] = GENERATED_PRODUCTS;

export type SubCategory =
  | "top" | "bottom" | "dress" | "ethnic-set" | "outerwear"
  | "footwear" | "bag" | "jewelry" | "beauty" | "other";

// The raw dataset only has broad categories (men/women/ethnic), so we infer
// finer sub-categories (top/bottom/dress/etc) from the product title.
const BOTTOM_WORDS = [
  "jeans", "trouser", "trousers", "pant", "pants", "jogger", "joggers",
  "skirt", "shorts", "legging", "leggings", "jegging", "jeggings",
  "palazzo", "chinos", "cargo", "dungaree", "dungarees", "capri", "capris",
  "dhoti", "dhotis", "patiala", "salwar", "salwars",
];
const DRESS_WORDS = ["dress", "gown", "jumpsuit", "frock", "romper", "playsuit", "baby doll"];
const ETHNIC_SET_WORDS = ["saree", "sari", "lehenga", "sherwani", "salwar suit", "anarkali", "kurta set", "kurti set"];
const OUTERWEAR_WORDS = ["blazer", "jacket", "jackets", "coat", "cardigan", "shrug", "overcoat"];
const TOP_WORDS = [
  "top", "shirt", "kurta", "kurtas", "kurti", "kurtis", "blouse", "tee",
  "t-shirt", "tshirt", "tank", "tunic", "sweater", "sweatshirt", "hoodie",
  "camisole", "crop", "pullover",
];
// Some shoes are tagged under a "women"/"men" apparel category instead of
// "accessory-shoes" — catch them by title regardless of category.
const FOOTWEAR_TITLE_WORDS = [
  "sneaker", "sneakers", "sandal", "sandals", "heel", "heels", "flats",
  "loafer", "loafers", "derby", "derbys", "boot", "boots", "bootie",
  "booties", "jutti", "juttis", "mojari", "mojaris", "clog", "clogs",
  "lace-up", "lace-ups",
];

function matchesAny(text: string, words: string[]) {
  return words.some((w) => new RegExp(`\\b${w.replace(/[-]/g, "[- ]?")}s?\\b`, "i").test(text));
}

export function inferSubCategory(product: Pick<Product, "title" | "category">): SubCategory {
  if (product.category === "accessory-shoes") return "footwear";
  if (product.category === "accessory-bag") return "bag";
  if (product.category === "accessory-jewelry") return "jewelry";
  if (product.category === "beauty") return "beauty";

  const t = (product.title || "").toLowerCase();
  if (matchesAny(t, FOOTWEAR_TITLE_WORDS)) return "footwear";
  if (matchesAny(t, ETHNIC_SET_WORDS)) return "ethnic-set";
  if (matchesAny(t, DRESS_WORDS)) return "dress";
  if (matchesAny(t, OUTERWEAR_WORDS)) return "outerwear";
  if (matchesAny(t, BOTTOM_WORDS)) return "bottom";
  if (matchesAny(t, TOP_WORDS)) return "top";
  return "other";
}


export function scoreProduct(p: Record<string, any>, target: Record<string, string[]>, maxPrice?: number) {
  let score = 0;
  if (maxPrice && typeof p.price === "number" && p.price > maxPrice) return -100;

  let matchesCount = 0;
  for (const [k, vals] of Object.entries(target)) {
    if (!vals || !vals.length) continue;
    const itemVal = (p[k] || "").toString().toLowerCase();
    for (const v of vals) {
      const lowerV = v.toLowerCase();
      if (itemVal === lowerV) {
        score += 25; // Exact attribute match
        matchesCount++;
      } else if (itemVal.includes(lowerV) || lowerV.includes(itemVal)) {
        score += 15;
        matchesCount++;
      }
    }
  }

  if (matchesCount > 1) score += matchesCount * 10;
  return score;
}

export function normalizeProduct(rawProduct: any): Product {
  if (!rawProduct) return SAMPLE_PRODUCTS[0];

  const idStr = (rawProduct.id || "").toString();

  const found = SAMPLE_PRODUCTS.find(p => p.id === idStr);
  if (found) return found;

  // If the raw object already looks like a real, fully-formed product
  // (has its own image and a real title), trust it as-is rather than
  // guessing which catalog entry it might correspond to.
  if (rawProduct.image_url && rawProduct.title && rawProduct.title !== "Fashion Dress") {
    return rawProduct as Product;
  }

  // Deterministic fallback for any other shape — same id always maps to
  // the same product, rather than random or guessed.
  const idx = Math.abs(idStr.split("").reduce((a: number, b: string) => a + b.charCodeAt(0), 0)) % SAMPLE_PRODUCTS.length;
  return SAMPLE_PRODUCTS[idx];
}
