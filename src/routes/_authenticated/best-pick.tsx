import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Sparkles, ShoppingBag, Layers, Users } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { suggestBestPick } from "@/lib/recommendations.functions";
import { addToCart } from "@/lib/styleloom.functions";
import { normalizeProduct } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/best-pick")({
  head: () => ({
    meta: [
      { title: "Our pick for you — StyleLoom" },
      { name: "description", content: "The dress we think suits you best." },
    ],
  }),
  component: BestPick,
});

function BestPick() {
  const suggest = useServerFn(suggestBestPick);
  const add = useServerFn(addToCart);
  const qc = useQueryClient();
  const pick = useQuery({ queryKey: ["best-pick"], queryFn: () => suggest() });

  const addM = useMutation({
    mutationFn: (id: string) => add({ data: { productId: id } }),
    onSuccess: () => { toast.success("Added to cart"); qc.invalidateQueries({ queryKey: ["cart"] }); },
  });

  const p = pick.data?.product ? normalizeProduct(pick.data.product) : null;

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl gradient-warm text-white shadow-soft">
          <Sparkles className="h-6 w-6" />
        </div>
        <h1 className="mt-4 font-serif text-4xl md:text-5xl">This is the one</h1>
        <p className="mt-2 text-ink-soft">Chosen from your swipes, taste and preferences.</p>
      </div>

      {pick.isLoading && <div className="mt-10 h-96 animate-pulse rounded-3xl bg-muted" />}

      {p ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="mx-auto mt-10 max-w-3xl overflow-hidden rounded-3xl border border-border/60 bg-card shadow-lift"
        >
          <div className="grid md:grid-cols-2">
            <img 
              src={p.image_url} 
              alt={p.title} 
              onError={(e) => { e.currentTarget.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"; }}
              className="aspect-[3/4] w-full object-cover" 
            />
            <div className="p-8 flex flex-col justify-between">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-rose-600">{p.brand}</div>
                <h2 className="mt-1 font-serif text-2xl font-bold text-gray-900">{p.title}</h2>
                <div className="mt-2 text-2xl font-extrabold text-gray-900">₹{p.price}</div>
                <blockquote className="mt-6 rounded-2xl bg-rose-50/60 p-4 text-xs italic text-gray-700 border border-rose-100">
                  "{pick.data.explanation}"
                </blockquote>
              </div>

              <div className="mt-6 space-y-3">
                <button
                  onClick={() => addM.mutate(p.id)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full gradient-warm py-3 text-sm font-extrabold text-white shadow-soft hover:opacity-95 transition"
                >
                  <ShoppingBag className="h-4 w-4" /> Add to Cart
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <Link 
                    to="/pair-my-outfit" 
                    search={{ productId: p.id } as any}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-600 hover:text-white transition"
                  >
                    <Layers className="h-3.5 w-3.5" /> Complete Outfit
                  </Link>
                  <Link 
                    to="/matching-outfits" 
                    search={{ baseProductId: p.id } as any}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-500 hover:text-white transition"
                  >
                    <Users className="h-3.5 w-3.5" /> Pair the Fit
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : pick.data && !pick.data.product ? (
        <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-dashed p-8 text-center text-ink-soft">
          {pick.data.explanation}
        </div>
      ) : null}
    </PageShell>
  );
}
