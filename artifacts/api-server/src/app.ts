import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In production (Docker) the frontend is built to /app/public (two levels up
// from artifacts/api-server/dist/). In development Vite runs its own server.
const STATIC_DIR =
  process.env.NODE_ENV === "production"
    ? path.resolve(__dirname, "..", "..", "..", "public")
    : null;

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
app.use(
  cors({
    origin: process.env.RAILWAY_PUBLIC_DOMAIN || "http://localhost:3000",
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
