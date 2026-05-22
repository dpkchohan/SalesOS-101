import express, { type Express } from "express";
import path from "path";
import { existsSync } from "fs";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        const allowed =
          host === "localhost" ||
          host === "127.0.0.1" ||
          host.endsWith(".replit.dev") ||
          host.endsWith(".replit.app") ||
          host.endsWith(".repl.co") ||
          host.endsWith(".vercel.app") ||
          host === "salesos.pddt.in" ||
          host.endsWith(".salesos.pddt.in") ||
          host === "testpddt.fun" ||
          host.endsWith(".testpddt.fun");
        return cb(null, allowed);
      } catch {
        return cb(null, false);
      }
    },
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Register the health check BEFORE Clerk middleware so it is always publicly
// reachable. Clerk's middleware initiates a FAPI handshake even for
// unauthenticated requests, which would redirect /healthz to a non-existent
// Clerk subdomain and break deployment health checks.
app.use("/api", healthRouter);

// Use the publishable key directly from the environment variable.
// Do NOT use publishableKeyFromHost() here — on Coolify the request host is
// api.salesos.pddt.in, so that utility would derive clerk.api.salesos.pddt.in
// as the FAPI instead of the correct clerk.salesos.pddt.in (encoded in the key).
app.use(
  clerkMiddleware({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  }),
);

app.use("/api", router);

// Any unmatched /api/* request must return JSON 404, never the SPA shell.
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// In production the web SPA is served by this same process so that
// Autoscale only needs a single exposed port (8080).
// The web build is produced as part of the API server's production build step.
if (process.env.NODE_ENV === "production") {
  // Use import.meta.url so the path is anchored to this file's location in
  // the bundle (artifacts/api-server/dist/index.mjs) rather than relying on
  // process.cwd(), which may differ across deployment environments.
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  const webRoot = path.resolve(__dirname, "../../salesos-web/dist/public");
  const webRootExists = existsSync(webRoot);
  logger.info({ webRoot, exists: webRootExists }, "SPA static root");
  app.use(express.static(webRoot));
  // SPA fallback — only register when the web build is present (i.e. not on
  // API-only deployments such as Railway when the frontend is on Vercel).
  if (webRootExists) {
    // Express 5 / path-to-regexp v8 rejects the bare "*" path string, so use
    // a middleware (no path) that only handles GET requests for non-API routes.
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(webRoot, "index.html"));
    });
  }
}

export default app;
