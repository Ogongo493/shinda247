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

// Allow the canonical URL supplied by Render, plus explicit local/Railway origins.
const ALLOWED_ORIGINS = [
  process.env.CORS_ORIGIN,
  process.env.RENDER_EXTERNAL_URL,
  "https://shinda247-production.up.railway.app",
  "http://localhost:5000",
  "http://localhost:3000",
].filter(Boolean) as string[];

const app: Express = express();

// Render terminates TLS and forwards requests through one trusted proxy.
// Trusting the proxy lets express-rate-limit use the real client IP safely.
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

if (STATIC_DIR) {
  app.use(express.static(STATIC_DIR, { fallthrough: true }));

  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "User-agent: *\\nDisallow: /api/\\nDisallow: /admin\\nDisallow: /history\\nDisallow: /players\\nDisallow: /notifications\\n"
    );
  });

  app.get("/favicon.ico", (_req, res) => res.redirect(308, "/favicon.svg"));

  const sendAppShell = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.accepts("html")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.sendFile(path.join(STATIC_DIR!, "index.html"), (err) => {
      if (err) next(err);
    });
  };

  // Only known browser routes receive the SPA shell. Unknown routes and files 404.
  app.get("/", sendAppShell);
  app.get(/^\\/(?:login|register|admin|history|players|notifications|faq)\\/?$/, sendAppShell);
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

export default app;
