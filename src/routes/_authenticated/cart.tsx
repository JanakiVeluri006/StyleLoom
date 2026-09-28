import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/PageShell";
import { listCart, removeCart } from "@/lib/styleloom.functions";

export const Route = createFileRoute("/_authenticated/cart")({
  head: () => ({
    meta: [
      { title: "Your bag — StyleLoom" },
      { name: "description", content: "Everything you're taking home." },
    ],
  }),
  component: CartPage,
});

function CartPage() {
  const list = useServerFn(listCart);
  const rm = useServerFn(removeCart);
  const qc = useQueryClient();
  const cart = useQuery({ queryKey: ["cart"], queryFn: () => list() });

  const rmM = useMutation({ mutationFn: (id: string) => rm({ data: { productId: id } }),
    onSuccess: () => { toast.success("Removed"); qc.invalidateQueries({ queryKey: ["cart"] }); } });

  const items = cart.data ?? [];
  const total = items.reduce((s: number, i: any) => s + i.qty * (i.products?.price ?? 0), 0);

  return (
    <PageShell>
      <h1 className="font-serif text-4xl md:text-5xl">Your bag</h1>
      <p className="mt-1 text-ink-soft">{items.length} items</p>

      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed p-16 text-center text-ink-soft">
          Empty. <Link to="/browse" className="text-primary underline">Start browsing</Link>.
        </div>
      ) : (
        <div className="mt-8 grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            {items.map((i: any) => (
              <motion.div key={i.id} initial={{opacity:0}} animate={{opacity:1}} className="flex gap-4 rounded-2xl border border-border/60 bg-card p-4 shadow-card">
                <img src={i.products.image_url} alt="" className="h-24 w-20 rounded-xl object-cover" />
                <div className="flex-1">
                  <div className="text-sm font-semibold">{i.products.brand}</div>
                  <div className="text-xs text-ink-soft">{i.products.title}</div>
                  <div className="mt-1 text-sm font-bold">₹{i.products.price} × {i.qty}</div>
                </div>
                <button onClick={() => rmM.mutate(i.product_id)} className="self-start rounded-full p-2 text-ink-soft hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </motion.div>
            ))}
          </div>
          <aside className="h-fit rounded-2xl border border-border/60 bg-card p-6 shadow-card">
            <h3 className="font-semibold">Summary</h3>
            <div className="mt-4 flex justify-between text-sm"><span>Subtotal</span><span>₹{total}</span></div>
            <div className="mt-1 flex justify-between text-sm"><span>Shipping</span><span>Free</span></div>
            <div className="mt-4 flex justify-between border-t border-border pt-4 font-bold"><span>Total</span><span>₹{total}</span></div>
            <button className="mt-6 w-full rounded-full gradient-warm py-2.5 text-sm font-semibold text-white shadow-soft">Checkout (demo)</button>
          </aside>
        </div>
      )}
    </PageShell>
  );
}
