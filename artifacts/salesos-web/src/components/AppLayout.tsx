import { Link, useLocation } from "wouter";
import { useClerk, useUser } from "@clerk/react";
import {
  LayoutDashboard,
  Kanban,
  Users,
  TrendingUp,
  CheckSquare,
  MessageCircle,
  FileText,
  Upload,
  LogOut,
  Settings,
} from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/leads", label: "Leads", icon: TrendingUp },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/documents", label: "Docs", icon: FileText },
  { to: "/import", label: "Import", icon: Upload },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const isActive = (to: string) =>
    to === "/" ? loc === "/" : loc === to || loc.startsWith(to + "/");

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex">
      <aside className="hidden md:flex flex-col w-60 bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-[100dvh]">
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="SalesOS" className="w-9 h-9 rounded-lg" />
          <div>
            <div className="font-bold tracking-tight text-[17px]">SalesOS</div>
            <div className="text-[11px] uppercase tracking-wider opacity-60">command deck</div>
          </div>
        </div>
        <nav className="px-2 py-2 flex-1 space-y-0.5">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
                  isActive(to)
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
                data-testid={`link-${label.toLowerCase()}`}
              >
                <Icon size={18} strokeWidth={2.2} />
                <span>{label}</span>
              </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <Link to="/settings" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sidebar-accent/60 transition-colors">
              <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-[13px]">
                {initials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">
                  {user?.fullName ?? "You"}
                </div>
                <div className="text-[11px] opacity-60 truncate">
                  {user?.primaryEmailAddress?.emailAddress ?? ""}
                </div>
              </div>
              <Settings size={15} className="opacity-60" />
            </Link>
          <button
            onClick={() => signOut()}
            className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 transition-colors"
            data-testid="button-signout"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-30">
          <Link to="/" className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="w-7 h-7 rounded-md" />
              <span className="font-bold tracking-tight">SalesOS</span>
            </Link>
          <Link to="/settings" className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-xs">
              {initials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress)}
            </Link>
        </header>

        <main className="flex-1 pb-24 md:pb-8">{children}</main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar text-sidebar-foreground border-t border-sidebar-border safe-bottom">
          <div className="grid grid-cols-8">
            {NAV.map(({ to, label, icon: Icon }) => (
              <Link key={to} to={to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                    isActive(to)
                      ? "text-primary"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
                  )}
                  data-testid={`mobilenav-${label.toLowerCase()}`}
                >
                  <Icon size={20} strokeWidth={2.2} />
                  <span>{label}</span>
                </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: React.ReactNode;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="px-4 md:px-8 pt-5 md:pt-8 pb-4 flex items-end justify-between gap-3 sticky md:static top-[57px] md:top-0 bg-background/95 backdrop-blur z-20">
      <div className="min-w-0">
        <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight leading-none">{title}</h1>
        {subtitle && <div className="text-[13px] text-muted-foreground mt-1.5">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}
