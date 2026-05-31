import { useEffect, useState } from "react";
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
  MessageSquare,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  MoreHorizontal,
} from "lucide-react";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FeedbackModal } from "./FeedbackModal";

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

const PRIMARY_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/contacts", label: "Contacts", icon: Users },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/pipeline", label: "Pipeline", icon: Kanban },
];

const MORE_NAV = [
  { to: "/leads", label: "Leads", icon: TrendingUp },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/documents", label: "Docs", icon: FileText },
  { to: "/import", label: "Import", icon: Upload },
];

const ADMIN_EMAILS = ["deepak@pddt.in", "dpkchohan@gmail.com"];

function NavButtons() {
  return (
    <div className="flex items-center">
      <button
        type="button"
        onClick={() => window.history.back()}
        disabled={window.history.length <= 1}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        title="Go back"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => window.history.forward()}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Go forward"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Refresh"
      >
        <RotateCw size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [loc] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const isAdmin = ADMIN_EMAILS.includes(
    (user?.primaryEmailAddress?.emailAddress ?? "").toLowerCase(),
  );
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    setShowMore(false);
  }, [loc]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) e.preventDefault();
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  const isActive = (to: string) =>
    to === "/" ? loc === "/" : loc === to || loc.startsWith(to + "/");

  const moreIsActive = MORE_NAV.some(({ to }) => isActive(to));

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
        {isAdmin && (
          <div className="px-2 pb-1">
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 font-semibold px-3 py-1.5">Admin</div>
            {[
              { to: "/admin/feedback", label: "Feedback" },
              { to: "/admin/errors", label: "Errors" },
            ].map(({ to, label }) => (
              <Link key={to} to={to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                  loc === to
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <ShieldCheck size={16} strokeWidth={2.2} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="p-3 border-t border-sidebar-border">
          <button
            onClick={() => setShowFeedback(true)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 transition-colors border border-sidebar-border mb-2"
            data-testid="button-report-issue"
          >
            <MessageSquare size={14} /> Report Issue
          </button>
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
        {/* Desktop-only nav strip */}
        <div className="hidden md:flex items-center px-3 py-1 border-b border-border bg-background sticky top-0 z-30">
          <NavButtons />
        </div>

        {/* Mobile header — 8% horizontal padding so content doesn't touch edges */}
        <header className="md:hidden flex items-center justify-between px-[8%] py-3 border-b border-border bg-background sticky top-0 z-30">
          <div className="flex items-center gap-1">
            <NavButtons />
            <div className="w-px h-4 bg-border mx-1" />
            <Link to="/" className="flex items-center gap-2">
              <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="w-7 h-7 rounded-md" />
              <span className="font-bold tracking-tight">SalesOS</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              data-testid="button-report-issue-mobile"
            >
              <MessageSquare size={13} /> Report
            </button>
            <Link to="/settings" className="w-8 h-8 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-xs">
              {initials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress)}
            </Link>
          </div>
        </header>

        <main className="flex-1 pb-24 md:pb-8">{children}</main>

        {/* Mobile bottom nav — 4 primary items + More */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
          <div className="grid grid-cols-5">
            {PRIMARY_NAV.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
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
            <button
              onClick={() => setShowMore(true)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors",
                moreIsActive
                  ? "text-primary"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
              )}
              data-testid="mobilenav-more"
            >
              <MoreHorizontal size={20} strokeWidth={2.2} />
              <span>More</span>
            </button>
          </div>
        </nav>

        {/* More drawer */}
        {showMore && (
          <>
            <div
              className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
              onClick={() => setShowMore(false)}
            />
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar rounded-t-2xl border-t border-sidebar-border shadow-xl">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-sidebar-foreground/20" />
              </div>
              <div className="pb-6 px-3 pt-1">
                {MORE_NAV.map(({ to, label, icon: Icon }) => (
                  <Link
                    key={to}
                    to={to}
                    onClick={() => setShowMore(false)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-4 rounded-xl text-[15px] font-medium transition-colors",
                      isActive(to)
                        ? "text-primary bg-primary/10"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                    )}
                    data-testid={`mobilenav-more-${label.toLowerCase()}`}
                  >
                    <Icon size={22} strokeWidth={2.2} />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
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
