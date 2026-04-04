import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATIC_DIR =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "..", "..", "..", "public")
    : null;

// Allowed origins: Railway domain + localhost for dev
const ALLOWED_ORIGINS = [
  process.env.CORS_ORIGIN,                          // set this in Railway env vars
  "https://shinda247-production.up.railway.app",
  "http://localhost:5000",
  "http://localhost:3000",
].filter(Boolean) as string[];

const app: Express = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // Vite inlines bootstrap script
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", "data:", "blob:"],
      connectSrc:  ["'self'", "wss:", "ws:"],       // Socket.io WebSocket
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameSrc:    ["'none'"],                      // blocks clickjacking via iframes
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,                 // required for Socket.io
}));

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
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow server-to-server requests (no origin) and whitelisted origins
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the compiled React frontend in production.
// Must come AFTER /api so API routes are never shadowed.
if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR));
  // SPA fallback — any non-API path returns index.html
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(STATIC_DIR, "index.html"));
  });
}

export default app;
