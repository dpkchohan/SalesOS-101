import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] grid place-items-center bg-background px-6 text-center">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-[0.3em] text-primary">404</div>
        <h1 className="mt-3 text-[32px] font-bold tracking-tight">Lost the trail.</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">That page doesn't exist or you can't reach it from here.</p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-[14px] hover:bg-primary/90">
            <ArrowLeft size={14} /> Back to dashboard
          </Link>
      </div>
    </div>
  );
}
