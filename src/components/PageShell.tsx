import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { TopNav } from "./TopNav";

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopNav />
      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className={`mx-auto px-4 sm:px-6 md:px-10 lg:px-12 py-6 flex-1 w-full ${wide ? "max-w-[1600px]" : "max-w-[1400px]"}`}
      >
        {children}
      </motion.main>
    </div>
  );
}
