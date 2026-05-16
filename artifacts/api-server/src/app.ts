import express, { type Express } from "express";
import path from "path";
import { existsSync } from "fs";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
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

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
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
  logger.info({ webRoot, exists: existsSync(webRoot) }, "SPA static root");
  app.use(express.static(webRoot));
  // SPA fallback. Express 5 / path-to-regexp v8 rejects the bare "*" path
  // string, so use a middleware (no path) that only handles GET requests
  // for non-API routes and returns the SPA shell.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(webRoot, "index.html"));
  });
}

export default app;
