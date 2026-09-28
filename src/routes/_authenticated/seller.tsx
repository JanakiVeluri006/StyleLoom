import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { TrendingUp, Users, Sparkles } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { sellerDemand } from "@/lib/recommendations.functions";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [
      { title: "Seller demand — StyleLoom" },
      { name: "description", content: "Aggregated demand from customer design requests." },
    ],
  }),
  component: SellerPage,
});

function SellerPage() {
  const fn = useServerFn(sellerDemand);
  const q = useQuery({ queryKey: ["seller-demand"], queryFn: () => fn() });
  const rows = q.data?.aggregated ?? [];

  return (
    <PageShell wide>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl">Seller dashboard</h1>
          <p className="mt-1 text-ink-soft">Aggregated design demand from customers. Threshold: 3+ requests suggest making one.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-card px-4 py-2 shadow-card">
          <TrendingUp className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">{q.data?.total ?? 0} total requests</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-16 text-center text-ink-soft">
          No design requests yet. Customers can create them from Selected → "Design a dress".
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((r: any, i: number) => {
            const attrs = Object.entries((r.sampleAttributes || {}) as Record<string, string[]>).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
            const hot = r.count >= 3;
            return (
              <motion.div key={r.signature} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:i*0.04}}
                className={`rounded-2xl border p-6 shadow-card ${hot ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card"}`}>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">
                    <Users className="h-3.5 w-3.5" /> {r.count} customer{r.count>1?"s":""}
                  </div>
                  {hot && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">HOT</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {attrs.slice(0, 8).map((c) => <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>)}
                </div>
                {r.samplePrompts?.length > 0 && (
                  <div className="mt-4 space-y-1 border-t border-border/60 pt-3">
                    {r.samplePrompts.map((p: string, i: number) => (
                      <p key={i} className="text-xs italic text-ink-soft">"{p}"</p>
                    ))}
                  </div>
                )}
                <button className="mt-4 inline-flex w-full items-center justify-center gap-1 rounded-full gradient-warm py-1.5 text-xs font-semibold text-white shadow-soft">
                  <Sparkles className="h-3 w-3" /> Generate AI concept
                </button>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
