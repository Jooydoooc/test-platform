import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { prisma } from "./db.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));

  // Liveness — process is up.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", env: env.NODE_ENV });
  });

  // Readiness — database is reachable.
  app.get("/health/db", async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "reachable" });
    } catch {
      res.status(503).json({ status: "error", db: "unreachable" });
    }
  });

  // Feature routers mount here as the build progresses (auth, students, teacher, ...).

  return app;
}
