import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "StyleLoom Catalog" },
      { name: "description", content: "Direct access to StyleLoom Collection." },
    ],
  }),
  component: AuthRedirect,
});

function AuthRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "/browse" });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm font-medium text-muted-foreground">Redirecting to StyleLoom catalog...</p>
    </div>
  );
}
