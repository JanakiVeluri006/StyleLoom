import { createMiddleware } from '@tanstack/react-start';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const requireSupabaseAuth = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const SUPABASE_URL = process.env.SUPABASE_URL || "https://dummy.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "dummy_key";

    const supabase = createClient<Database>(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          storage: undefined,
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    // Return guest user context so auth barriers are completely removed
    return next({
      context: {
        supabase,
        userId: "guest-user-1",
        claims: { sub: "guest-user-1", email: "guest@styleloom.com" },
      },
    });
  },
);
