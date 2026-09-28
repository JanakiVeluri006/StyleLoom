import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { 
  X, Sparkles, Trash2, Check, Layers, Users, 
  Heart, RotateCcw, Shirt, Search, CheckCircle2, ShoppingBag, Plus, Palette, Send, FileText 
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { 
  listStyleloom, removeFromStyleloom, updateStyleloomAttributes, recordSwipe, addToCart,
  listMyLoom, addToMyLoom, removeFromMyLoom, submitDesignRequest
} from "@/lib/styleloom.functions";
import { getPairings, getMatchingOutfits } from "@/lib/recommendations.functions";
import { SAMPLE_PRODUCTS, normalizeProduct, Product, inferSubCategory, scoreProduct } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/styleloom")({
  head: () => ({
    meta: [
      { title: "StyleLoom Studio — Inspirations, My Loom & Make My Design" },
      { name: "description", content: "Curate style inspirations, swipe favorites, build My Loom, generate Make My Fit & send custom specifications to Myntra Design Team." },
    ],
  }),
  component: StyleloomPage,
});

type BucketAttr = { key: string; value: string };
type GenderType = "WOMEN" | "MEN" | "KIDS" | "GENZ" | "ALL";
type MainTabType = "INSPIRATIONS" | "MY_LOOM";

const GENDER_TABS: { id: GenderType; label: string }[] = [
  { id: "WOMEN", label: "Women" },
  { id: "MEN", label: "Men" },
  { id: "KIDS", label: "Kids" },
  { id: "GENZ", label: "GenZ" },
  { id: "ALL", label: "All Genders" },
];

const GENDER_SUBTYPES: Record<GenderType, { id: string; label: string }[]> = {
  WOMEN: [
    { id: "ALL", label: "All Types" },
    { id: "dresses", label: "Dresses & Maxis" },
    { id: "tops", label: "Tops & Shirts" },
    { id: "kurtas", label: "Kurtas & Kurtis" },
    { id: "bottoms", label: "Trousers & Jeans" },
    { id: "ethnic", label: "Sarees & Ethnic" },
    { id: "footwear", label: "Heels & Shoes" },
    { id: "bags", label: "Bags & Clutches" },
    { id: "beauty", label: "Beauty & Skincare" },
  ],
  MEN: [
    { id: "ALL", label: "All Types" },
    { id: "suits", label: "Suits & Blazers" },
    { id: "shirts", label: "Shirts" },
    { id: "bottoms", label: "Trousers & Jeans" },
    { id: "footwear", label: "Shoes & Boots" },
    { id: "beauty", label: "Beauty & Skincare" },
  ],
  KIDS: [
    { id: "ALL", label: "All Types" },
    { id: "frocks", label: "Party Frocks" },
    { id: "dungarees", label: "Dungarees & Sets" },
    { id: "shorts", label: "Casual Shorts" },
    { id: "beauty", label: "Beauty & Skincare" },
  ],
  GENZ: [
    { id: "ALL", label: "All Types" },
    { id: "tops", label: "Y2K Crop Tops" },
    { id: "hoodies", label: "Oversized Hoodies" },
    { id: "cargos", label: "Cargo Pants" },
    { id: "beauty", label: "Beauty & Skincare" },
  ],
  ALL: [
    { id: "ALL", label: "All Types" },
    { id: "dresses", label: "Dresses" },
    { id: "shirts", label: "Shirts" },
    { id: "bottoms", label: "Bottomwear" },
    { id: "ethnic", label: "Ethnic" },
    { id: "beauty", label: "Beauty & Skincare" },
  ],
};

function getItemAttributes(p: any): { key: string; label: string; value: string }[] {
  if (!p) return [];
  const attrs: { key: string; label: string; value: string }[] = [];
  if (p.color) attrs.push({ key: "color", label: "Color", value: p.color });
  if (p.fabric) attrs.push({ key: "fabric", label: "Fabric", value: p.fabric });
  if (p.pattern) attrs.push({ key: "pattern", label: "Pattern", value: p.pattern });
  if (p.neckline) attrs.push({ key: "neckline", label: "Neckline", value: p.neckline });
  if (p.sleeve) attrs.push({ key: "sleeve", label: "Sleeve", value: p.sleeve });
  if (p.length) attrs.push({ key: "length", label: "Length", value: p.length });
  if (p.fit) attrs.push({ key: "fit", label: "Fit", value: p.fit });
  if (p.occasion) attrs.push({ key: "occasion", label: "Occasion", value: p.occasion });
  if (p.style) attrs.push({ key: "style", label: "Style", value: p.style });
  return attrs;
}

function matchesGender(p: Product, gender: GenderType): boolean {
  if (gender === "ALL") return true;
  const cat = p.category;
  const title = (p.title || "").toLowerCase();

  if (gender === "WOMEN") {
    return cat === "women" || cat === "dress" || cat === "ethnic" || cat === "beauty" || (cat.startsWith("accessory") && !title.includes("men"));
  }
  if (gender === "MEN") {
    // Word-boundary check for "suit" -- a plain substring match also fires
    // on "jumpsuit", which wrongly pulled women's/kids' jumpsuits into Men's.
    return cat === "men" || cat === "beauty" || (title.includes("men") && !title.includes("women")) || /\bsuits?\b/.test(title) || title.includes("tuxedo") || title.includes("blazer");
  }
  if (gender === "KIDS") {
    return cat === "kids" || cat === "beauty" || title.includes("kids") || title.includes("frock") || title.includes("dungaree");
  }
  if (gender === "GENZ") {
    return cat === "genz" || cat === "beauty" || title.includes("genz") || title.includes("y2k") || title.includes("hoodie");
  }
  return true;
}

// Single source of truth for the Type filter (dresses/shirts/bottoms/etc),
// shared by the Saved Inspirations grid, swipe deck, and catalog search.
// Uses inferSubCategory as the base classifier, with title checks only for
// sub-types it can't distinguish on its own (suits vs. other outerwear,
// hoodies vs. other tops).
function matchesSubType(p: Product, subType: string): boolean {
  if (subType === "ALL") return true;
  const title = (p.title || "").toLowerCase();
  const sub = inferSubCategory(p);

  if (subType === "dresses" || subType === "frocks") {
    return sub === "dress";
  }
  if (subType === "hoodies") {
    return sub === "top" && title.includes("hoodie");
  }
  // "tops" (Women/GenZ) excludes kurtas since they have their own pill below;
  // "shirts" (Men/All) is left as-is so Men's Shirts tab keeps showing the
  // kurtas it already did.
  if (subType === "tops") {
    return sub === "top" && !/kurtas?\b|kurtis?\b/.test(title);
  }
  if (subType === "shirts") {
    return sub === "top";
  }
  if (subType === "kurtas") {
    return /kurtas?\b|kurtis?\b/.test(title);
  }
  if (subType === "suits") {
    return sub === "outerwear" || /\bsuits?\b/.test(title) || title.includes("tuxedo");
  }
  if (subType === "bottoms" || subType === "cargos" || subType === "shorts" || subType === "dungarees") {
    return sub === "bottom";
  }
  if (subType === "ethnic") {
    return sub === "ethnic-set" || p.category === "ethnic";
  }
  if (subType === "footwear") {
    return sub === "footwear";
  }
  if (subType === "bags") {
    return sub === "bag";
  }
  if (subType === "beauty") {
    return sub === "beauty";
  }
  return true;
}

function matchesColorFabric(p: Product, color: string, fabric: string): boolean {
  if (color !== "ALL" && (p.color || "").toLowerCase() !== color.toLowerCase()) return false;
  if (fabric !== "ALL" && (p.fabric || "").toLowerCase() !== fabric.toLowerCase()) return false;
  return true;
}

function StyleloomPage() {
  const qc = useQueryClient();
  const list = useServerFn(listStyleloom);
  const remove = useServerFn(removeFromStyleloom);
  const update = useServerFn(updateStyleloomAttributes);
  const swipe = useServerFn(recordSwipe);
  const add = useServerFn(addToCart);
  const pair = useServerFn(getPairings);

  // My Loom & Design Functions
  const fetchMyLoom = useServerFn(listMyLoom);
  const addMyLoomFn = useServerFn(addToMyLoom);
  const removeMyLoomFn = useServerFn(removeFromMyLoom);
  const submitDesignFn = useServerFn(submitDesignRequest);

  // Queries
  const items = useQuery({ queryKey: ["styleloom"], queryFn: () => list() });
  const myLoomQuery = useQuery({ queryKey: ["my_loom"], queryFn: () => fetchMyLoom() });

  // Main Segmented Tab State
  const [activeMainTab, setActiveMainTab] = useState<MainTabType>("INSPIRATIONS");

  // Inspirations Filter States
  const [selectedGender, setSelectedGender] = useState<GenderType>("WOMEN");
  const [selectedSubType, setSelectedSubType] = useState<string>("ALL");
  const [selectedColorFilter, setSelectedColorFilter] = useState<string>("ALL");
  const [selectedFabricFilter, setSelectedFabricFilter] = useState<string>("ALL");
  const [customRequirement, setCustomRequirement] = useState("");

  // Search & Deck States
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [deckProducts, setDeckProducts] = useState<Product[]>([]);
  const [deckIdx, setDeckIdx] = useState(0);
  const [likedProducts, setLikedProducts] = useState<Product[]>([]);
  const [isSwipingDone, setIsSwipingDone] = useState(false);

  // Modal States
  const [outfitBaseId, setOutfitBaseId] = useState<string | null>(null);
  const [isMakeMyFitOpen, setIsMakeMyFitOpen] = useState(false);
  
  // Make My Design States
  const [isMakeMyDesignOpen, setIsMakeMyDesignOpen] = useState(false);
  const [additionalFeatures, setAdditionalFeatures] = useState("");
  const [designSubmittedId, setDesignSubmittedId] = useState<string | null>(null);
  const [selectedLoomOutfitIds, setSelectedLoomOutfitIds] = useState<Set<string>>(new Set());

  // Mutations
  const removeM = useMutation({
    mutationFn: (productId: string) => remove({ data: { productId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["styleloom"] }),
  });

  const addCartM = useMutation({
    mutationFn: (productId: string) => add({ data: { productId } }),
    onSuccess: () => toast.success("Added to Bag!"),
  });

  const addMyLoomM = useMutation({
    mutationFn: (productId: string) => addMyLoomFn({ data: { productId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_loom"] });
      toast.success("Added to My Loom!");
    },
  });

  const removeMyLoomM = useMutation({
    mutationFn: (productId: string) => removeMyLoomFn({ data: { productId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my_loom"] });
      toast.success("Removed from My Loom");
    },
  });

  const submitDesignM = useMutation({
    mutationFn: (data: { category: string; attributes: any; additionalFeatures: string; referenceProducts?: string[] }) =>
      submitDesignFn({ data }),
    onSuccess: (res) => {
      setDesignSubmittedId(res.requestId);
      toast.success(`Design Submitted to Myntra Design Team! Ref ID: ${res.requestId}`);
    },
  });

  // Filter saved items strictly for active gender
  const categorySavedItems = useMemo(() => {
    if (!items.data) return [];
    return items.data.filter((it: any) => {
      const norm = normalizeProduct(it.products);
      return matchesGender(norm, selectedGender);
    });
  }, [items.data, selectedGender]);

  // Filter saved items by Sub-Type & Attributes (uses the same matchesSubType /
  // matchesColorFabric helpers as the swipe deck & catalog search below, so
  // Type/Color/Fabric filters behave identically everywhere on this page).
  const filteredSavedItems = useMemo(() => {
    return categorySavedItems.filter((it: any) => {
      const p = normalizeProduct(it.products);
      return matchesSubType(p, selectedSubType) && matchesColorFabric(p, selectedColorFilter, selectedFabricFilter);
    });
  }, [categorySavedItems, selectedSubType, selectedColorFilter, selectedFabricFilter]);

  // Aggregate preference bucket for active category
  const bucket = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const it of categorySavedItems) {
      const a = (it.selected_attributes as Record<string, string[]>) ?? {};
      for (const [k, arr] of Object.entries(a)) for (const v of arr) {
        if (!map.has(k)) map.set(k, new Set());
        map.get(k)!.add(v);
      }
    }
    const flat: BucketAttr[] = [];
    map.forEach((set, key) => set.forEach((value) => flat.push({ key, value })));
    return flat;
  }, [categorySavedItems]);

  useEffect(() => {
    setSelectedSubType("ALL");
    setSelectedColorFilter("ALL");
    setSelectedFabricFilter("ALL");
    setIsSearchActive(false);
    setIsSwipingDone(false);
    setLikedProducts([]);
    setDeckIdx(0);
    setCustomRequirement("");
  }, [selectedGender]);

  // Pairs tops with the best-matching bottom already in My Loom, flags
  // unmatched pieces, and only suggests catalog additions for what's
  // actually missing (e.g. footwear only if none is saved yet).
  const loomEnsemble = useMemo(() => {
    const rawLoomItems: any[] = myLoomQuery.data || [];
    const loomProducts = rawLoomItems.map((it) => normalizeProduct(it.products));

    const bySub: Record<string, Product[]> = {};
    for (const p of loomProducts) {
      const sub = inferSubCategory(p);
      (bySub[sub] ||= []).push(p);
    }

    type Outfit = { pieces: Product[]; label: string };
    const completeOutfits: Outfit[] = [];

    for (const p of [...(bySub["dress"] || []), ...(bySub["ethnic-set"] || [])]) {
      completeOutfits.push({ pieces: [p], label: "Complete Piece" });
    }

    const tops = [...(bySub["top"] || [])];
    const bottoms = [...(bySub["bottom"] || [])];
    const usedBottomIds = new Set<string>();
    const pairedTopIds = new Set<string>();

    for (const top of tops) {
      const targetAttrs: Record<string, string[]> = {};
      for (const key of ["style", "occasion", "fabric"] as const) {
        const v = (top as any)[key];
        if (v) targetAttrs[key] = [v];
      }
      const candidates = bottoms.filter((b) => !usedBottomIds.has(b.id));
      const ranked = candidates
        .map((b) => ({ b, s: scoreProduct(b, targetAttrs) }))
        .sort((a, b) => b.s - a.s);

      if (ranked.length && ranked[0].s > 0) {
        usedBottomIds.add(ranked[0].b.id);
        pairedTopIds.add(top.id);
        completeOutfits.push({ pieces: [top, ranked[0].b], label: "Top + Bottom" });
      }
    }

    const unpairedTops = tops.filter((t) => !pairedTopIds.has(t.id));
    const unpairedBottoms = bottoms.filter((b) => !usedBottomIds.has(b.id));
    const outerwear = bySub["outerwear"] || [];
    const hasFootwear = (bySub["footwear"] || []).length > 0;
    const hasBag = (bySub["bag"] || []).length > 0;
    const hasJewelry = (bySub["jewelry"] || []).length > 0;

    // Aggregate style/occasion/color/fabric signals across everything in the
    // Loom so catalog suggestions actually coordinate with what's saved.
    const agg: Record<string, string[]> = {};
    const bump = (key: string, v?: string) => {
      if (!v) return;
      agg[key] = agg[key] ? Array.from(new Set([...agg[key], v])) : [v];
    };
    for (const p of loomProducts) {
      bump("style", p.style);
      bump("occasion", p.occasion);
      bump("color", p.color);
      bump("fabric", p.fabric);
    }

    const loomIds = new Set(loomProducts.map((p) => p.id));
    function suggestFromCatalog(sub: string, limit = 4) {
      const cands = SAMPLE_PRODUCTS.filter((p) => !loomIds.has(p.id) && inferSubCategory(p) === sub);
      return cands
        .map((p) => ({ p, s: scoreProduct(p, agg) }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit)
        .map((r) => r.p);
    }

    const suggestions: { key: string; label: string; items: Product[] }[] = [];
    if (unpairedTops.length > 0) {
      suggestions.push({ key: "bottom", label: "👖 Bottoms to complete your tops", items: suggestFromCatalog("bottom") });
    }
    if (unpairedBottoms.length > 0) {
      suggestions.push({ key: "top", label: "👕 Tops to complete your bottoms", items: suggestFromCatalog("top") });
    }
    if (!hasFootwear) suggestions.push({ key: "footwear", label: "👟 Footwear", items: suggestFromCatalog("footwear") });
    if (!hasBag) suggestions.push({ key: "bag", label: "👜 Bags", items: suggestFromCatalog("bag") });
    if (!hasJewelry) suggestions.push({ key: "jewelry", label: "💍 Jewelry", items: suggestFromCatalog("jewelry") });

    return { completeOutfits, unpairedTops, unpairedBottoms, outerwear, suggestions };
  }, [myLoomQuery.data]);

  function handleSearchCatalog() {
    const genderFiltered = SAMPLE_PRODUCTS.filter((p) => matchesGender(p, selectedGender));

    // Hard filters (Gender + Type + Color + Fabric) are never relaxed or dropped.
    const hardFiltered = genderFiltered.filter(
      (p) => matchesSubType(p, selectedSubType) && matchesColorFabric(p, selectedColorFilter, selectedFabricFilter)
    );

    let filtered = hardFiltered;

    // Soft filter: attributes picked in My Bucket, across all attribute types.
    const selectedByKey: Record<string, string[]> = {};
    for (const b of bucket) {
      const key = b.key;
      const val = b.value.toLowerCase();
      selectedByKey[key] = selectedByKey[key] ? [...selectedByKey[key], val] : [val];
    }
    const activeKeys = Object.keys(selectedByKey);

    if (activeKeys.length > 0) {
      // Strict: every selected bucket attribute must match, on top of the hard filters.
      const strict = hardFiltered.filter((p) =>
        activeKeys.every((key) => selectedByKey[key].includes(((p as any)[key] || "").toLowerCase()))
      );

      if (strict.length > 0) {
        filtered = strict;
      } else {
        // Fall back to matching at least one bucket attribute, still within the hard filters.
        const partial = hardFiltered.filter((p) =>
          activeKeys.some((key) => selectedByKey[key].includes(((p as any)[key] || "").toLowerCase()))
        );
        if (partial.length > 0) {
          filtered = partial;
          toast.info("No item matched every My Bucket attribute within your current Type/Color/Fabric selection — showing the closest partial matches instead.");
        } else {
          filtered = hardFiltered;
          toast.info("Nothing matching your current Type/Color/Fabric selection also matches My Bucket — showing items matching your filters instead.");
        }
      }
    }

    if (customRequirement.trim()) {
      const q = customRequirement.trim().toLowerCase();
      const textMatches = filtered.filter(p => 
        (p.title + " " + p.brand + " " + p.color + " " + p.fabric + " " + (p.style || "") + " " + (p.occasion || "")).toLowerCase().includes(q)
      );
      if (textMatches.length > 0) {
        filtered = textMatches;
      }
    }

    // Type/Color/Fabric are never dropped, even at zero results.
    if (filtered.length === 0) {
      toast.info(`No products match your Type/Color/Fabric selection for ${selectedGender}. Try loosening one of them.`);
    } else if (activeKeys.length > 0) {
      toast.success(`Found ${filtered.length} products matching your filters & bucket attributes!`);
    } else {
      toast.success(`Found ${filtered.length} products matching your filters!`);
    }

    setDeckProducts(filtered);
    setDeckIdx(0);
    setIsSearchActive(true);
    setIsSwipingDone(false);
    setLikedProducts([]);
  }

  async function handleSwipeCard(dir: "like" | "dislike") {
    const currentProduct = deckProducts[deckIdx];
    if (!currentProduct) return;

    if (dir === "like") {
      setLikedProducts(prev => [...prev, currentProduct]);

      const attrs: Record<string, string[]> = {};
      if (currentProduct.color) attrs.color = [currentProduct.color];
      if (currentProduct.fabric) attrs.fabric = [currentProduct.fabric];
      if (currentProduct.pattern) attrs.pattern = [currentProduct.pattern];
      if (currentProduct.fit) attrs.fit = [currentProduct.fit];

      await swipe({ data: { productId: currentProduct.id, direction: "like", product: currentProduct } });
      await update({ data: { productId: currentProduct.id, attributes: attrs } });
      qc.invalidateQueries({ queryKey: ["styleloom"] });
      toast.success(`Liked ${currentProduct.title}!`);
    }

    const nextIdx = deckIdx + 1;
    setDeckIdx(nextIdx);

    if (nextIdx >= deckProducts.length) {
      setIsSwipingDone(true);
    }
  }

  async function toggleAttr(productId: string, key: string, value: string) {
    const item = items.data?.find((i) => i.product_id === productId);
    if (!item) return;
    const cur = { ...(item.selected_attributes as Record<string, string[]> || {}) };
    const set = new Set(cur[key] ?? []);
    if (set.has(value)) set.delete(value); else set.add(value);
    cur[key] = [...set];
    await update({ data: { productId, attributes: cur } });
    qc.invalidateQueries({ queryKey: ["styleloom"] });
  }

  async function removeBucket(attr: BucketAttr) {
    for (const it of categorySavedItems) {
      const cur = { ...(it.selected_attributes as Record<string, string[]> || {}) };
      if (cur[attr.key]?.includes(attr.value)) {
        cur[attr.key] = cur[attr.key].filter((v) => v !== attr.value);
        await update({ data: { productId: it.product_id, attributes: cur } });
      }
    }
    qc.invalidateQueries({ queryKey: ["styleloom"] });
  }

  const pairingQuery = useQuery({
    queryKey: ["single_pair", outfitBaseId],
    queryFn: () => pair({ data: { productId: outfitBaseId! } }),
    enabled: !!outfitBaseId,
  });

  if (items.isLoading || myLoomQuery.isLoading) return <PageShell><div className="h-96 animate-pulse rounded-2xl bg-muted" /></PageShell>;

  const currentSubTypes = GENDER_SUBTYPES[selectedGender] || GENDER_SUBTYPES.WOMEN;
  const myLoomItems = myLoomQuery.data || [];

  function openMakeMyDesignStudio() {
    setDesignSubmittedId(null);
    setSelectedLoomOutfitIds(new Set(myLoomItems.map((it: any) => it.product_id)));
    setIsMakeMyDesignOpen(true);
  }

  return (
    <PageShell wide>
      
      {/* Balanced Top Header Bar (Full Screen Width) */}
      <div className="mb-4 flex flex-wrap items-center justify-between border-b border-[#eaeaec] pb-3 gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-[0.16em] text-[#282c3f]">StyleLoom Studio</h1>
        </div>

        {/* Right Side Mode Buttons (Clean Typography, No Emojis except Make My Design) */}
        <div className="flex items-center rounded-full bg-[#f5f5f6] p-1 border border-[#eaeaec] flex-wrap sm:flex-nowrap gap-1">
          <button
            onClick={() => setActiveMainTab("INSPIRATIONS")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition uppercase tracking-wider ${
              activeMainTab === "INSPIRATIONS"
                ? "bg-[#ff3f6c] text-white shadow-sm font-black"
                : "text-[#282c3f] hover:text-[#ff3f6c]"
            }`}
          >
            <span>Studio Catalog</span>
          </button>

          <button
            onClick={() => setActiveMainTab("MY_LOOM")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition uppercase tracking-wider ${
              activeMainTab === "MY_LOOM"
                ? "bg-[#ff3f6c] text-white shadow-sm font-black"
                : "text-[#282c3f] hover:text-[#ff3f6c]"
            }`}
          >
            <span>My Loom ({myLoomItems.length})</span>
          </button>

          <button
            onClick={openMakeMyDesignStudio}
            className="flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition uppercase tracking-wider bg-[#282c3f] text-white hover:bg-[#ff3f6c] shadow-sm"
          >
            <Palette className="h-3.5 w-3.5" />
            <span>Make My Design</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STUDIO CATALOG / INSPIRATIONS VIEW                                */}
      {/* ========================================================================= */}
      {activeMainTab === "INSPIRATIONS" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          
          {/* Official Bold Myntra Full-Width Category Tabs (Bold Uppercase Assistant Typography) */}
          <div className="mb-4 border-b-2 border-[#eaeaec] w-full text-sm md:text-base font-extrabold uppercase tracking-[0.14em] text-[#282c3f]">
            <div className="flex items-center justify-between sm:justify-around overflow-x-auto flex-nowrap scrollbar-none w-full gap-2 sm:gap-4">
              {GENDER_TABS.map((g) => {
                const active = selectedGender === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setSelectedGender(g.id)}
                    className={`flex-1 flex shrink-0 items-center justify-center py-3.5 transition-all whitespace-nowrap border-b-[3px] text-center ${
                      active
                        ? "border-[#ff3f6c] text-[#ff3f6c] font-black bg-rose-50/40"
                        : "border-transparent text-[#282c3f] hover:text-[#ff3f6c] hover:bg-gray-50"
                    }`}
                  >
                    <span>{g.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sleek Balanced Myntra Sub-Filters */}
          <div className="mb-6 space-y-3">
            
            {/* Clothing Types (Bold Clean Typography, No Emojis) */}
            <div className="flex items-center justify-start sm:justify-around gap-2 overflow-x-auto flex-nowrap scrollbar-none w-full py-1">
              {currentSubTypes.map((st) => {
                const active = selectedSubType === st.id;
                return (
                  <button
                    key={st.id}
                    onClick={() => setSelectedSubType(st.id)}
                    className={`flex-1 sm:flex-initial flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition whitespace-nowrap border shadow-xs ${
                      active
                        ? "bg-[#282c3f] border-[#282c3f] text-white font-black"
                        : "bg-white border-[#eaeaec] text-[#282c3f] hover:border-[#282c3f]"
                    }`}
                  >
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Color & Fabric Filter Toolbar (Clean Bold Typography, No Emojis) */}
            <div className="rounded-2xl border border-[#eaeaec] bg-[#f5f5f6]/80 p-3.5 md:p-4 space-y-3 shadow-xs w-full">
              
              {/* Color Row */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#282c3f]">Color:</span>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 md:gap-2 w-full">
                  {["ALL", "White", "Red", "Green", "Yellow", "Black", "Blue", "Gold"].map((color) => (
                    <button
                      key={color}
                      onClick={() => setSelectedColorFilter(color)}
                      className={`flex items-center justify-center rounded-xl py-1.5 px-2 text-[11px] font-bold uppercase tracking-wider transition border text-center w-full truncate ${
                        selectedColorFilter === color
                          ? "bg-[#ff3f6c] border-[#ff3f6c] text-white shadow-sm font-extrabold"
                          : "bg-white border-[#eaeaec] text-[#282c3f] hover:border-[#ff3f6c]"
                      }`}
                    >
                      <span className="truncate">{color}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fabric Row */}
              <div className="space-y-1.5 border-t border-[#eaeaec] pt-2.5">
                <span className="text-[11px] font-black uppercase tracking-[0.1em] text-[#282c3f]">Fabric:</span>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 md:gap-2 w-full">
                  {["ALL", "Lace", "Chiffon", "Satin", "Cotton", "Knit", "Linen"].map((fabric) => (
                    <button
                      key={fabric}
                      onClick={() => setSelectedFabricFilter(fabric)}
                      className={`flex items-center justify-center rounded-xl py-1.5 px-2 text-[11px] font-bold uppercase tracking-wider transition border text-center w-full truncate ${
                        selectedFabricFilter === fabric
                          ? "bg-[#ff3f6c] border-[#ff3f6c] text-white shadow-sm font-extrabold"
                          : "bg-white border-[#eaeaec] text-[#282c3f] hover:border-[#ff3f6c]"
                      }`}
                    >
                      <span className="truncate">{fabric}</span>
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Main Inspirations Grid */}
          <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
            
            {/* Left Column: Saved Inspirations + Swiped Products Box & Deck */}
            <div className="space-y-6">
              
              {/* Saved Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base md:text-lg font-black uppercase tracking-[0.12em] text-[#282c3f]">
                    Saved Inspirations ({filteredSavedItems.length})
                  </h2>
                </div>

                {filteredSavedItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#eaeaec] p-6 text-center bg-[#f5f5f6]">
                    <Shirt className="mx-auto h-7 w-7 text-[#7e818c]" />
                    <p className="mt-2 text-xs font-bold text-[#282c3f]">No saved inspirations matching filters in {selectedGender}.</p>
                    <p className="mt-1 text-[11px] text-[#7e818c]">
                      Add items from <Link to="/browse" className="text-[#ff3f6c] font-bold underline">Catalog Browse</Link>!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredSavedItems.map((it) => (
                      <StyleloomRowItem
                        key={it.id}
                        item={it}
                        onToggle={(k, v) => toggleAttr(it.product_id, k, v)}
                        onRemove={() => removeM.mutate(it.product_id)}
                        onOpenOutfit={() => setOutfitBaseId(it.product_id)}
                        onAddToMyLoom={() => addMyLoomM.mutate(it.product_id)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Swiped Products Box & Catalog Search */}
              <div className="rounded-3xl border border-[#eaeaec] bg-gradient-to-b from-[#fff5f2]/40 via-white to-white p-4 md:p-6 shadow-sm space-y-6">
                <div>
                  <h2 className="text-base md:text-lg font-black uppercase tracking-[0.12em] text-[#282c3f] mb-1">
                    Explore Matched Catalog Swiping
                  </h2>
                  <p className="text-xs text-[#7e818c] mb-3">Swipe styles strictly matching your attributes in My Bucket.</p>

                  {/* Custom Search Input */}
                  <div className="space-y-2.5">
                    <div className="relative">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#7e818c]" />
                      <input
                        type="text"
                        value={customRequirement}
                        onChange={(e) => setCustomRequirement(e.target.value)}
                        placeholder="Type specific style preferences..."
                        className="w-full rounded-full border border-[#eaeaec] bg-white py-2.5 pl-10 pr-4 text-xs text-[#282c3f] focus:border-[#ff3f6c] focus:outline-none focus:ring-1 focus:ring-[#ff3f6c] transition shadow-sm"
                      />
                    </div>
                    <button
                      onClick={handleSearchCatalog}
                      className="w-full rounded-full bg-gradient-to-r from-[#ff3f6c] to-[#ff905a] py-2.5 text-xs font-bold text-white shadow-md hover:opacity-95 transition uppercase tracking-wider"
                    >
                      Search Catalog & Generate Deck
                    </button>
                  </div>
                </div>

                {/* Active Swipe Card Deck */}
                {isSearchActive && !isSwipingDone && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-[#535766]">
                        Card {deckIdx + 1} of {deckProducts.length}
                      </span>
                      <button
                        onClick={() => setIsSwipingDone(true)}
                        className="text-xs font-bold text-[#ff3f6c] hover:underline"
                      >
                        Done Swiping →
                      </button>
                    </div>

                    <div className="relative mx-auto h-[420px] w-full max-w-sm my-3">
                      <AnimatePresence>
                        {deckProducts.slice(deckIdx, deckIdx + 3).reverse().map((p, i, arr) => {
                          const top = i === arr.length - 1;
                          return (
                            <StyleloomSwipeCard
                              key={p.id}
                              product={p}
                              top={top}
                              depth={arr.length - 1 - i}
                              onSwipe={top ? handleSwipeCard : undefined}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-center gap-6 mt-3">
                      <button 
                        onClick={() => handleSwipeCard("dislike")} 
                        className="grid h-12 w-12 place-items-center rounded-full border border-[#eaeaec] bg-white shadow-md hover:scale-110 hover:border-[#ff3f6c] hover:text-[#ff3f6c] transition text-[#535766]"
                      >
                        <X className="h-5 w-5" />
                      </button>
                      <button 
                        onClick={() => setIsSwipingDone(true)} 
                        className="rounded-full border border-[#eaeaec] bg-white px-5 py-2 text-xs font-bold text-[#282c3f] hover:border-[#ff3f6c] transition"
                      >
                        Finish Swiping
                      </button>
                      <button 
                        onClick={() => handleSwipeCard("like")} 
                        className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-r from-[#ff3f6c] to-[#ff905a] text-white shadow-lg hover:scale-110 transition"
                      >
                        <Heart className="h-5 w-5 fill-white" />
                      </button>
                    </div>
                  </div>
                )}

                {/* DEDICATED SWIPED PRODUCTS CONTAINER BOX + MAKE MY DESIGN BUTTON BELOW IT */}
                <div className="rounded-2xl border-2 border-[#ffe0d1] bg-gradient-to-b from-[#fff3e5]/60 via-[#fff8ee]/40 to-white p-4 shadow-sm space-y-4">
                  <div className="flex items-center justify-between border-b border-[#ffd8cc] pb-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-[#ff3f6c]" />
                      <h3 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-[#282c3f]">
                        Swiped Attributes ({likedProducts.length})
                      </h3>
                    </div>
                    <span className="text-[10px] font-bold text-[#ff3f6c] uppercase bg-[#ffe0d1] px-2.5 py-0.5 rounded-full">
                      Session Inspirations
                    </span>
                  </div>

                  {likedProducts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-[#7e818c]">
                      No swiped products yet. Click "Search Catalog & Generate Deck" to start swiping and collecting inspirations!
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {likedProducts.map((p) => (
                        <div key={p.id} className="overflow-hidden rounded-2xl border border-[#eaeaec] bg-white p-2.5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                          <div>
                            <img src={p.image_url} alt={p.title} className="aspect-square w-full rounded-xl object-cover" />
                            <div className="mt-2">
                              <div className="text-[10px] font-bold text-[#ff3f6c] uppercase">{p.brand}</div>
                              <div className="truncate text-xs font-bold text-[#282c3f]">{p.title}</div>
                              <div className="mt-0.5 text-xs font-bold text-[#282c3f]">₹{p.price}</div>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1.5 pt-2 border-t border-[#eaeaec]">
                            <button 
                              onClick={() => addMyLoomM.mutate(p.id)}
                              className="w-full rounded-full bg-[#282c3f] py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#ff3f6c] transition flex items-center justify-center gap-1"
                            >
                              Add to My Loom
                            </button>
                            <button 
                              onClick={() => addCartM.mutate(p.id)}
                              className="w-full rounded-full border border-[#eaeaec] bg-white py-1 text-xs font-bold text-[#282c3f] hover:border-[#ff3f6c] hover:text-[#ff3f6c] transition flex items-center justify-center gap-1"
                            >
                              <ShoppingBag className="h-3 w-3" /> Add to Bag
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {likedProducts.length > 0 && (
                    <button
                      onClick={openMakeMyDesignStudio}
                      className="w-full mt-3 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff905a] py-3 text-xs md:text-sm font-bold text-white shadow-md hover:scale-[1.01] transition uppercase tracking-wider"
                    >
                      <Palette className="h-4 w-4" /> Make My Design
                    </button>
                  )}
                </div>

              </div>

            </div>

            {/* 3D Puff Ceramic Container "My Bucket" */}
            <PreferenceBucket3DPuff category={selectedGender} bucket={bucket} onRemove={removeBucket} />

          </div>

        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY LOOM VIEW                                                      */}
      {/* ========================================================================= */}
      {activeMainTab === "MY_LOOM" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-8">
          
          <div className="flex items-center justify-between border-b border-[#eaeaec] pb-3">
            <div>
              <h2 className="text-base md:text-lg font-black uppercase tracking-[0.12em] text-[#282c3f]">
                My Loom Wardrobe Collection ({myLoomItems.length})
              </h2>
              <p className="text-xs text-[#7e818c]">
                Unified collection of your selected dresses, shirts, and styles across all genders.
              </p>
            </div>
          </div>

          {myLoomItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#eaeaec] p-12 text-center bg-[#f5f5f6]">
              <Shirt className="mx-auto h-12 w-12 text-[#7e818c] mb-2" />
              <h3 className="text-base font-bold text-[#282c3f]">Your My Loom is Empty</h3>
              <p className="mt-1 text-xs text-[#7e818c]">
                Explore <button onClick={() => setActiveMainTab("INSPIRATIONS")} className="text-[#ff3f6c] font-bold underline">Studio Catalog</button> and add items to your Loom!
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Unified My Loom Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {myLoomItems.map((it: any) => {
                  const p = normalizeProduct(it.products);
                  return (
                    <div key={it.id} className="overflow-hidden rounded-2xl border border-[#eaeaec] bg-white p-3 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                      <div>
                        <img src={p.image_url} alt={p.title} className="aspect-square w-full rounded-xl object-cover" />
                        <div className="mt-2.5">
                          <div className="text-[10px] font-bold text-[#ff3f6c] uppercase">{p.brand}</div>
                          <div className="truncate text-xs font-bold text-[#282c3f]">{p.title}</div>
                          <div className="mt-1 text-xs font-extrabold text-[#282c3f]">₹{p.price}</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2 pt-2 border-t border-[#eaeaec]">
                        <button
                          onClick={() => setOutfitBaseId(p.id)}
                          className="w-full rounded-full bg-[#f5f5f6] border border-[#eaeaec] py-1.5 text-xs font-bold text-[#282c3f] hover:bg-[#ff3f6c] hover:border-[#ff3f6c] hover:text-white transition flex items-center justify-center gap-1.5"
                        >
                          <Layers className="h-3.5 w-3.5" /> Complete Outfit
                        </button>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => addCartM.mutate(p.id)}
                            className="flex-1 rounded-full bg-gradient-to-r from-[#ff3f6c] to-[#ff905a] py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 transition"
                          >
                            Add to Bag
                          </button>
                          <button
                            onClick={() => removeMyLoomM.mutate(p.id)}
                            title="Remove from My Loom"
                            className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 hover:bg-rose-100 hover:text-rose-600 transition"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grand "Make My Fit" Button at the Bottom */}
              <div className="rounded-3xl border border-rose-200 bg-gradient-to-r from-rose-50 via-pink-50 to-amber-50 p-6 md:p-8 text-center shadow-md">
                <Sparkles className="mx-auto h-8 w-8 text-[#ff3f6c] mb-2 animate-bounce" />
                <h3 className="text-lg md:text-xl font-black uppercase tracking-[0.12em] text-[#282c3f]">
                  Ready to Style Your Entire Look?
                </h3>
                <p className="text-xs text-[#535766] mt-1 max-w-md mx-auto">
                  Combine all the dresses, tops, and items in your My Loom to create a complete outfit ensemble.
                </p>
                <button
                  onClick={() => setIsMakeMyFitOpen(true)}
                  className="mt-4 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff905a] px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:scale-105 transition uppercase tracking-wider ring-4 ring-rose-100"
                >
                  <Sparkles className="h-4 w-4 fill-white" /> Make My Fit
                </button>
              </div>

            </div>
          )}

        </motion.div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: Complete the Outfit (With "Add to My Loom" Button)              */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {outfitBaseId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 md:p-8 shadow-2xl border border-[#eaeaec]"
            >
              <button 
                onClick={() => setOutfitBaseId(null)}
                className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-gray-100 hover:bg-rose-100 hover:text-rose-600 transition"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-[#ff3f6c] uppercase tracking-wider">
                  Complete the Outfit
                </span>
                <h2 className="mt-2 text-xl md:text-2xl font-black uppercase tracking-[0.12em] text-[#282c3f]">Matching Accessories & Footwear</h2>
              </div>

              {pairingQuery.isLoading ? (
                <div className="my-12 text-center py-12 animate-pulse text-gray-400 font-bold">Curating matching shoes, bags & jewelry...</div>
              ) : (
                <div className="mt-6 space-y-6">
                  {pairingQuery.data?.groups?.map((g: any) => (
                    <div key={g.category}>
                      <h3 className="text-base font-extrabold uppercase tracking-wider text-[#282c3f] border-b border-[#eaeaec] pb-1.5">{g.label}</h3>
                      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {g.items?.map((p: any) => {
                          const normP = normalizeProduct(p);
                          return (
                            <div key={normP.id} className="overflow-hidden rounded-2xl border border-[#eaeaec] bg-white p-2.5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                              <div>
                                <img src={normP.image_url} alt={normP.title} className="aspect-square w-full rounded-xl object-cover" />
                                <div className="mt-2">
                                  <div className="text-[10px] font-bold text-[#ff3f6c] uppercase">{normP.brand}</div>
                                  <div className="truncate text-xs font-bold text-[#282c3f]">{normP.title}</div>
                                  <div className="mt-1 text-xs font-bold text-[#282c3f]">₹{normP.price}</div>
                                </div>
                              </div>
                              <div className="mt-3 space-y-1.5">
                                <button 
                                  onClick={() => addMyLoomM.mutate(normP.id)}
                                  className="w-full rounded-full bg-[#282c3f] py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#ff3f6c] transition flex items-center justify-center gap-1"
                                >
                                  Add to My Loom
                                </button>
                                <button 
                                  onClick={() => addCartM.mutate(normP.id)}
                                  className="w-full rounded-full border border-[#eaeaec] bg-white py-1 text-xs font-bold text-[#282c3f] hover:border-[#ff3f6c] hover:text-[#ff3f6c] transition flex items-center justify-center gap-1"
                                >
                                  <ShoppingBag className="h-3 w-3" /> Add to Bag
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: MAKE MY FIT ENSEMBLE VIEW                                        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isMakeMyFitOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 md:p-8 shadow-2xl border border-[#ff3f6c]/30"
            >
              <button 
                onClick={() => setIsMakeMyFitOpen(false)}
                className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-gray-100 hover:bg-rose-100 hover:text-rose-600 transition"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <span className="rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
                  Make My Fit Ensemble
                </span>
                <h2 className="mt-2 text-xl md:text-2xl font-black uppercase tracking-[0.12em] text-[#282c3f]">
                  Curated Style Outfit Look
                </h2>
                <p className="text-xs text-[#7e818c]">
                  Combines items from your My Loom + AI curated footwear & accessory pairings.
                </p>
              </div>

              {/* Ensemble Section 1: Complete outfits actually formed from My Loom pieces */}
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#ff3f6c] border-b border-[#eaeaec] pb-1">
                    1. Outfits From Your Loom ({loomEnsemble.completeOutfits.length})
                  </h3>
                  {loomEnsemble.completeOutfits.length === 0 ? (
                    <p className="text-[11px] text-[#7e818c] mt-2">
                      No complete pairings yet — add a top and a bottom (or a dress) to My Loom to form an outfit.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {loomEnsemble.completeOutfits.map((outfit, i) => (
                        <div key={i} className="rounded-2xl border border-[#eaeaec] bg-[#faf9f7] p-3">
                          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#7e818c]">{outfit.label}</div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {outfit.pieces.map((p) => (
                              <div key={p.id} className="overflow-hidden rounded-xl border border-[#eaeaec] bg-white p-2 shadow-sm">
                                <img src={p.image_url} alt={p.title} className="aspect-square w-full rounded-lg object-cover" />
                                <div className="mt-1.5 truncate text-[11px] font-bold text-[#282c3f]">{p.title}</div>
                                <div className="text-[11px] font-extrabold text-[#282c3f]">₹{p.price}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {(loomEnsemble.unpairedTops.length > 0 || loomEnsemble.unpairedBottoms.length > 0) && (
                    <div className="mt-3">
                      <p className="text-[11px] font-bold text-[#535766]">
                        Still needs a match ({loomEnsemble.unpairedTops.length + loomEnsemble.unpairedBottoms.length}):
                      </p>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[...loomEnsemble.unpairedTops, ...loomEnsemble.unpairedBottoms].map((p) => (
                          <div key={p.id} className="overflow-hidden rounded-xl border border-dashed border-[#eaeaec] bg-white p-2">
                            <img src={p.image_url} alt={p.title} className="aspect-square w-full rounded-lg object-cover opacity-80" />
                            <div className="mt-1.5 truncate text-[11px] font-bold text-[#282c3f]">{p.title}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Ensemble Section 2: Only what's genuinely missing, matched to what's already in the Loom */}
                {loomEnsemble.suggestions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#ff3f6c] border-b border-[#eaeaec] pb-1">
                      2. Suggested Additions to Complete Your Fit
                    </h3>
                    <p className="text-[11px] text-[#7e818c] mt-1">
                      Only showing what's actually missing — matched to the color, fabric, style & occasion already in your Loom.
                    </p>

                    {loomEnsemble.suggestions.map((group) => (
                      <div key={group.key} className="mt-3">
                        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#7e818c]">{group.label}</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {group.items.length === 0 ? (
                            <p className="col-span-full text-[11px] text-[#7e818c]">No close catalog match found for this yet.</p>
                          ) : group.items.map((p) => (
                            <div key={p.id} className="overflow-hidden rounded-2xl border border-[#eaeaec] bg-white p-2.5 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                              <div>
                                <img src={p.image_url} alt={p.title} className="aspect-square w-full rounded-xl object-cover" />
                                <div className="mt-2">
                                  <div className="text-[10px] font-bold text-[#ff3f6c] uppercase">{p.brand}</div>
                                  <div className="truncate text-xs font-bold text-[#282c3f]">{p.title}</div>
                                  <div className="mt-1 text-xs font-bold text-[#282c3f]">₹{p.price}</div>
                                </div>
                              </div>
                              <div className="mt-3 space-y-1.5">
                                <button
                                  onClick={() => addMyLoomM.mutate(p.id)}
                                  className="w-full rounded-full bg-[#282c3f] py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#ff3f6c] transition flex items-center justify-center gap-1"
                                >
                                  Add to My Loom
                                </button>
                                <button
                                  onClick={() => addCartM.mutate(p.id)}
                                  className="w-full rounded-full border border-[#eaeaec] bg-white py-1 text-xs font-bold text-[#282c3f] hover:border-[#ff3f6c] hover:text-[#ff3f6c] transition flex items-center justify-center gap-1"
                                >
                                  <ShoppingBag className="h-3 w-3" /> Add to Bag
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-4 text-center border-t border-[#eaeaec]">
                  <button
                    onClick={() => {
                      myLoomItems.forEach((it: any) => addCartM.mutate(it.product_id));
                      setIsMakeMyFitOpen(false);
                      toast.success("Entire Outfit Ensemble Added to Bag!");
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff905a] px-8 py-3 text-xs font-bold text-white shadow-lg hover:scale-105 transition uppercase tracking-wider"
                  >
                    <ShoppingBag className="h-4 w-4" /> Add Complete Fit Ensemble to Bag
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: 🎨 MAKE MY DESIGN STUDIO                                          */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {isMakeMyDesignOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 md:p-8 shadow-2xl border border-purple-200"
            >
              <button 
                onClick={() => setIsMakeMyDesignOpen(false)}
                className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-gray-100 hover:bg-rose-100 hover:text-rose-600 transition"
              >
                <X className="h-4 w-4" />
              </button>

              <div>
                <span className="rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-1 text-xs font-bold text-white uppercase tracking-wider">
                  🎨 Make My Design Studio
                </span>
                <h2 className="mt-2 text-xl md:text-2xl font-black uppercase tracking-[0.12em] text-[#282c3f]">
                  Make My Design
                </h2>
                <p className="text-xs text-[#7e818c]">
                  Generate tailored design specifications from your selected attributes to send directly to the Myntra Design Team.
                </p>

                {/* Interactive Gender Selection Pills inside Modal */}
                <div className="mt-3.5 space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-[#282c3f] flex items-center justify-between">
                    <span>Select Target Gender Category:</span>
                    <span className="text-[10px] font-extrabold text-[#ff3f6c] bg-rose-50 px-2 py-0.5 rounded-full uppercase">
                      {selectedGender} MODE ACTIVE
                    </span>
                  </label>
                  <div className="flex items-center justify-between gap-1.5 rounded-2xl bg-[#f5f5f6] p-1 border border-[#eaeaec] overflow-x-auto scrollbar-none w-full">
                    {GENDER_TABS.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => setSelectedGender(g.id)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wider transition text-center whitespace-nowrap ${
                          selectedGender === g.id
                            ? "bg-[#ff3f6c] text-white shadow-md"
                            : "text-[#282c3f] hover:text-[#ff3f6c] hover:bg-white"
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {designSubmittedId ? (
                <div className="my-8 rounded-3xl bg-purple-50 border border-purple-200 p-6 md:p-8 text-center space-y-3">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-purple-600 animate-bounce" />
                  <h3 className="text-lg font-bold text-[#282c3f] uppercase tracking-wider">Design Request Sent to Myntra Design Team!</h3>
                  <div className="inline-block rounded-full bg-purple-200 px-4 py-1.5 text-xs font-extrabold text-purple-800">
                    Ref ID: {designSubmittedId}
                  </div>
                  <p className="text-xs text-[#535766] max-w-md mx-auto">
                    Our lead fashion designers and manufacturing team will review your custom {selectedGender} attributes and specifications. We'll send you a digital preview via notifications!
                  </p>
                  <button
                    onClick={() => {
                      setIsMakeMyDesignOpen(false);
                      setDesignSubmittedId(null);
                    }}
                    className="mt-2 rounded-full bg-[#282c3f] px-6 py-2.5 text-xs font-bold text-white shadow-md hover:bg-purple-700 transition uppercase tracking-wider"
                  >
                    Done & Return to Studio
                  </button>
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  
                  {/* Section 1: Compiled Product Attributes Spec Sheet (Dynamically scoped to selectedGender) */}
                  <div className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4.5 space-y-4">
                    <div className="flex items-center justify-between border-b border-purple-100 pb-2.5">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-purple-600" />
                        <h3 className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-[#282c3f]">
                          1. Compiled {selectedGender} Attribute Specifications
                        </h3>
                      </div>
                      <span className="text-[10px] font-black text-white bg-[#ff3f6c] px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        {selectedGender} MODE
                      </span>
                    </div>

                    {/* Filter Summary Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="rounded-xl bg-white p-2.5 border border-[#eaeaec]">
                        <span className="text-[10px] font-extrabold text-[#7e818c] uppercase block">Gender Category</span>
                        <span className="text-xs font-black text-[#282c3f] uppercase">{selectedGender}</span>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 border border-[#eaeaec]">
                        <span className="text-[10px] font-extrabold text-[#7e818c] uppercase block">Sub-Type</span>
                        <span className="text-xs font-black text-[#282c3f] capitalize">{selectedSubType}</span>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 border border-[#eaeaec]">
                        <span className="text-[10px] font-extrabold text-[#7e818c] uppercase block">Selected Color</span>
                        <span className="text-xs font-black text-[#ff3f6c] uppercase">{selectedColorFilter}</span>
                      </div>
                      <div className="rounded-xl bg-white p-2.5 border border-[#eaeaec]">
                        <span className="text-[10px] font-extrabold text-[#7e818c] uppercase block">Selected Fabric</span>
                        <span className="text-xs font-black text-purple-700 uppercase">{selectedFabricFilter}</span>
                      </div>
                    </div>

                    {/* User's Previously Selected Attributes for Active Gender (My Bucket) */}
                    <div className="rounded-xl bg-white p-3.5 border border-[#eaeaec] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-[#7e818c] uppercase tracking-wider">
                          Selected {selectedGender} Bucket Attributes ({bucket.length})
                        </span>
                        <span className="text-[10px] font-extrabold text-[#ff3f6c] bg-rose-50 px-2 py-0.5 rounded-full uppercase">
                          {selectedGender} Preferences
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        {bucket.length === 0 ? (
                          <span className="text-xs text-[#7e818c] italic font-semibold">
                            No attributes selected yet in {selectedGender} Bucket. Select attributes on saved items in {selectedGender} view to include them!
                          </span>
                        ) : (
                          bucket.map(b => (
                            <span key={b.key + b.value} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-[#ff3f6c] px-3.5 py-1 text-xs font-bold text-white shadow-xs">
                              <span className="opacity-75 uppercase text-[9px]">{b.key}:</span>
                              <span className="capitalize">{b.value}</span>
                            </span>
                          ))
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Section 2: Attached Reference Swiped Products */}
                  {likedProducts.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#282c3f]">
                        2. Attached Reference Inspirations ({likedProducts.length})
                      </h3>
                      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {likedProducts.map(p => (
                          <div key={p.id} className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#eaeaec]">
                            <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Section 3: Interactive Additional Features Input */}
                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-[#282c3f] flex items-center justify-between">
                      <span>3. Additional Features & Customizations</span>
                      <span className="text-[10px] font-semibold text-[#7e818c]">(Optional)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={additionalFeatures}
                      onChange={(e) => setAdditionalFeatures(e.target.value)}
                      placeholder={`Specify custom embroidery, neck depth, metallic zip finish, side pockets, hemline length, or custom sizing instructions for your ${selectedGender} design...`}
                      className="w-full rounded-2xl border border-[#eaeaec] bg-white p-3 text-xs text-[#282c3f] focus:border-purple-600 focus:outline-none focus:ring-1 focus:ring-purple-600 transition shadow-inner"
                    />
                  </div>

                  {/* Section 4: Send to Myntra Design Team Button */}
                  <div className="pt-3 border-t border-[#eaeaec] text-center">
                    <button
                      onClick={() => {
                        const attrsMap: Record<string, string[]> = {};
                        bucket.forEach(b => {
                          if (!attrsMap[b.key]) attrsMap[b.key] = [];
                          attrsMap[b.key].push(b.value);
                        });
                        submitDesignM.mutate({
                          category: selectedGender,
                          attributes: attrsMap,
                          additionalFeatures,
                          referenceProducts: likedProducts.map(p => p.id),
                        });
                      }}
                      disabled={submitDesignM.isPending}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-rose-500 py-3.5 text-xs md:text-sm font-bold text-white shadow-xl hover:scale-[1.01] transition uppercase tracking-wider"
                    >
                      <Send className="h-4 w-4" /> Send it to Myntra Design Team 🚀
                    </button>
                  </div>

                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </PageShell>
  );
}

function StyleloomSwipeCard({ product, top, depth, onSwipe }: { product: Product; top: boolean; depth: number; onSwipe?: (d: "like" | "dislike") => void }) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const likeOp = useTransform(x, [30, 100], [0, 1]);
  const nopeOp = useTransform(x, [-100, -30], [1, 0]);

  return (
    <motion.div
      style={top ? { x, rotate } : undefined}
      drag={top ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (info.offset.x > 60) onSwipe?.("like");
        else if (info.offset.x < -60) onSwipe?.("dislike");
      }}
      initial={{ scale: 1 - depth * 0.04, y: depth * 10, opacity: 1 }}
      animate={{ scale: 1 - depth * 0.04, y: depth * 10 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className="absolute inset-0 overflow-hidden rounded-2xl md:rounded-3xl bg-white border border-[#eaeaec] shadow-xl cursor-grab active:cursor-grabbing select-none touch-none"
    >
      <img 
        src={product.image_url} 
        alt={product.title} 
        className="h-full w-full object-cover pointer-events-none" 
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 text-white pointer-events-none">
        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">{product.brand}</div>
        <div className="text-sm font-bold truncate">{product.title}</div>
        <div className="mt-0.5 text-xs font-bold text-amber-300">₹{product.price}</div>
      </div>
      {top && (
        <>
          <motion.div style={{ opacity: likeOp }} className="absolute left-4 top-4 rounded-xl border-4 border-emerald-500 bg-emerald-500/20 px-3 py-1 text-lg font-black text-emerald-500 backdrop-blur-sm -rotate-12 pointer-events-none">
            LIKE ♥
          </motion.div>
          <motion.div style={{ opacity: nopeOp }} className="absolute right-4 top-4 rounded-xl border-4 border-rose-500 bg-rose-500/20 px-3 py-1 text-lg font-black text-rose-500 backdrop-blur-sm rotate-12 pointer-events-none">
            PASS ✖
          </motion.div>
        </>
      )}
    </motion.div>
  );
}

// Deterministic small rotation per tag so they read as "tossed in" rather
// than perfectly aligned, without re-randomizing on every render.
function tagRotation(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 1000;
  return (h % 9) - 4; // -4deg .. +4deg
}

const CSS_COLOR_KEYWORDS = new Set([
  "white", "red", "green", "yellow", "black", "blue", "pink", "coral",
  "beige", "brown", "purple", "orange", "gold",
]);

// Faceted (chamfered-trapezoid) bucket silhouette, shared by the outer
// border layer and inner content layer so the inner shape reads as a
// stroke around the same outline.
const BUCKET_CLIP = "polygon(4% 0%, 96% 0%, 100% 9%, 100% 91%, 87% 100%, 13% 100%, 0% 91%, 0% 9%)";

function PreferenceBucket3DPuff({ category, bucket, onRemove }: { category: string; bucket: BucketAttr[]; onRemove: (a: BucketAttr) => void }) {
  const fillPct = Math.min(100, (bucket.length / 8) * 100);

  return (
    <aside className="sticky top-20 h-fit w-full">
      <div className="relative mx-auto w-full max-w-full md:max-w-[340px] pt-9">

        {/* Swinging arc handle, riveted to the rim */}
        <svg viewBox="0 0 200 66" className="absolute top-0 left-1/2 -translate-x-1/2 w-36 md:w-40 h-12 z-20 overflow-visible pointer-events-none">
          <defs>
            <linearGradient id="handleGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ff3f6c" />
              <stop offset="100%" stopColor="#ff905a" />
            </linearGradient>
          </defs>
          <motion.path
            d="M 24 60 C 24 6, 176 6, 176 60"
            fill="none"
            stroke="url(#handleGrad)"
            strokeWidth="8"
            strokeLinecap="round"
            style={{ transformOrigin: "100px 60px" }}
            animate={{ rotate: [-2, 2, -2] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle cx="24" cy="60" r="5" fill="#282c3f" />
          <circle cx="176" cy="60" r="5" fill="#282c3f" />
        </svg>

        {/* Metal rim */}
        <div className="relative z-10 mx-auto h-5 md:h-6 w-[90%] rounded-[50%] border-4 border-pink-300 bg-gradient-to-b from-rose-100 via-pink-200 to-pink-300 shadow-md" />

        {/* Bucket body: outer layer = "border" colour, inner layer = content,
            both clipped to the same faceted vessel outline so the inner
            shape reads as a stroke around the outer one. */}
        <div className="relative -mt-2.5 p-[3px] md:p-1 bg-gradient-to-b from-pink-300 to-rose-300 shadow-xl" style={{ clipPath: BUCKET_CLIP }}>
          <div className="relative bg-gradient-to-b from-rose-50 via-white to-pink-100 overflow-hidden" style={{ clipPath: BUCKET_CLIP }}>

            {/* Sheen: a soft vertical highlight, like light catching a curved pail wall */}
            <div className="pointer-events-none absolute inset-y-0 left-[14%] w-[10%] bg-gradient-to-b from-white/70 via-white/20 to-transparent" />

            {/* Rising fill level, tracks how full the bucket is */}
            <motion.div
              className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#ff3f6c]/25 via-[#ff905a]/10 to-transparent"
              animate={{ height: `${fillPct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 22 }}
            />

            <div className="relative z-10 px-4 md:px-5 pt-5 pb-4">
              {/* Riveted nameplate */}
              <div className="mx-auto flex w-fit items-center gap-1.5 rounded-md bg-[#282c3f] px-3 py-1 shadow-sm">
                <span className="h-1 w-1 rounded-full bg-white/40" />
                <span className="text-[9px] font-black uppercase tracking-widest text-white">{category} Bucket</span>
                <span className="h-1 w-1 rounded-full bg-white/40" />
              </div>

              <div className="mt-2 text-center">
                <div className="inline-block text-lg md:text-xl font-extrabold uppercase tracking-[0.14em] text-[#ff3f6c]">
                  My Bucket
                </div>
                <p className="text-[9px] font-extrabold text-[#7e818c] uppercase tracking-widest">
                  Attributes ({bucket.length})
                </p>
              </div>

              <div className="mt-3 min-h-32 md:min-h-40 flex flex-wrap content-start justify-center gap-2">
                <AnimatePresence>
                  {bucket.length === 0 && (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full py-6 md:py-8 text-center">
                      <Sparkles className="mx-auto h-6 w-6 text-[#ff3f6c] animate-pulse" />
                      <p className="mt-1.5 text-xs font-bold text-[#282c3f]">Bucket is empty!</p>
                      <p className="mt-0.5 text-[10px] text-[#7e818c]">Click attributes on saved items above.</p>
                    </motion.div>
                  )}
                  {bucket.map((b) => {
                    const seed = b.key + b.value;
                    const rotation = tagRotation(seed);
                    const dotColor = b.key === "color" && CSS_COLOR_KEYWORDS.has(b.value.toLowerCase())
                      ? b.value.toLowerCase()
                      : "#ff3f6c";
                    return (
                      <motion.button
                        key={seed}
                        layoutId={`attr-${b.key}-${b.value}`}
                        initial={{ opacity: 0, scale: 0.4, y: -20, rotate: 0 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotate: rotation }}
                        exit={{ opacity: 0, scale: 0.4, y: 20 }}
                        whileHover={{ rotate: 0, scale: 1.06 }}
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                        onClick={() => onRemove(b)}
                        className="group inline-flex items-center gap-1.5 rounded-md border border-white/60 bg-white px-2 py-1 text-[10px] font-bold text-[#282c3f] shadow-md"
                      >
                        <span
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span className="opacity-60 uppercase text-[8px]">{b.key}</span>
                        <span className="capitalize">{b.value}</span>
                        <X className="h-3 w-3 opacity-50 group-hover:opacity-100 group-hover:text-[#ff3f6c]" />
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function StyleloomRowItem({ 
  item, 
  onToggle, 
  onRemove,
  onOpenOutfit,
  onAddToMyLoom
}: { 
  item: any; 
  onToggle: (k: string, v: string) => void; 
  onRemove: () => void;
  onOpenOutfit: () => void;
  onAddToMyLoom: () => void;
}) {
  const selected = (item.selected_attributes as Record<string, string[]>) ?? {};
  const p = normalizeProduct(item.products);
  const itemAttrs = getItemAttributes(p);

  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-[#eaeaec] bg-white p-4 md:p-5 shadow-sm">
      <div className="flex gap-4 md:gap-5">
        <img 
          src={p.image_url} 
          alt={p.title} 
          className="h-36 w-24 md:h-40 md:w-28 flex-shrink-0 rounded-2xl object-cover shadow-sm" 
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs md:text-sm font-extrabold uppercase tracking-wider text-[#ff3f6c]">{p.brand}</div>
              <div className="text-sm md:text-base font-extrabold text-[#282c3f] leading-snug">{p.title}</div>
              <div className="mt-1 text-base md:text-lg font-black text-[#282c3f]">₹{p.price}</div>
            </div>
            <button 
              onClick={onRemove} 
              title="Remove" 
              className="rounded-full p-2 text-[#7e818c] hover:bg-rose-50 hover:text-[#ff3f6c] transition"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3">
            <div className="flex flex-wrap gap-2">
              {itemAttrs.map((attr) => {
                const active = selected[attr.key]?.includes(attr.value);
                return (
                  <motion.button
                    key={attr.key + attr.value}
                    layoutId={`attr-${attr.key}-${attr.value}`}
                    onClick={() => onToggle(attr.key, attr.value)}
                    whileTap={{ scale: 0.95 }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs md:text-sm font-bold transition-all duration-200 ${
                      active
                        ? "bg-gradient-to-r from-[#ff3f6c] to-[#ff905a] border-transparent text-white shadow-sm"
                        : "border-[#eaeaec] bg-white text-[#282c3f] hover:border-[#ff3f6c]"
                    }`}
                  >
                    {active && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                    <span className="opacity-75 capitalize">{attr.label}:</span>
                    <span className="capitalize">{attr.value}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#eaeaec] pt-3">
            <button
              onClick={onAddToMyLoom}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#282c3f] px-4 py-2 text-xs md:text-sm font-extrabold text-white hover:bg-[#ff3f6c] transition shadow-xs"
            >
              Add to My Loom
            </button>

            <button
              onClick={onOpenOutfit}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 border border-rose-200 px-4 py-2 text-xs md:text-sm font-extrabold text-[#ff3f6c] hover:bg-[#ff3f6c] hover:text-white transition shadow-xs"
            >
              <Layers className="h-4 w-4" /> Complete Outfit
            </button>
          </div>

        </div>
      </div>
    </motion.div>
  );
}
