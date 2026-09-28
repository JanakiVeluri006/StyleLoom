import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SAMPLE_PRODUCTS, attrSignature, normalizeProduct, inferSubCategory, scoreProduct } from "./products";
import { parsePreferenceText as localParsePreferenceText } from "./nlp_parser";
import { listLikedSwipes, listStyleloom } from "./styleloom.functions";

const AttrSchema = z.record(z.array(z.string()));

export const parsePreferenceText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().max(500) }).parse(d))
  .handler(async ({ data }) => {
    return localParsePreferenceText(data.text);
  });

export const getRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    bucket: AttrSchema,
    text: z.string().max(500).optional(),
    limit: z.number().int().min(1).max(60).default(24),
  }).parse(d))
  .handler(async ({ data }) => {
    const parsed = data.text ? localParsePreferenceText(data.text) : { attributes: {} as Record<string, string[]> };
    const merged: Record<string, string[]> = { ...data.bucket };

    // If the client sent no bucket attributes (e.g. page opened directly),
    // fall back to the user's saved StyleLoom bucket attributes.
    if (Object.keys(merged).length === 0) {
      const savedItems = await listStyleloom();
      for (const item of savedItems as any[]) {
        const attrs = (item.selected_attributes as Record<string, string[]>) ?? {};
        for (const [k, v] of Object.entries(attrs)) {
          const set = new Set([...(merged[k] ?? []), ...v]);
          merged[k] = [...set];
        }
      }
    }

    for (const [k, v] of Object.entries(parsed.attributes)) {
      const set = new Set([...(merged[k] ?? []), ...v]);
      merged[k] = [...set];
    }
    const maxPrice = (parsed as { maxPrice?: number }).maxPrice;

    const allNormalized = SAMPLE_PRODUCTS.map(normalizeProduct);

    const ranked = allNormalized
      .map((p) => ({ p, s: scoreProduct(p, merged, maxPrice) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, data.limit)
      .map((r) => r.p);

    return { recommendations: ranked, merged, maxPrice };
  });

export const suggestBestPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Builds a preference profile from liked swipes + StyleLoom bucket
    // attributes and scores the whole catalog against it.
    const [liked, loomItems] = await Promise.all([listLikedSwipes(), listStyleloom()]);

    const preference: Record<string, string[]> = {};
    const bump = (key: string, val: any) => {
      if (!val) return;
      const values = Array.isArray(val) ? val : [val];
      for (const v of values) {
        if (!v) continue;
        preference[key] = preference[key] ? [...new Set([...preference[key], v])] : [v];
      }
    };

    for (const item of liked as any[]) {
      const p = item.products;
      if (!p) continue;
      for (const key of ["color", "fabric", "pattern", "neckline", "sleeve", "length", "fit", "occasion", "style"]) {
        bump(key, p[key]);
      }
    }
    for (const item of loomItems as any[]) {
      for (const [k, v] of Object.entries(item.selected_attributes || {})) bump(k, v);
    }

    if (Object.keys(preference).length === 0) {
      // Honest cold-start response rather than an arbitrary "personalized" pick.
      return {
        product: null,
        explanation: "Swipe on a few pieces or save some to your StyleLoom bucket first — we need at least a little signal to pick something for you.",
      };
    }

    const likedIds = new Set((liked as any[]).map((l) => l.product_id));
    const ranked = SAMPLE_PRODUCTS
      .filter((p) => !likedIds.has(p.id))
      .map((p) => ({ p, s: scoreProduct(p, preference) }))
      .sort((a, b) => b.s - a.s);

    const chosen = ranked[0]?.p ?? SAMPLE_PRODUCTS[0];
    const matchedKeys = Object.keys(preference).filter((k) => (chosen as any)[k] && preference[k].includes((chosen as any)[k]));
    const reason = matchedKeys.length
      ? `it matches your ${matchedKeys.map((k) => `${k} (${(chosen as any)[k]})`).join(", ")}`
      : "it's the closest overall match to what you've liked so far";

    return {
      product: chosen,
      explanation: `Chosen from your swipes and saved pieces — ${reason}.`,
    };
  });

export const submitDesignRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ attributes: AttrSchema, prompt: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data }) => {
    const signature = attrSignature(data.attributes, data.prompt);
    return { ok: true, signature };
  });

export const getMatchingOutfits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mode: z.enum(["sisters","friends","family"]),
    baseProductId: z.string().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const base = SAMPLE_PRODUCTS.find(p => p.id === data.baseProductId) || SAMPLE_PRODUCTS[0];

    // Filter matching items by mode
    let matches: typeof SAMPLE_PRODUCTS = [];
    if (data.mode === "sisters") {
      matches = SAMPLE_PRODUCTS.filter(p => p.category === "women" && p.id !== base.id);
    } else if (data.mode === "friends") {
      matches = SAMPLE_PRODUCTS.filter(p => p.category === "genz" || p.category === "women");
    } else {
      matches = SAMPLE_PRODUCTS.filter(p => p.category === "kids" || p.category === "men" || p.category === "women");
    }

    if (!matches.length) matches = SAMPLE_PRODUCTS;

    return { base, matches };
  });

export const getPairings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().optional() }).parse(d))
  .handler(async ({ data }) => {
    const base = SAMPLE_PRODUCTS.find(p => p.id === data.productId) || SAMPLE_PRODUCTS[0];
    const baseSub = inferSubCategory(base);

    const groups: { category: string; label: string; items: typeof SAMPLE_PRODUCTS }[] = [];

    // If the base item is a top (or outerwear), suggest matching bottoms — and vice versa.
    const complementarySub =
      baseSub === "top" || baseSub === "outerwear" ? "bottom" :
      baseSub === "bottom" ? "top" :
      null;

    if (complementarySub) {
      const targetAttrs: Record<string, string[]> = {};
      for (const key of ["style", "occasion", "fabric", "color"] as const) {
        const v = (base as any)[key];
        if (v) targetAttrs[key] = [v];
      }

      let candidates = SAMPLE_PRODUCTS.filter(
        (p) => p.id !== base.id && inferSubCategory(p) === complementarySub && p.category === base.category
      );
      // If nothing in the exact same category (e.g. a genz top with no genz
      // bottoms in the catalog), broaden rather than showing nothing.
      if (candidates.length === 0) {
        candidates = SAMPLE_PRODUCTS.filter((p) => p.id !== base.id && inferSubCategory(p) === complementarySub);
      }

      const ranked = candidates
        .map((p) => ({ p, s: scoreProduct(p, targetAttrs) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((r) => r.p);

      if (ranked.length) {
        groups.push({
          category: complementarySub,
          label: complementarySub === "bottom" ? "👖 Matching Bottoms" : "👕 Matching Tops",
          items: ranked,
        });
      }
    }

    const shoes = SAMPLE_PRODUCTS.filter(p => p.category === "accessory-shoes");
    const bags = SAMPLE_PRODUCTS.filter(p => p.category === "accessory-bag");
    const jewelry = SAMPLE_PRODUCTS.filter(p => p.category === "accessory-jewelry");

    groups.push(
      { category: "accessory-shoes", label: "👟 Footwear Pairing", items: shoes },
      { category: "accessory-bag", label: "👜 Bags & Clutches", items: bags },
      { category: "accessory-jewelry", label: "💍 Jewelry & Accessories", items: jewelry },
    );
    return { base, groups };
  });

export const sellerDemand = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const aggregated = [
      { signature: "color:white|fabric:lace|length:mini", count: 54, samplePrompts: ["White lace mini dress for summer date"], sampleAttributes: { color: ["white"], fabric: ["lace"], length: ["mini"] }, last: "2026-07-23" },
      { signature: "color:red|fabric:chiffon|length:maxi", count: 42, samplePrompts: ["Red chiffon flared maxi dress for formal evening"], sampleAttributes: { color: ["red"], fabric: ["chiffon"], length: ["maxi"] }, last: "2026-07-23" },
    ];
    return { aggregated, total: 96 };
  });
