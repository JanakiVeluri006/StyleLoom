import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { ShoppingBag, Sparkles, Palette, ArrowRight } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { addToCart, listLikedSwipes } from "@/lib/styleloom.functions";
import { normalizeProduct } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/selected")({
  head: () => ({
    meta: [
      { title: "Your picks — StyleLoom" },
      { name: "description", content: "Everything you swiped right on." },
    ],
  }),
  component: SelectedPage,
});

function SelectedPage() {
  const list = useServerFn(listLikedSwipes);
  const add = useServerFn(addToCart);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const liked = useQuery({ queryKey: ["liked"], queryFn: () => list() });

  const addM = useMutation({
    mutationFn: (productId: string) => add({ data: { productId } }),
    onSuccess: () => { toast.success("Added to cart"); qc.invalidateQueries({ queryKey: ["cart"] }); },
  });

  // Strictly deduplicate by product ID and image URL
  const items = useMemo(() => {
    const raw = liked.data ?? [];
    const seenIds = new Set<string>();
    const seenImages = new Set<string>();
    const unique: any[] = [];
    for (const r of raw) {
      const p = normalizeProduct(r.products);
      if (seenIds.has(p.id) || seenImages.has(p.image_url)) continue;
      seenIds.add(p.id);
      seenImages.add(p.image_url);
      unique.push({ ...r, products: p });
    }
    return unique;
  }, [liked.data]);

  return (
    <PageShell wide>
      <div className="mb-8">
        <h1 className="font-serif text-4xl md:text-5xl">Your picks</h1>
        <p className="mt-1 text-ink-soft">{items.length} unique swiped pieces. Add to cart, or let us narrow it down.</p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-16 text-center bg-card shadow-card">
          <p className="text-ink-soft text-base">No swiped picks yet.</p>
          <Link to="/recommendations" className="mt-4 inline-flex items-center gap-2 rounded-full gradient-warm px-6 py-2.5 text-sm font-bold text-white shadow-soft">
            Go Swipe Recommendations
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((r: any, i: number) => {
            const p = r.products;
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-card hover:shadow-lift transition"
              >
                <div className="aspect-[3/4] overflow-hidden bg-muted">
                  <img 
                    src={p?.image_url || "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"} 
                    alt={p?.title || "Fashion Product"} 
                    onError={(e) => { e.currentTarget.src = "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='533' viewBox='0 0 400 533'%3E%3Crect width='400' height='533' fill='%23F1EDE4'/%3E%3Ctext x='200' y='270' font-family='sans-serif' font-size='16' fill='%23A69B8C' text-anchor='middle'%3EImage unavailable%3C/text%3E%3C/svg%3E"; }}
                    className="h-full w-full object-cover" 
                  />
                </div>
                <div className="p-3">
                  <div className="truncate text-xs font-bold uppercase tracking-wider text-rose-600">{p.brand}</div>
                  <div className="truncate text-sm font-semibold text-foreground">{p.title}</div>
                  <div className="mt-1 text-sm font-extrabold text-gray-900">₹{p.price}</div>
                  <button
                    onClick={() => addM.mutate(p.id)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-full gradient-warm py-1.5 text-xs font-semibold text-white shadow-soft hover:opacity-95 transition"
                  >
                    <ShoppingBag className="h-3 w-3" /> Add to Cart
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="mt-12 grid gap-4 md:grid-cols-2">
        <Link to="/best-pick" className="group rounded-2xl border border-border/60 bg-card p-6 shadow-card hover:shadow-lift transition">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-warm text-white"><Sparkles className="h-5 w-5" /></div>
          <h3 className="mt-4 text-xl font-semibold">Suggest the best one for me</h3>
          <p className="mt-1 text-sm text-ink-soft">Our AI picks one final dress from your taste + swipes.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Go <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
        </Link>
        <Link to="/design-request" className="group rounded-2xl border border-border/60 bg-card p-6 shadow-card hover:shadow-lift transition">
          <div className="grid h-11 w-11 place-items-center rounded-xl gradient-warm text-white"><Palette className="h-5 w-5" /></div>
          <h3 className="mt-4 text-xl font-semibold">Design a dress for me</h3>
          <p className="mt-1 text-sm text-ink-soft">Save your spec. When demand adds up, sellers make it real.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">Submit <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></div>
        </Link>
      </div>
    </PageShell>
  );
}
