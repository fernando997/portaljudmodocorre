import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  CheckCircle2,
  ShieldAlert,
  Building2,
  LogOut,
} from "lucide-react";
import logoModo from "@/assets/logo_modo.png";

import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { signOut } from "@/lib/auth.functions";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/home", icon: LayoutDashboard },
  { title: "Vitrine de casos", url: "/contratos", icon: FileText },
  { title: "Casos finalizados", url: "/finalizados", icon: CheckCircle2 },
  { title: "Casos abandonados", url: "/abandonados", icon: ShieldAlert },
  { title: "Locadoras", url: "/locadoras", icon: Building2 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const logout = useServerFn(signOut);
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    navigate({ to: "/auth" });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-5">
        <div className={cn("flex items-center", collapsed ? "justify-center" : "flex-col gap-2")}>
          <img
            src={logoModo}
            alt="Modo Corre"
            className={cn(
              "w-auto drop-shadow-[0_4px_18px_rgba(201,168,76,0.25)]",
              collapsed ? "h-9" : "h-20",
            )}
          />
          {!collapsed && (
            <div className="text-center font-display text-[10px] font-bold uppercase tracking-[0.22em] leading-tight text-foreground">
              PORTAL JUD
              <div className="mt-1 text-primary text-[9px] tracking-[0.3em]">Modo Corre</div>
            </div>
          )}
        </div>
      </SidebarHeader>


      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => {
                const active = pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={cn(
                        "h-11 rounded-xl px-3 text-sm font-medium transition-all",
                        active
                          ? "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md shadow-primary/25 hover:from-primary hover:to-accent data-[active=true]:text-primary-foreground data-[active=true]:bg-transparent hover:text-primary-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <Link to={item.url}>
                        <item.icon className="h-[18px] w-[18px]" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-3 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleLogout}
              className="h-11 rounded-xl px-3 text-sm font-medium text-sidebar-foreground hover:bg-destructive/15 hover:text-destructive"
            >
              <LogOut className="h-[18px] w-[18px]" />
              {!collapsed && <span>Sair</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
