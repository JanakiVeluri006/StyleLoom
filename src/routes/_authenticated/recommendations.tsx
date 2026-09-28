import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { Heart, X, ArrowRight, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/PageShell";
import { getRecommendations } from "@/lib/recommendations.functions";
import { recordSwipe, resetSwipeSession } from "@/lib/styleloom.functions";

export const Route = createFileRoute("/_authenticated/recommendations")({
  head: () => ({
    meta: [
      { title: "Swipe your favorites — StyleLoom" },
      { name: "description", content: "Swipe right on the ones you love." },
    ],
  }),
  component: RecPage,
});

function RecPage() {
  const navigate = useNavigate();
  const getRec = useServerFn(getRecommendations);
  const swipe = useServerFn(recordSwipe);
  const reset = useServerFn(resetSwipeSession);

  const [bucket, setBucket] = useState<Record<string, string[]>>({});
  const [text, setText] = useState("");
  useEffect(() => {
    try {
      setBucket(JSON.parse(sessionStorage.getItem("sl_bucket") || "{}"));
      setText(sessionStorage.getItem("sl_text") || "");
    } catch {}
  }, []);

  const query = useQuery({
    queryKey: ["recs", bucket, text],
    queryFn: async () => {
      await reset({}); // fresh session
      return getRec({ data: { bucket, text: text || undefined, limit: 20 } });
    },
    enabled: true,
  });

  const [idx, setIdx] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [lastDirection, setLastDirection] = useState<"like" | "dislike">("like");

  const cards = query.data?.recommendations ?? [];

  async function handleSwipe(dir: "like" | "dislike") {
    const p = cards[idx];
    if (!p) return;
    setLastDirection(dir);
    if (dir === "like") setLikedCount((c) => c + 1);
    await swipe({ data: { productId: p.id, direction: dir, product: p } });
    setIdx((i) => i + 1);
  }

  const done = idx >= cards.length && cards.length > 0;

  return (
    <PageShell>
      <div className="text-center">
        <h1 className="font-serif text-4xl md:text-5xl">Right for like, left to pass</h1>
        <p className="mt-2 text-ink-soft">{query.isFetching ? "Weaving your matches…" : `${cards.length} pieces curated for you`}</p>
      </div>

      {!query.isFetching && cards.length === 0 && (
        <div className="mt-16 rounded-2xl border border-dashed p-16 text-center text-ink-soft">
          No matches — try loosening your preferences.
        </div>
      )}

      <div className="relative mx-auto mt-10 h-[520px] w-full max-w-sm">
        <AnimatePresence>
          {cards.slice(idx, idx + 3).reverse().map((p, i, arr) => {
            const top = i === arr.length - 1;
            return (
              <SwipeCard
                key={p.id}
                product={p}
                top={top}
                depth={arr.length - 1 - i}
                onSwipe={top ? handleSwipe : undefined}
                lastDir={lastDirection}
              />
            );
          })}
        </AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 grid place-items-center rounded-3xl border border-border bg-card p-8 text-center shadow-lift">
            <div>
              <h3 className="font-serif text-2xl">All swiped ✨</h3>
              <p className="mt-1 text-sm text-ink-soft">You loved {likedCount} pieces.</p>
              <div className="mt-6 flex flex-col gap-2">
                <button onClick={() => navigate({ to: "/selected" })} className="inline-flex items-center justify-center gap-2 rounded-full gradient-warm px-6 py-2.5 text-sm font-semibold text-white shadow-soft">
                  Continue <ArrowRight className="h-4 w-4" />
                </button>
                <button onClick={() => { setIdx(0); setLikedCount(0); query.refetch(); }} className="inline-flex items-center justify-center gap-2 rounded-full border border-border py-2.5 text-sm font-medium">
                  <RotateCcw className="h-4 w-4" /> Reshuffle
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {!done && cards.length > 0 && (
        <div className="mt-8 flex items-center justify-center gap-6">
          <button 
            onClick={() => handleSwipe("dislike")} 
            className="grid h-16 w-16 place-items-center rounded-full border border-border bg-card shadow-card hover:scale-110 hover:border-destructive hover:text-destructive transition active:scale-95"
            title="Pass (Swipe Left)"
          >
            <X className="h-7 w-7 text-ink-soft hover:text-destructive" />
          </button>
          <div className="text-xs font-semibold text-ink-soft">{Math.min(idx + 1, cards.length)} / {cards.length}</div>
          <button 
            onClick={() => handleSwipe("like")} 
            className="grid h-16 w-16 place-items-center rounded-full gradient-warm text-white shadow-lift hover:scale-110 transition active:scale-95 ring-4 ring-rose-200/50"
            title="Like (Swipe Right)"
          >
            <Heart className="h-7 w-7 fill-white" />
          </button>
        </div>
      )}
    </PageShell>
  );
}

function SwipeCard({ 
  product, 
  top, 
  depth, 
  onSwipe,
  lastDir 
}: { 
  product: any; 
  top: boolean; 
  depth: number; 
  onSwipe?: (d: "like"|"dislike") => void;
  lastDir: "like" | "dislike";
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const likeOp = useTransform(x, [30, 100], [0, 1]);
  const nopeOp = useTransform(x, [-100, -30], [1, 0]);

  const exitX = lastDir === "like" ? 500 : -500;
  const exitRotate = lastDir === "like" ? 20 : -20;

  return (
    <motion.div
      style={top ? { x, rotate } : undefined}
      drag={top ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      onDragEnd={(_, info) => {
        if (info.offset.x > 60) {
          onSwipe?.("like");
        } else if (info.offset.x < -60) {
          onSwipe?.("dislike");
        }
      }}
      initial={{ scale: 1 - depth * 0.04, y: depth * 10, opacity: 1 }}
      animate={{ scale: 1 - depth * 0.04, y: depth * 10 }}
      exit={{ x: exitX, opacity: 0, rotate: exitRotate, transition: { duration: 0.3 } }}
      className="absolute inset-0 overflow-hidden rounded-3xl bg-card shadow-lift cursor-grab active:cursor-grabbing select-none touch-none"
    >
      <img 
        src={product?.image_url || "https://images.pexels.com/photos/1055691/pexels-photo-1055691.jpeg?auto=compress&cs=tinysrgb&w=800"} 
        alt={product?.title || "Fashion Product"} 
        onError={(e) => { e.currentTarget.src = "https://images.pexels.com/photos/1055691/pexels-photo-1055691.jpeg?auto=compress&cs=tinysrgb&w=800"; }}
        className="h-full w-full object-cover pointer-events-none" 
      />
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-5 text-white pointer-events-none">
        <div className="text-sm font-semibold uppercase tracking-wider text-white/80">{product.brand}</div>
        <div className="font-serif text-xl font-bold">{product.title}</div>
        <div className="mt-1 text-lg font-extrabold text-amber-300">₹{product.price}</div>
      </div>
      {top && (
        <>
          <motion.div style={{ opacity: likeOp }} className="absolute left-6 top-6 rounded-xl border-4 border-emerald-500 bg-emerald-500/20 px-4 py-1.5 text-2xl font-black text-emerald-500 backdrop-blur-sm transform -rotate-12 pointer-events-none">
            LIKE ♥
          </motion.div>
          <motion.div style={{ opacity: nopeOp }} className="absolute right-6 top-6 rounded-xl border-4 border-rose-500 bg-rose-500/20 px-4 py-1.5 text-2xl font-black text-rose-500 backdrop-blur-sm transform rotate-12 pointer-events-none">
            PASS ✖
          </motion.div>
        </>
      )}
    </motion.div>
  );
}
