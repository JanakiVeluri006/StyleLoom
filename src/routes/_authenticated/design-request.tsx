import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Palette, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { submitDesignRequest } from "@/lib/recommendations.functions";

export const Route = createFileRoute("/_authenticated/design-request")({
  head: () => ({
    meta: [
      { title: "Design a dress — StyleLoom" },
      { name: "description", content: "Save your dream spec. When enough people want the same, sellers make it real." },
    ],
  }),
  component: DesignRequest,
});

function DesignRequest() {
  const submit = useServerFn(submitDesignRequest);
  const [bucket, setBucket] = useState<Record<string, string[]>>({});
  const [text, setText] = useState("");
  const [prompt, setPrompt] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setBucket(JSON.parse(sessionStorage.getItem("sl_bucket") || "{}"));
      setText(sessionStorage.getItem("sl_text") || "");
    } catch {}
  }, []);

  const m = useMutation({
    mutationFn: () => submit({ data: { attributes: bucket, prompt: [text, prompt].filter(Boolean).join(" | ") } }),
    onSuccess: () => { setSaved(true); toast.success("Design request saved"); },
    onError: () => toast.error("Couldn't save"),
  });

  const chips = Object.entries(bucket).flatMap(([k, arr]) => arr.map((v) => `${k}: ${v}`));

  return (
    <PageShell>
      <div className="mx-auto max-w-2xl">
        <div className="grid h-11 w-11 place-items-center rounded-2xl gradient-warm text-white"><Palette className="h-5 w-5" /></div>
        <h1 className="mt-4 font-serif text-4xl md:text-5xl">Design a dress for you</h1>
        <p className="mt-2 text-ink-soft">
          We'll aggregate similar requests and hand sellers a demand report. When enough people want the same silhouette, they'll make it.
        </p>

        {saved ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-8 rounded-2xl border border-success/40 bg-success/5 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
            <h2 className="mt-3 font-serif text-2xl">Saved to the demand queue</h2>
            <p className="mt-1 text-sm text-ink-soft">You'll hear back when there's a match.</p>
            <div className="mt-6 flex justify-center gap-2">
              <Link to="/browse" className="rounded-full border border-border px-5 py-2 text-sm">Keep browsing</Link>
              <Link to="/seller" className="rounded-full gradient-warm px-5 py-2 text-sm font-semibold text-white shadow-soft">Peek seller demand</Link>
            </div>
          </motion.div>
        ) : (
          <div className="mt-8 rounded-2xl border border-border/60 bg-card p-6 shadow-card">
            <div>
              <label className="text-sm font-semibold">Your preferences so far</label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {chips.length ? chips.map((c) => (
                  <span key={c} className="rounded-full bg-muted px-3 py-1 text-xs">{c}</span>
                )) : <span className="text-xs text-ink-soft">No preferences yet — visit StyleLoom first.</span>}
              </div>
            </div>
            <div className="mt-6">
              <label className="text-sm font-semibold">Anything specific?</label>
              <textarea
                value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                placeholder="e.g. Off-shoulder tulle gown in dusty rose, ankle-length, for a beach wedding."
                className="mt-2 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => m.mutate()} disabled={m.isPending}
              className="mt-6 w-full rounded-full gradient-warm py-2.5 text-sm font-semibold text-white shadow-soft disabled:opacity-60"
            >{m.isPending ? "Saving…" : "Save my design request"}</button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
