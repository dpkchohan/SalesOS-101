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
          host.endsWith(".repl.co");
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
  const webRoot = path.resolve(process.cwd(), "artifacts/salesos-web/dist/public");
  if (existsSync(webRoot)) {
    app.use(express.static(webRoot));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(webRoot, "index.html"));
    });
  }
}

export default app;
