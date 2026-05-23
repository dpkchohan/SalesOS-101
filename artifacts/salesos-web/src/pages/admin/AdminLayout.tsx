import { useUser } from "@clerk/react";
import { ShieldOff } from "lucide-react";

const ADMIN_EMAILS = ["deepak@pddt.in", "dpkchohan@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  return ADMIN_EMAILS.includes((email ?? "").toLowerCase());
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  if (!isAdminEmail(email)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-destructive/10 grid place-items-center">
          <ShieldOff size={28} className="text-destructive" />
        </div>
        <div>
          <div className="text-[20px] font-bold tracking-tight">Access Denied</div>
          <div className="text-[13px] text-muted-foreground mt-1">
            This area is restricted to admins only.
          </div>
          <div className="text-[12px] text-muted-foreground/60 mt-1">
            Signed in as <span className="font-mono">{email || "unknown"}</span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
