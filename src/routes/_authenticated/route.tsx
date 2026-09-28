import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Direct guest access without sign-in barriers
    return { 
      user: { 
        id: "guest-user-1", 
        email: "guest@styleloom.com",
        user_metadata: { name: "Guest User" }
      } 
    };
  },
  component: () => <Outlet />,
});

