import { useGetMe } from "@workspace/api-client-react";
import { useClerk, useUser } from "@clerk/react";
import { LogOut, Building2, Mail, User, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/AppLayout";
import { initials } from "@/lib/format";

export default function Settings() {
  const { data, isLoading } = useGetMe();
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Account & workspace" />
      <div className="px-4 md:px-8 max-w-xl space-y-4">
        <div className="rounded-2xl bg-card border border-card-border p-5">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground grid place-items-center font-bold text-[20px]">
              {initials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress)}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-[16px] truncate">{user?.fullName ?? "—"}</div>
              <div className="text-[12px] text-muted-foreground truncate">
                {user?.primaryEmailAddress?.emailAddress ?? ""}
              </div>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-[13px]">
            <Row icon={<User size={13} />} label="Display name" value={data?.name ?? "—"} />
            <Row icon={<Mail size={13} />} label="Email" value={data?.email ?? "—"} />
            <Row icon={<Building2 size={13} />} label="Workspace" value={data?.orgName ?? "—"} />
            <Row icon={<ShieldCheck size={13} />} label="Role" value={data?.role ?? "—"} />
          </div>
        </div>
        <button
          onClick={() => signOut()}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-card border border-card-border text-rose-600 dark:text-rose-400 font-semibold text-[14px] hover:bg-rose-500/5 transition-colors"
          data-testid="button-signout"
        >
          <LogOut size={15} /> Sign out
        </button>
        {isLoading && <div className="text-[12px] text-muted-foreground">Loading account…</div>}
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground w-24 text-[12px]">{label}</span>
      <span className="font-medium truncate">{value}</span>
    </div>
  );
}
