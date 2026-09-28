import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { SAMPLE_PRODUCTS, normalizeProduct } from "./products";

// Fallback in-memory state for guest session
const GUEST_LOOM = new Map<string, { id: string; product_id: string; selected_attributes: any; products: any }>();
const GUEST_CART = new Map<string, { id: string; qty: number; product_id: string; products: any }>();
const GUEST_SWIPES = new Map<string, { product_id: string; direction: string; products: any }>();

// ---- StyleLoom Collection ----
export const addToStyleloom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = normalizeProduct(SAMPLE_PRODUCTS.find(x => x.id === data.productId) || { id: data.productId, title: "Fashion Dress" });
    GUEST_LOOM.set(data.productId, { id: `loom-${data.productId}`, product_id: data.productId, selected_attributes: {}, products: p });
    try {
      await context.supabase
        .from("styleloom_items")
        .upsert({ user_id: context.userId, product_id: data.productId, selected_attributes: {} }, { onConflict: "user_id,product_id" });
    } catch (e) {}
    return { ok: true };
  });

export const removeFromStyleloom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    GUEST_LOOM.delete(data.productId);
    try {
      await context.supabase.from("styleloom_items").delete().eq("user_id", context.userId).eq("product_id", data.productId);
    } catch (e) {}
    return { ok: true };
  });

export const updateStyleloomAttributes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string(), attributes: z.record(z.array(z.string())) }).parse(d))
  .handler(async ({ data, context }) => {
    const item = GUEST_LOOM.get(data.productId);
    if (item) item.selected_attributes = data.attributes;
    try {
      await context.supabase.from("styleloom_items")
        .update({ selected_attributes: data.attributes })
        .eq("user_id", context.userId).eq("product_id", data.productId);
    } catch (e) {}
    return { ok: true };
  });

export const listStyleloom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data } = await context.supabase
        .from("styleloom_items")
        .select("id, product_id, selected_attributes, products:products(*)")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false });
      if (data && data.length) return data.map(item => ({ ...item, products: normalizeProduct(item.products) }));
    } catch (e) {}
    return Array.from(GUEST_LOOM.values()).map(item => ({ ...item, products: normalizeProduct(item.products) }));
  });

// ---- Cart ----
export const addToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const item = GUEST_CART.get(data.productId);
    const p = normalizeProduct(SAMPLE_PRODUCTS.find(x => x.id === data.productId) || { id: data.productId, title: "Fashion Dress" });
    if (item) item.qty += 1;
    else GUEST_CART.set(data.productId, { id: `cart-${data.productId}`, qty: 1, product_id: data.productId, products: p });
    try {
      const existing = await context.supabase.from("cart_items").select("id, qty").eq("user_id", context.userId).eq("product_id", data.productId).maybeSingle();
      if (existing.data) {
        await context.supabase.from("cart_items").update({ qty: existing.data.qty + 1 }).eq("id", existing.data.id);
      } else {
        await context.supabase.from("cart_items").insert({ user_id: context.userId, product_id: data.productId, qty: 1 });
      }
    } catch (e) {}
    return { ok: true };
  });

export const removeCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    GUEST_CART.delete(data.productId);
    try {
      await context.supabase.from("cart_items").delete().eq("user_id", context.userId).eq("product_id", data.productId);
    } catch (e) {}
    return { ok: true };
  });

export const listCart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data } = await context.supabase
        .from("cart_items").select("id, qty, product_id, products:products(*)").eq("user_id", context.userId);
      if (data && data.length) return data.map(item => ({ ...item, products: normalizeProduct(item.products) }));
    } catch (e) {}
    return Array.from(GUEST_CART.values()).map(item => ({ ...item, products: normalizeProduct(item.products) }));
  });

// ---- Swipes ----
export const recordSwipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string(), direction: z.enum(["like","dislike"]), product: z.any().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let p = data.product ? normalizeProduct(data.product) : normalizeProduct(SAMPLE_PRODUCTS.find(x => x.id === data.productId));
    if (!p || !p.title || p.title === "Fashion Dress") {
      p = normalizeProduct(SAMPLE_PRODUCTS[GUEST_SWIPES.size % SAMPLE_PRODUCTS.length]);
    }
    GUEST_SWIPES.set(data.productId, { product_id: data.productId, direction: data.direction, products: p });
    try {
      await context.supabase.from("swipes").insert({ user_id: context.userId, product_id: data.productId, direction: data.direction });
    } catch (e) {}
    return { ok: true };
  });

export const listLikedSwipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data } = await context.supabase
        .from("swipes").select("product_id, products:products(*)").eq("user_id", context.userId).eq("direction","like")
        .order("created_at", { ascending: false });
      if (data && data.length) {
        const seen = new Set<string>();
        return data.filter((r) => { if (seen.has(r.product_id)) return false; seen.add(r.product_id); return true; })
                   .map(item => ({ ...item, products: normalizeProduct(item.products) }));
      }
    } catch (e) {}
    return Array.from(GUEST_SWIPES.values())
      .filter(s => s.direction === "like")
      .map(item => ({ ...item, products: normalizeProduct(item.products) }));
  });

export const resetSwipeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    GUEST_SWIPES.clear();
    try {
      await context.supabase.from("swipes").delete().eq("user_id", context.userId);
    } catch (e) {}
    return { ok: true };
  });

// ---- My Loom Collection ----
// Starts empty; only ever contains what the user explicitly adds.
const GUEST_MY_LOOM = new Map<string, { id: string; product_id: string; products: any }>();

export const addToMyLoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const p = normalizeProduct(SAMPLE_PRODUCTS.find(x => x.id === data.productId) || { id: data.productId, title: "Fashion Dress" });
    GUEST_MY_LOOM.set(data.productId, { id: `myloom-${data.productId}`, product_id: data.productId, products: p });
    try {
      await context.supabase
        .from("my_loom_items")
        .upsert({ user_id: context.userId, product_id: data.productId }, { onConflict: "user_id,product_id" });
    } catch (e) {}
    return { ok: true };
  });

export const removeFromMyLoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    GUEST_MY_LOOM.delete(data.productId);
    try {
      await context.supabase.from("my_loom_items").delete().eq("user_id", context.userId).eq("product_id", data.productId);
    } catch (e) {}
    return { ok: true };
  });

export const listMyLoom = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data } = await context.supabase
        .from("my_loom_items")
        .select("id, product_id, products:products(*)")
        .eq("user_id", context.userId);
      if (data && data.length) return data.map(item => ({ ...item, products: normalizeProduct(item.products) }));
    } catch (e) {}
    return Array.from(GUEST_MY_LOOM.values()).map(item => ({ ...item, products: normalizeProduct(item.products) }));
  });

export const submitDesignRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    category: z.string(),
    attributes: z.record(z.any()),
    additionalFeatures: z.string(),
    referenceProducts: z.array(z.string()).optional()
  }).parse(d))
  .handler(async ({ data, context }) => {
    const requestId = `MYNTRA-DES-${Math.floor(100000 + Math.random() * 900000)}`;
    try {
      await context.supabase.from("design_requests").insert({
        user_id: context.userId,
        request_id: requestId,
        category: data.category,
        attributes: data.attributes,
        additional_features: data.additionalFeatures,
        reference_product_ids: data.referenceProducts || []
      });
    } catch (e) {}
    return { ok: true, requestId };
  });
