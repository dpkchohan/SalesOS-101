import React from "react";
import { getApiUrl } from "@/lib/api";
import { FeedbackModal } from "./FeedbackModal";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showFeedback: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, showFeedback: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, info);

    if (import.meta.env.PROD) {
      try {
        fetch(getApiUrl("errors"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: error.message,
            stack: `${error.stack ?? ""}\n\nComponent stack:${info.componentStack}`,
            pageUrl: window.location.href,
            userAgent: navigator.userAgent,
          }),
          keepalive: true,
        }).catch(() => {});
      } catch {
        // best-effort — never let reporting itself crash anything
      }
    }
  }

  private handleRefresh = () => {
    window.location.reload();
  };

  private handleOpenFeedback = () => {
    this.setState({ showFeedback: true });
  };

  private handleCloseFeedback = () => {
    this.setState({ showFeedback: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <div className="text-5xl">⚠️</div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Something went wrong
            </h1>
            <p className="text-muted-foreground text-sm">
              An unexpected error occurred. You can try refreshing the page or
              report the issue so we can look into it.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mt-3 text-left text-xs bg-muted rounded-lg p-3 overflow-x-auto text-destructive whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleRefresh}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Refresh page
            </button>
            <button
              onClick={this.handleOpenFeedback}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
            >
              Report this issue
            </button>
          </div>
        </div>

        {this.state.showFeedback && (
          <FeedbackModal onClose={this.handleCloseFeedback} />
        )}
      </div>
    );
  }
}
