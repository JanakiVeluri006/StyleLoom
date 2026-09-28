import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Shirt, Heart, Wand2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "StyleLoom — Weave your look" },
      { name: "description", content: "Pick dresses, tune preferences, swipe your favorites, and let AI find your perfect outfit — a reimagined Myntra experience." },
      { property: "og:title", content: "StyleLoom — Weave your look" },
      { property: "og:description", content: "Curate, swipe and discover — your personal fashion loom." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <PageShell>
      <section className="relative overflow-hidden rounded-3xl gradient-dawn px-8 py-20 md:px-16 md:py-28 shadow-card">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-3xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-medium tracking-wide text-primary shadow-soft">
            <Sparkles className="h-3.5 w-3.5" /> A new way to shop fashion
          </span>
          <h1 className="mt-6 text-5xl leading-[1.05] font-semibold md:text-7xl">
            Weave the look <br />
            <span className="italic text-primary">that feels like you.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            StyleLoom is a personal styling ritual. Save pieces you love, tell us how they should feel,
            swipe through curated matches, and let AI hand-pick the one.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/browse" className="inline-flex items-center gap-2 rounded-full gradient-warm px-6 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95 transition">
              Start browsing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/styleloom" className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/70 px-6 py-3 text-sm font-semibold hover:bg-white transition">
              My StyleLoom
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="mt-16 grid gap-6 md:grid-cols-3">
        {[
          { icon: Shirt, title: "Save to StyleLoom", body: "Instead of adding straight to cart, collect pieces you're curious about." },
          { icon: Heart, title: "Tell us your taste", body: "Tune every attribute — color, fabric, occasion — into your Preference Bucket." },
          { icon: Wand2, title: "Discover & decide", body: "Swipe curated matches, then let AI pick the one that suits you best." },
        ].map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 * i }}
            className="rounded-2xl border border-border/60 bg-card p-6 shadow-card"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl gradient-warm text-white">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-ink-soft">{f.body}</p>
          </motion.div>
        ))}
      </section>
    </PageShell>
  );
}
