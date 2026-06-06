import express, { type Express, type Request, type Response, type NextFunction } from "express";
import path from "path";
import { existsSync } from "fs";
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

// Manual CORS middleware — placed after the proxy so res.setHeader() always
// writes exactly one value, overwriting any Access-Control-Allow-Origin that
// http-proxy-middleware may have forwarded from the Clerk FAPI response.
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin as string | undefined;
  let allowed = false;
  if (origin) {
    try {
      const host = new URL(origin).hostname;
      allowed =
        host === "localhost" ||
        host === "127.0.0.1" ||
        host.endsWith(".replit.app") ||
        host.endsWith(".vercel.app") ||
        host === "salesos.pddt.in" ||
        host.endsWith(".salesos.pddt.in") ||
        host === "testpddt.fun" ||
        host.endsWith(".testpddt.fun");
    } catch {
      allowed = false;
    }
  }

  if (allowed && origin) {
    // setHeader replaces — never appends — so there is always exactly one value
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});
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
  if (webRootExists) {
    // Serve hashed assets with long-lived cache; never cache index.html or
    // version.json so the browser always fetches current file references.
    app.use(
      express.static(webRoot, {
        setHeaders(res, filePath) {
          if (
            filePath.endsWith("index.html") ||
            filePath.endsWith("version.json")
          ) {
            res.setHeader(
              "Cache-Control",
              "no-store, no-cache, must-revalidate",
            );
          }
        },
      }),
    );
  }
  // SPA fallback — always registered so that client-side routes like /dashboard
  // return index.html rather than falling through to a 503 from the proxy.
  // When the web build is absent (API-only deploy) index.html won't exist and
  // sendFile will 404, which is a clearer signal than a connection-level 503.
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api/")) return next();
    const indexPath = path.join(webRoot, "index.html");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.sendFile(indexPath, (err) => {
      if (err) {
        res.status(404).json({
          error: "Frontend not built",
          hint: "Run: pnpm --filter @workspace/salesos-web build",
        });
      }
    });
  });
}

export default app;
