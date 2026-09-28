import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Heart, ShoppingBag, User, Sparkles } from "lucide-react";
import { useState } from "react";

export function TopNav() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) {
      navigate({ to: "/browse", search: { q: q.trim() } as any });
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-[#eaeaec] shadow-xs">
      <div className="w-full max-w-[1600px] mx-auto flex h-20 items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 md:px-10 lg:px-12">
        
        {/* Left Side: Standalone Official Myntra 'M' Logo */}
        <div className="flex items-center gap-6 lg:gap-8 shrink-0">
          <Link to="/browse" className="flex items-center flex-shrink-0">
            <img 
              src="/images/myntra_logo.png" 
              alt="Myntra Logo" 
              className="h-10 md:h-12 w-auto object-contain hover:scale-105 transition duration-200" 
            />
          </Link>

          {/* Center Main Category Links (Full Page Width Coverage, Assistant Bold Typography) */}
          <nav className="hidden items-center gap-5 xl:gap-7 text-[13px] md:text-[14px] font-extrabold tracking-[0.08em] text-[#282c3f] uppercase lg:flex">
            <Link to="/browse" search={{ cat: "men" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">MEN</Link>
            <Link to="/browse" search={{ cat: "women" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">WOMEN</Link>
            <Link to="/browse" search={{ cat: "kids" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">KIDS</Link>
            <Link to="/browse" search={{ cat: "home" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">HOME</Link>
            <Link to="/browse" search={{ cat: "beauty" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">BEAUTY</Link>
            <Link to="/browse" search={{ cat: "genz" } as any} className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c]">GENZ</Link>

            {/* Middle Highlighted StyleLoom Feature Button */}
            <Link 
              to="/styleloom" 
              className="group relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ff3f6c] via-[#ff527b] to-[#ff905a] px-4 py-1.5 text-xs font-black text-white shadow-md hover:shadow-lg hover:scale-105 transition-all duration-300 ring-2 ring-rose-200"
            >
              <Sparkles className="h-3.5 w-3.5 fill-white animate-pulse" />
              STYLELOOM
            </Link>

            <Link to="/browse" className="hover:text-[#ff3f6c] transition py-6 border-b-4 border-transparent hover:border-[#ff3f6c] flex items-center gap-1">
              STUDIO <span className="text-[9px] font-black text-[#ff3f6c] bg-rose-50 px-1 py-0.5 rounded uppercase">NEW</span>
            </Link>
          </nav>
        </div>

        {/* Center-Right Search Bar (Spans Width Smoothly like Myntra) */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md lg:max-w-lg hidden sm:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e818c]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for products, brands and more"
              className="w-full rounded-md border border-[#eaeaec] bg-[#f5f5f6] py-2.5 pl-11 pr-4 text-xs font-semibold text-[#282c3f] placeholder-[#94969f] focus:bg-white focus:border-[#ff3f6c] focus:outline-none focus:ring-1 focus:ring-[#ff3f6c] transition"
            />
          </div>
        </form>

        {/* Right Navigation Icons */}
        <div className="flex items-center gap-6 md:gap-8 flex-shrink-0">
          <div className="flex flex-col items-center text-[#282c3f] hover:text-[#ff3f6c] transition cursor-pointer">
            <User className="h-5 w-5 stroke-[2.2]" />
            <span className="text-[11px] font-extrabold mt-1">Profile</span>
          </div>

          <Link to="/styleloom" className="flex flex-col items-center text-[#282c3f] hover:text-[#ff3f6c] transition">
            <Heart className="h-5 w-5 stroke-[2.2]" />
            <span className="text-[11px] font-extrabold mt-1">Wishlist</span>
          </Link>

          <Link to="/cart" className="flex flex-col items-center text-[#282c3f] hover:text-[#ff3f6c] transition">
            <ShoppingBag className="h-5 w-5 stroke-[2.2]" />
            <span className="text-[11px] font-extrabold mt-1">Bag</span>
          </Link>
        </div>

      </div>
    </header>
  );
}
