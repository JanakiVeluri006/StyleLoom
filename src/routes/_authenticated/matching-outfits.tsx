import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { Users, Heart as H, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { getMatchingOutfits } from "@/lib/recommendations.functions";
import { addToCart, listStyleloom } from "@/lib/styleloom.functions";
import { normalizeProduct } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/matching-outfits")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) || "sisters",
    baseProductId: (search.baseProductId as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Pair the Fit — StyleLoom" },
      { name: "description", content: "Twin, coordinate, and match with your favorite people." },
    ],
  }),
  component: MatchingPage,
});

const MODES = [
  { key: "sisters" as const, label: "Sisters", emoji: "👯‍♀️" },
  { key: "friends" as const, label: "Friends", emoji: "🤝" },
  { key: "family" as const, label: "Family Matching", emoji: "👨‍👩‍👧‍👦" },
];

function MatchingPage() {
  const searchParams = useSearch({ from: "/_authenticated/matching-outfits" });
  const [mode, setMode] = useState<typeof MODES[number]["key"]>((searchParams.mode as any) || "sisters");
  const [baseId, setBaseId] = useState<string | undefined>(searchParams.baseProductId);

  useEffect(() => {
    if (searchParams.mode) setMode(searchParams.mode as any);
    if (searchParams.baseProductId) setBaseId(searchParams.baseProductId);
  }, [searchParams.mode, searchParams.baseProductId]);

  const list = useServerFn(listStyleloom);
  const match = useServerFn(getMatchingOutfits);
  const add = useServerFn(addToCart);

  const loom = useQuery({ queryKey: ["styleloom"], queryFn: () => list() });

  const results = useQuery({
    queryKey: ["match", mode, baseId],
    queryFn: () => match({ data: { mode, baseProductId: baseId } }),
  });

  const addM = useMutation({
    mutationFn: (id: string) => add({ data: { productId: id } }),
    onSuccess: () => toast.success("Added to cart"),
  });

  const baseProduct = results.data?.base ? normalizeProduct(results.data.base) : null;

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 uppercase tracking-wider">Pair the Fit</span>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">Coordinated Matching Outfits</h1>
          <p className="mt-1 text-ink-soft">Find matching outfits for your partner, sisters, friends, or family based on your StyleLoom dress.</p>
        </div>
      </div>

      {/* Matching Vibe Category Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => setMode(m.key)}
            className={`rounded-full border px-5 py-2 text-sm font-extrabold transition ${mode === m.key ? "gradient-warm border-transparent text-white shadow-soft" : "border-border bg-card hover:border-primary/50 text-foreground"}`}
          >{m.emoji} {m.label}</button>
        ))}
      </div>

      {/* Selected Base Dress Display */}
      {baseProduct && (
        <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">Matching Against Base Dress:</div>
          <div className="flex items-center gap-3">
            <img src={baseProduct.image_url} alt="" className="h-14 w-12 rounded-xl object-cover shadow-soft" />
            <div>
              <div className="text-xs font-bold text-rose-600 uppercase">{baseProduct.brand}</div>
              <div className="text-sm font-bold text-gray-900">{baseProduct.title}</div>
              <div className="text-xs font-extrabold text-gray-700">₹{baseProduct.price}</div>
            </div>
          </div>
        </div>
      )}

      {/* Saved StyleLoom Dress Selection Bar */}
      <div className="mb-8">
        <div className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">Select base dress from your StyleLoom:</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setBaseId(undefined)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold ${!baseId ? "bg-rose-600 text-white border-rose-600 shadow-soft" : "border-border bg-card"}`}
          >Default Base</button>
          {(loom.data ?? []).map((it: any) => {
            const p = normalizeProduct(it.products);
            return (
              <button key={it.id} onClick={() => setBaseId(it.product_id)}
                className={`flex items-center gap-2 rounded-full border pl-1.5 pr-3 py-1 text-xs font-bold transition ${baseId === it.product_id ? "bg-rose-600 text-white border-rose-600 shadow-soft" : "border-border bg-card hover:border-rose-300"}`}
              >
                <img src={p.image_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                <span className="truncate max-w-[140px]">{p.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {results.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({length:8}).map((_,i)=><div key={i} className="h-64 animate-pulse rounded-2xl bg-muted"/>)}</div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {(results.data?.matches ?? []).map((p: any, i: number) => {
            const normP = normalizeProduct(p);
            return (
              <motion.div key={normP.id || i} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card hover:shadow-lift transition">
                <img 
                  src={normP.image_url} 
                  alt={normP.title} 
                  onError={(e) => { e.currentTarget.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"; }}
                  className="aspect-[3/4] w-full object-cover" 
                />
                <div className="p-3">
                  <div className="truncate text-xs font-bold uppercase tracking-wider text-rose-600">{normP.brand}</div>
                  <div className="truncate text-sm font-semibold text-foreground">{normP.title}</div>
                  <div className="mt-1 text-sm font-extrabold text-gray-900">₹{normP.price}</div>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    <button onClick={() => toast.success("Paired with base outfit!")} className="inline-flex items-center justify-center gap-1 rounded-full border border-border py-1.5 text-[11px] font-bold hover:border-rose-400 hover:text-rose-600 transition">
                      <H className="h-3 w-3" /> Pair Fit
                    </button>
                    <button onClick={() => addM.mutate(normP.id)} className="inline-flex items-center justify-center gap-1 rounded-full gradient-warm py-1.5 text-[11px] font-bold text-white shadow-soft hover:opacity-95 transition">
                      <ShoppingBag className="h-3 w-3" /> Cart
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
