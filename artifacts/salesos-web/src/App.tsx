import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import {
  Switch,
  Route,
  Redirect,
  useLocation,
  Router as WouterRouter,
} from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { AppLayout } from "./components/AppLayout";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Pipeline from "./pages/Pipeline";
import LeadDetail from "./pages/LeadDetail";
import Contacts from "./pages/Contacts";
import ContactDetail from "./pages/ContactDetail";
import Tasks from "./pages/Tasks";
import TasksKanban from "./pages/TasksKanban";
import TasksCalendar from "./pages/TasksCalendar";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import DocumentDetail from "./pages/DocumentDetail";
import Import from "./pages/Import";
import ImportAI from "./pages/ImportAI";
import Settings from "./pages/Settings";
import NotFound from "./pages/not-found";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const clerkAppearance = {
  baseTheme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "hsl(24, 95%, 53%)",
    colorForeground: "hsl(0, 0%, 98%)",
    colorMutedForeground: "hsl(244, 10%, 70%)",
    colorBackground: "hsl(244, 47%, 14%)",
    colorInput: "hsl(244, 47%, 18%)",
    colorInputForeground: "hsl(0, 0%, 98%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorNeutral: "hsl(244, 47%, 30%)",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.6rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[hsl(244,47%,14%)] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-2xl border border-[hsl(244,47%,22%)]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none px-2",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white font-bold tracking-tight text-[22px]",
    headerSubtitle: "text-white/60 text-[13px]",
    socialButtonsBlockButton:
      "bg-white/5 hover:bg-white/10 border border-white/10 text-white",
    socialButtonsBlockButtonText: "text-white font-medium",
    formFieldLabel: "text-white/85 text-[12px] font-semibold uppercase tracking-wider",
    formFieldInput: "bg-[hsl(244,47%,18%)] border-[hsl(244,47%,28%)] text-white",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-tight",
    footerActionLink: "text-primary font-semibold hover:underline",
    footerActionText: "text-white/60",
    footerAction: "bg-transparent",
    dividerText: "text-white/50 text-[11px] uppercase tracking-wider",
    dividerLine: "bg-white/10",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-white",
    alert: "bg-rose-500/10 border-rose-500/30",
    otpCodeFieldInput: "bg-[hsl(244,47%,18%)] border-[hsl(244,47%,28%)] text-white",
    formFieldRow: "gap-1.5",
    main: "gap-4",
    logoBox: "justify-center mb-2",
    logoImage: "w-12 h-12 rounded-xl",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-secondary px-4 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="relative">
        <SignIn
          routing="path"
          path={`${basePath}/sign-in`}
          signUpUrl={`${basePath}/sign-up`}
          fallbackRedirectUrl={`${basePath}/`}
        />
      </div>
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-secondary px-4 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      <div className="relative">
        <SignUp
          routing="path"
          path={`${basePath}/sign-up`}
          signInUrl={`${basePath}/sign-in`}
          fallbackRedirectUrl={`${basePath}/`}
        />
      </div>
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function SignedInApp() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/pipeline" component={Pipeline} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/contacts/:id" component={ContactDetail} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/tasks-kanban" component={TasksKanban} />
        <Route path="/tasks-calendar" component={TasksCalendar} />
        <Route path="/chat" component={Chat} />
        <Route path="/documents" component={Documents} />
        <Route path="/documents/:id" component={DocumentDetail} />
        <Route path="/import" component={Import} />
        <Route path="/import-ai" component={ImportAI} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function ProtectedRoutes() {
  return (
    <>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      signInFallbackRedirectUrl={`${basePath}/`}
      signUpFallbackRedirectUrl={`${basePath}/`}
      localization={{
        signIn: {
          start: { title: "Welcome back", subtitle: "Sign in to your SalesOS" },
        },
        signUp: {
          start: { title: "Create your SalesOS", subtitle: "Close more, scroll less." },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/" component={HomeRoute} />
          <Route path="/pipeline" component={ProtectedRoutes} />
          <Route path="/leads/:id" component={ProtectedRoutes} />
          <Route path="/contacts" component={ProtectedRoutes} />
          <Route path="/contacts/:id" component={ProtectedRoutes} />
          <Route path="/tasks" component={ProtectedRoutes} />
          <Route path="/tasks-kanban" component={ProtectedRoutes} />
          <Route path="/tasks-calendar" component={ProtectedRoutes} />
          <Route path="/chat" component={ProtectedRoutes} />
          <Route path="/documents" component={ProtectedRoutes} />
          <Route path="/documents/:id" component={ProtectedRoutes} />
          <Route path="/import" component={ProtectedRoutes} />
          <Route path="/import-ai" component={ProtectedRoutes} />
          <Route path="/settings" component={ProtectedRoutes} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
