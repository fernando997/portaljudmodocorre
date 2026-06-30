import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { Bell, Search } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { Input } from "@/components/ui/input";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { getCurrentUser } from "@/lib/auth.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const user = await getCurrentUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const initials = user.nome
    ? user.nome
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user.phone.slice(-2);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-1 flex-col bg-background">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/40 bg-background/80 px-4 backdrop-blur-md sm:px-6">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="relative hidden flex-1 max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar contrato, cliente, número…"
                className="h-10 rounded-xl border-border/50 bg-card/60 pl-10 text-sm"
              />
            </div>
            <div className="flex flex-1 items-center justify-end gap-3">
              <button className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-card/60 text-muted-foreground transition-colors hover:text-foreground">
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
              </button>
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <div className="text-sm font-medium text-foreground">
                    {user.nome ? `Dr(a). ${user.nome}` : "Dr(a). Advogado"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    +{user.phone}
                  </div>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20">
                  {initials}
                </div>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
