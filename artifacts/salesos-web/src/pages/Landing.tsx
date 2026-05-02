import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Mic, Activity } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-secondary text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-primary/20 blur-3xl" />
      </div>
      <header className="relative z-10 px-6 md:px-12 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="w-9 h-9 rounded-lg" />
          <span className="font-bold tracking-tight text-[18px]">SalesOS</span>
        </div>
        <Link to="/sign-in" className="text-[13px] font-semibold opacity-80 hover:opacity-100">Sign in</Link>
      </header>
      <div className="relative z-10 px-6 md:px-12 pt-16 md:pt-28 max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-bold text-primary bg-primary/15 px-3 py-1 rounded-full">
            <Sparkles size={11} /> AI-native sales CRM
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-[40px] md:text-[68px] font-bold leading-[1.05] tracking-tight mt-5"
        >
          Close more.<br />
          <span className="text-primary">Scroll less.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 text-[16px] md:text-[19px] leading-snug max-w-xl text-white/75"
        >
          A sales rep's command deck. Pipeline, contacts, and conversations in one
          calm, mobile-first surface — with Claude flagging risk before deals slip.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-9 flex flex-col sm:flex-row gap-3"
        >
          <Link to="/sign-up"
              className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-[15px] px-6 py-3.5 rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/30"
              data-testid="cta-signup"
            >
              Get started <ArrowRight size={16} />
            </Link>
          <Link to="/sign-in" className="inline-flex items-center justify-center gap-2 bg-white/10 backdrop-blur-sm font-semibold text-[15px] px-6 py-3.5 rounded-xl hover:bg-white/15 transition-colors">
              Sign in
            </Link>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-16 md:mt-24"
        >
          <Feature
            icon={<Activity size={18} />}
            title="Live pipeline"
            body="Drag deals through stages. See value, owner, and red flags at a glance."
          />
          <Feature
            icon={<Sparkles size={18} />}
            title="Claude red flags"
            body="Stalled deals, missing follow-ups, sentiment shifts — surfaced before they hurt."
          />
          <Feature
            icon={<Mic size={18} />}
            title="Talk to log"
            body="Hold the mic, talk like you're between calls. Tasks and notes file themselves."
          />
        </motion.div>
      </div>
      <div className="relative z-10 px-6 md:px-12 py-12 mt-12 text-[12px] text-white/50 text-center">
        © {new Date().getFullYear()} SalesOS · Built on Replit
      </div>
      {/* Hidden link to satisfy any direct base path */}
      <a href={basePath || "/"} className="hidden">home</a>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-5">
      <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary grid place-items-center mb-3">
        {icon}
      </div>
      <div className="text-[15px] font-bold tracking-tight">{title}</div>
      <div className="text-[13px] text-white/70 mt-1.5 leading-snug">{body}</div>
    </div>
  );
}
