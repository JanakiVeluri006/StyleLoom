import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { getPairings } from "@/lib/recommendations.functions";
import { addToCart, listStyleloom } from "@/lib/styleloom.functions";
import { normalizeProduct } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/pair-my-outfit")({
  validateSearch: (search: Record<string, unknown>) => ({
    productId: (search.productId as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Complete the Outfit — StyleLoom" },
      { name: "description", content: "Complete your look with matching footwear, bags, and jewelry." },
    ],
  }),
  component: PairPage,
});

function PairPage() {
  const searchParams = useSearch({ from: "/_authenticated/pair-my-outfit" });
  const list = useServerFn(listStyleloom);
  const pair = useServerFn(getPairings);
  const add = useServerFn(addToCart);

  const loom = useQuery({ queryKey: ["styleloom"], queryFn: () => list() });
  const [pid, setPid] = useState<string | undefined>(searchParams.productId);

  useEffect(() => {
    if (searchParams.productId) setPid(searchParams.productId);
    else if (!pid && loom.data && loom.data.length > 0) {
      setPid(loom.data[0].product_id);
    }
  }, [searchParams.productId, loom.data]);

  const pairings = useQuery({
    queryKey: ["pair", pid],
    queryFn: () => pair({ data: { productId: pid } }),
    enabled: true,
  });

  const addM = useMutation({ mutationFn: (id: string) => add({ data: { productId: id } }), onSuccess: () => toast.success("Added to cart") });

  const baseProduct = pairings.data?.base ? normalizeProduct(pairings.data.base) : null;

  return (
    <PageShell wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-600 uppercase tracking-wider">A-Z Outfit Completer</span>
          <h1 className="mt-2 font-serif text-4xl md:text-5xl">Complete the Outfit</h1>
          <p className="mt-1 text-ink-soft">Get matching footwear, bags, and jewelry customized for your selected dress.</p>
        </div>
      </div>

      {/* Selected Base Dress Display */}
      {baseProduct && (
        <div className="mb-8 rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm">
          <div className="text-xs font-bold uppercase tracking-wider text-rose-600 mb-2">Completing Outfit For Selected Dress:</div>
          <div className="flex items-center gap-3">
            <img src={baseProduct.image_url} alt="" className="h-16 w-14 rounded-xl object-cover shadow-soft" />
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
        <div className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">Select dress from your StyleLoom:</div>
        <div className="flex flex-wrap gap-3">
          {(loom.data ?? []).map((it: any) => {
            const p = normalizeProduct(it.products);
            return (
              <button key={it.id} onClick={() => setPid(it.product_id)}
                className={`flex items-center gap-2 rounded-2xl border p-2 pr-4 transition ${pid === it.product_id ? "border-rose-500 bg-rose-50/80 shadow-soft ring-2 ring-rose-200" : "border-border bg-card hover:border-rose-300"}`}
              >
                <img src={p.image_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                <div className="text-left">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-600">{p.brand}</div>
                  <div className="max-w-[140px] truncate text-xs font-bold text-foreground">{p.title}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {pairings.data?.groups && (
        <div className="space-y-10">
          {pairings.data.groups.map((g: any) => (
            <section key={g.category}>
              <h2 className="font-serif text-2xl font-bold">{g.label}</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-4">
                {g.items.map((p: any, i: number) => {
                  const normP = normalizeProduct(p);
                  return (
                    <motion.div key={normP.id || i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{delay:i*0.03}}
                      className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card hover:shadow-lift transition">
                      <img src={normP.image_url} alt={normP.title} className="aspect-square w-full object-cover" />
                      <div className="p-3">
                        <div className="truncate text-xs font-bold uppercase tracking-wider text-rose-600">{normP.brand}</div>
                        <div className="truncate text-sm font-semibold text-foreground">{normP.title}</div>
                        <div className="mt-1 text-sm font-bold text-gray-900">₹{normP.price}</div>
                        <button onClick={() => addM.mutate(normP.id)} className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-full gradient-warm py-1.5 text-xs font-semibold text-white shadow-soft hover:opacity-95 transition">
                          <ShoppingBag className="h-3 w-3" /> Add to Cart
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
