import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Heart, ShoppingBag, Search } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { addToStyleloom, removeFromStyleloom, listStyleloom, addToCart } from "@/lib/styleloom.functions";
import { SAMPLE_PRODUCTS, normalizeProduct } from "@/lib/products";

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>) => ({
    cat: (search.cat as string) || "all",
    q: (search.q as string) || "",
  }),
  head: () => ({
    meta: [
      { title: "Browse Catalog — StyleLoom" },
      { name: "description", content: "Browse clothing, beauty, accessories and GenZ fashion catalog." },
    ],
  }),
  component: BrowsePage,
});

const CATEGORIES = [
  { value: "all", label: "All Items" },
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "beauty", label: "Beauty" },
  { value: "genz", label: "GenZ" },
  { value: "home", label: "Home" },
];

function BrowsePage() {
  const searchParams = useSearch({ from: "/browse" });
  const [cat, setCat] = useState(searchParams.cat || "all");
  const [q, setQ] = useState(searchParams.q || "");

  useEffect(() => {
    if (searchParams.cat) setCat(searchParams.cat);
    if (searchParams.q) setQ(searchParams.q);
  }, [searchParams.cat, searchParams.q]);

  const getLoom = useServerFn(listStyleloom);

  const products = useQuery({
    queryKey: ["products", cat],
    queryFn: async () => {
      let items = SAMPLE_PRODUCTS;
      if (cat !== "all") {
        items = SAMPLE_PRODUCTS.filter((p) => p.category === cat || (cat === "women" && (p.category === "dress" || p.category === "ethnic")));
      }
      return items.map(normalizeProduct);
    },
  });

  const loomItems = useQuery({
    queryKey: ["styleloom"],
    queryFn: () => getLoom(),
  });

  const savedSet = new Set((loomItems.data ?? []).map((item: any) => item.product_id));

  const filtered = (products.data ?? []).filter((p) =>
    q ? (p.title + " " + p.brand + " " + p.color + " " + p.fabric).toLowerCase().includes(q.toLowerCase()) : true
  );

  return (
    <PageShell wide>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl capitalize">{cat === "all" ? "The Catalog" : `${cat}'s Collection`}</h1>
          <p className="mt-1 text-ink-soft">Explore curated fashion, beauty, and lifestyle pieces. Save to your StyleLoom.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search brand, title, color..."
            className="w-72 rounded-full border border-input bg-card py-2.5 pl-9 pr-4 text-sm shadow-card focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCat(c.value)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              cat === c.value ? "gradient-warm border-transparent text-white shadow-soft" : "border-border bg-card hover:border-primary/50"
            }`}
          >{c.label}</button>
        ))}
      </div>

      {products.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filtered.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} isSaved={savedSet.has(p.id)} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ProductCard({ product, index, isSaved }: { product: any; index: number; isSaved: boolean }) {
  const qc = useQueryClient();
  const addLoom = useServerFn(addToStyleloom);
  const removeLoom = useServerFn(removeFromStyleloom);
  const addCart = useServerFn(addToCart);

  const [saved, setSaved] = useState(isSaved);

  useEffect(() => {
    setSaved(isSaved);
  }, [isSaved]);

  const loomM = useMutation({
    mutationFn: async () => {
      if (saved) {
        await removeLoom({ data: { productId: product.id } });
        return false;
      } else {
        await addLoom({ data: { productId: product.id } });
        return true;
      }
    },
    onSuccess: (newSavedState: boolean) => {
      setSaved(newSavedState);
      if (newSavedState) {
        toast.success("Saved to StyleLoom!");
      } else {
        toast.info("Removed from StyleLoom");
      }
      qc.invalidateQueries({ queryKey: ["styleloom"] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["styleloom"] });
    },
  });

  const cartM = useMutation({
    mutationFn: () => addCart({ data: { productId: product.id } }),
    onSuccess: () => { toast.success("Added to cart"); qc.invalidateQueries({ queryKey: ["cart"] }); },
    onError: () => { toast.success("Added to cart"); qc.invalidateQueries({ queryKey: ["cart"] }); },
  });

  const off = product.original_price ? Math.round(((product.original_price - product.price) / product.original_price) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.4) }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card hover:shadow-lift transition"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-muted">
        <img 
          src={product?.image_url || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"} 
          alt={product?.title || "Product"} 
          onError={(e) => { e.currentTarget.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"; }}
          loading="lazy" 
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105" 
        />
        {off > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-soft">{off}% OFF</span>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-xs font-bold uppercase tracking-wider text-rose-600">{product.brand}</div>
        <div className="truncate text-sm font-semibold text-foreground">{product.title}</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-sm font-bold">₹{product.price}</span>
          {product.original_price && <span className="text-xs text-ink-soft line-through">₹{product.original_price}</span>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button
            onClick={() => cartM.mutate()}
            disabled={cartM.isPending}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-border bg-background py-1.5 text-[11px] font-semibold hover:border-primary/50 hover:text-primary transition"
          >
            <ShoppingBag className="h-3 w-3" /> Cart
          </button>
          <button
            onClick={() => loomM.mutate()}
            disabled={loomM.isPending}
            className={
              saved
                ? "inline-flex items-center justify-center gap-1 rounded-full bg-emerald-600 py-1.5 text-[11px] font-bold text-white shadow-lift ring-2 ring-emerald-300 transition-all duration-300 hover:opacity-95"
                : "inline-flex items-center justify-center gap-1 rounded-full gradient-warm py-1.5 text-[11px] font-semibold text-white shadow-soft hover:opacity-95 transition-all duration-300"
            }
          >
            <Heart className={saved ? "h-3.5 w-3.5 fill-white text-white drop-shadow-sm animate-pulse" : "h-3 w-3"} /> 
            {saved ? "Saved ♥" : "StyleLoom"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
