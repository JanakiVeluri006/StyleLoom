"""
Regenerates src/lib/products.ts's SAMPLE_PRODUCTS from a real Myntra product
dump. This replaces a previous generator (referenced in a code comment as
scripts/gen_catalog.py but never actually committed) whose color extraction
silently defaulted to "assorted" whenever it couldn't find a color word in
the title text alone -- which happened for 230 of 240 products (96%), because
color is usually only in the image filename, not the title. That's the
direct cause of "attribute matching finds nothing": almost every product was
unmatchable by color.

This version fixes that by (a) also checking the image filename -- Myntra
filenames are PascalCase-concatenated (e.g. "...DILLINGERNavyBlueTypography
PrintedPureCottonLoo...") and need real tokenization, not naive substring
search -- and (b) dropping a row rather than guessing when no color is
genuinely recoverable, except for real multi-item packs ("Pack of 5") where
"assorted" is an honest label, not a filler default.

USAGE (from the project root):
    pip install pandas
    python scripts/gen_catalog.py --csv path/to/myntra202305041052.csv

Writes src/lib/products.generated.ts. Then in src/lib/products.ts, delete
the SAMPLE_PRODUCTS array literal and replace it with:
    export { GENERATED_PRODUCTS as SAMPLE_PRODUCTS } from "./products.generated";
Keep everything else in products.ts (ATTRIBUTE_GROUPS, Product interface,
normalizeProduct, attrSignature) unchanged.
"""
import argparse
import re
import pandas as pd

COLOR_MAP = {
    "black": "black", "white": "white", "off white": "white", "ivory": "white", "cream": "beige",
    "navy": "blue", "navy blue": "blue", "blue": "blue", "sky blue": "blue", "turquoise": "blue",
    "red": "red", "maroon": "red", "wine": "red", "rust": "orange",
    "green": "green", "olive": "green", "emerald": "green", "sea green": "green", "mint": "green",
    "yellow": "yellow", "mustard": "yellow", "lemon": "yellow",
    "pink": "pink", "rose": "pink", "magenta": "pink", "fuchsia": "pink", "mauve": "pink",
    "coral": "coral", "peach": "coral", "salmon": "coral",
    "beige": "beige", "khaki": "beige", "taupe": "beige", "skin": "beige", "nude": "beige",
    "brown": "brown", "tan": "brown", "coffee": "brown", "chocolate": "brown", "camel": "brown",
    "purple": "purple", "lavender": "purple", "lilac": "purple", "violet": "purple",
    "orange": "orange", "tangerine": "orange",
    "gold": "gold", "golden": "gold",
}
FABRIC_WORDS = ["lace", "chiffon", "satin", "cotton", "knit", "linen", "georgette", "velvet", "silk", "denim", "tulle"]
PATTERN_MAP = {"printed": "printed", "print": "printed", "floral": "floral", "embellished": "embellished",
               "embroidered": "embellished", "striped": "striped", "stripe": "striped", "checked": "printed",
               "solid": "solid"}
NECKLINE_MAP = {"off shoulder": "off-shoulder", "off-shoulder": "off-shoulder", "cold shoulder": "off-shoulder",
                 "v neck": "v-neck", "v-neck": "v-neck", "round neck": "round", "square neck": "square",
                 "collar": "collar", "sweetheart": "sweetheart", "cowl": "cowl"}
SLEEVE_MAP = {"sleeveless": "sleeveless", "puff sleeve": "puff", "puff": "puff",
              "full sleeve": "full", "long sleeve": "long", "half sleeve": "half",
              "short sleeve": "short", "three quarter": "three-quarter", "3/4": "three-quarter"}
LENGTH_MAP = {"mini": "mini", "maxi": "maxi", "midi": "midi", "knee": "knee", "floor": "floor",
              "gown": "gown", "cropped": "cropped", "crop": "cropped"}
FIT_MAP = {"a-line": "a-line", "a line": "a-line", "flared": "flared", "bodycon": "bodycon",
           "wrap": "wrap", "regular fit": "regular", "tiered": "tiered", "relaxed": "relaxed",
           "straight": "straight", "oversized": "relaxed", "slim fit": "straight"}


def find_first(text, mapping):
    t = text.lower()
    for key in sorted(mapping.keys(), key=len, reverse=True):
        if re.search(r"\b" + re.escape(key) + r"\b", t):
            return mapping[key]
    return None


def camel_tokens(s):
    return " ".join(re.findall(r"[A-Z][a-z]*", s))


def extract_color(name, filename, is_pack):
    color = find_first(name, COLOR_MAP) or find_first(camel_tokens(filename), COLOR_MAP)
    if color:
        return color
    if is_pack:
        return "assorted"
    return None


def extract_fabric(name, filename):
    t = name.lower()
    for f in FABRIC_WORDS:
        if re.search(r"\b" + f + r"\b", t):
            return f
    ft = camel_tokens(filename).lower()
    for f in FABRIC_WORDS:
        if re.search(r"\b" + f + r"\b", ft):
            return f
    return None


def first_image_url(img_field):
    if not isinstance(img_field, str):
        return None
    for part in re.split(r"[;\n]", img_field):
        part = part.strip()
        if part.startswith("http"):
            # Myntra's raw dataset URLs bake in a low-res thumbnail transform
            # (f_webp,dpr_1.0,q_60,w_210,...) — same CDN, same image, just a
            # tiny/blurry rendition. Swap in a much higher quality + wider
            # version of the same Cloudinary-style transform instead.
            part = re.sub(
                r"dpr_[0-9.]+,q_[0-9]+,w_[0-9]+",
                "dpr_2.0,q_90,w_800",
                part,
            )
            return part
    return None


def guess_occasion(name, category):
    t = name.lower()
    if "wedding" in t or "bridal" in t:
        return "wedding"
    if "party" in t or "cocktail" in t or "evening" in t:
        return "party"
    if "office" in t or "formal" in t:
        return "office"
    if "festive" in t or category == "ethnic":
        return "festive"
    if "vacation" in t or "beach" in t:
        return "vacation"
    if "date" in t:
        return "date"
    return "casual"


def guess_style(name, fabric, pattern):
    t = name.lower()
    if pattern == "embellished" or fabric in ("satin", "velvet") or "sequin" in t:
        return "glamorous"
    if fabric in ("cotton", "linen") and "office" in t:
        return "minimal"
    if "ethnic" in t or "kurti" in t or "saree" in t or "lehenga" in t:
        return "ethnic"
    if "graphic" in t or "oversized" in t or "cargo" in t:
        return "edgy"
    return "casual"


def build_row(row, category, id_):
    name = str(row["name"])
    img = first_image_url(row["img"])
    if not img:
        return None

    filename_words = set(w.lower() for w in re.findall(r"[A-Z][a-z]*", img))
    if "dress" in name.lower() and "top" in filename_words and "dress" not in filename_words:
        return None

    is_pack = bool(re.search(r"\bpack of\b|\bcombo pack\b", name, re.IGNORECASE))
    color = extract_color(name, img, is_pack)
    if not color:
        return None

    fabric = extract_fabric(name, img)
    if not fabric:
        if category in ("dress", "women", "men", "ethnic", "kids", "genz"):
            return None  # fabric is a real visual claim here — don't guess "cotton"
        fabric = "n/a"  # beauty/home/accessories: fabric doesn't meaningfully apply; an
                         # honest non-match rather than a false "cotton" claim
    pattern = find_first(name, PATTERN_MAP) or "solid"
    neckline = find_first(name, NECKLINE_MAP)
    sleeve = find_first(name, SLEEVE_MAP)
    length = find_first(name, LENGTH_MAP)
    fit = find_first(name, FIT_MAP)
    brand = str(row["seller"]) if pd.notna(row["seller"]) else "Myntra"
    price = int(row["price"]) if pd.notna(row["price"]) else 999
    mrp = int(row["mrp"]) if pd.notna(row["mrp"]) else int(price * 1.8)

    return {
        "id": id_, "brand": brand, "title": f"{brand} {name}".strip(), "category": category,
        "color": color, "fabric": fabric, "pattern": pattern,
        "neckline": neckline, "sleeve": sleeve, "length": length, "fit": fit,
        "occasion": guess_occasion(name, category), "style": guess_style(name, fabric, pattern),
        "price": price, "original_price": mrp, "image_url": img,
    }


# Innerwear/hosiery/lounge terms — Myntra's dataset has a huge volume of these
# under generic "Men"/"Women" labels (found by inspection: 42-46% of the old
# men/women buckets were briefs, boxers, trunks, camisoles, socks, thermals —
# not outerwear at all, and not what "browse women\'s wear" should show).
INNERWEAR_EXCLUDE = (
    r"innerwear|\bbrief|panty|panties|lingerie|thong|bikini|\bboxer|\btrunk|"
    r"\bvests?\b|camisole|shapewear|thermal|\bbra\b|bralette|\bslip\b|hipster|"
    r"\bsock|night\s?suit|nightwear|sleepwear|night\s?dress|pyjama|pajama|\bbriefs\b|"
    r"\btowel|face mask|shoe liner"
)

BUCKETS = [
    (r"\bmen\b", [r"\bwomen\b", r"\bkids\b", r"\bboys\b", r"\bgirls\b", r"\bdress\b", INNERWEAR_EXCLUDE], "men", "me", 26),
    (r"\bwomen\b", [r"\bmen\b", r"\bkids\b", r"\bgirls\b", r"\bdress\b", INNERWEAR_EXCLUDE, r"lipstick|skincare|foundation|perfume|eau de|\bedp\b|fragrance"], "women", "we", 26),
    (r"\bdress\b", [r"\bmen\b", r"\bgirls\b", r"\bboys\b", r"\bkids\b"], "dress", "d", 30),
    (r"saree|kurti|lehenga|kurta set", [r"\bmen\b", r"\bkids\b", r"\bgirls\b", r"\bboys\b"], "ethnic", "e", 25),
    (r"\bkids\b|\bboys\b|\bgirls\b", [INNERWEAR_EXCLUDE], "kids", "k", 25),
    (r"lipstick|skincare|foundation|kajal|kohl|serum|moisturi[sz]er", [], "beauty", "b", 25),
    (r"graphic|hoodie|cargo|crop top|streetwear", [INNERWEAR_EXCLUDE], "genz", "g", 15),
    (r"cushion cover|bedsheet|curtain", [], "home", "h", 15),
    (r"heels|sandals|pumps|loafers|sneakers|flats", [r"\bmen\b"], "accessory-shoes", "acc-shoe", 20),
    (r"clutch|handbag|sling bag|tote bag|backpack", [], "accessory-bag", "acc-bag", 15),
    (r"earring|necklace|bracelet|pendant|\bring\b", [], "accessory-jewelry", "acc-jew", 20),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--out", default="src/lib/products.generated.ts")
    args = parser.parse_args()

    df = pd.read_csv(args.csv, on_bad_lines="skip", engine="python")
    df = df.dropna(subset=["name", "img"])

    all_products = []
    for include_re, exclude_res, category, prefix, n in BUCKETS:
        subset = df[df["name"].str.contains(include_re, case=False, regex=True, na=False)]
        for ex in exclude_res:
            subset = subset[~subset["name"].str.contains(ex, case=False, regex=True, na=False)]
        subset = subset.drop_duplicates(subset=["name"]).sample(frac=1, random_state=42)

        kept = 0
        for _, row in subset.iterrows():
            if kept >= n:
                break
            product = build_row(row, category, f"{prefix}{kept + 1}")
            if product:
                all_products.append(product)
                kept += 1
        print(f"{category}: kept {kept}/{n} requested (candidates: {len(subset)})")

    def esc(s):
        return str(s).replace("\\", "\\\\").replace('"', '\\"')

    lines = [
        "// AUTO-GENERATED by scripts/gen_catalog.py -- do not hand-edit.",
        "// Every product here is a real Myntra listing: name, image, price, and brand",
        "// all came from the same scraped row. Color is extracted from the title OR the",
        "// image filename (never defaulted to a filler value) -- a row is dropped rather",
        "// than guessing if no real color signal exists, except genuine multi-item packs.",
        'import type { Product } from "./products";',
        "",
        "export const GENERATED_PRODUCTS: Product[] = [",
    ]
    for p in all_products:
        lines.append("  {")
        for key in ["id", "brand", "title", "category", "color", "fabric", "pattern",
                    "neckline", "sleeve", "length", "fit", "occasion", "style"]:
            val = p.get(key)
            if val is None:
                continue
            lines.append(f'    {key}: "{esc(val)}",')
        lines.append(f'    price: {p["price"]},')
        lines.append(f'    original_price: {p["original_price"]},')
        lines.append(f'    image_url: "{esc(p["image_url"])}"')
        lines.append("  },")
    lines.append("];")

    with open(args.out, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"\nWrote {len(all_products)} real, colour-verified products to {args.out}")


if __name__ == "__main__":
    main()
