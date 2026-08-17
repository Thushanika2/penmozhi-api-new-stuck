const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { config } = require("./config/env");
const { errorResponse } = require("./utils/response");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins === "*" ? true : config.corsOrigins.split(",").map((value) => value.trim()), credentials: true }));
  app.use(express.json({ limit: config.maxContentLength }));
  app.use(express.urlencoded({ extended: true, limit: config.maxContentLength }));
  app.use(rateLimit({ windowMs: 60 * 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));

  app.use((req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/admin")) {
      res.set({ "Cache-Control": "private, no-store, no-cache, max-age=0, must-revalidate", Pragma: "no-cache", Expires: "0", Vary: "Authorization" });
    }
    next();
  });

  app.get("/api/health", async (_req, res) => {
    // The server module adds the live MongoDB state to this handler at runtime.
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState === 1) return res.json({ status: "ok", database: "connected" });
    return res.status(503).json({ status: "error", database: "disconnected", error: "Database connection failed.", detail: "MongoDB is not connected." });
  });

  app.use((req, res, next) => {
    if (req.path === "/api/health") return next();
    // Routes are loaded lazily after the app is constructed to keep app-level
    // tests independent from a live MongoDB connection.
    return next();
  });

  try {
    // eslint-disable-next-line global-require
    app.use(require("./routes"));
  } catch (error) {
    // Route registration errors should be visible during startup, not hidden
    // behind a generic 404 response.
    app.locals.routeLoadError = error;
    throw error;
  }

  app.use((req, res) => errorResponse(res, "request.not_found", "The requested endpoint was not found.", 404));
  app.use((error, _req, res, _next) => {
    if (error?.type === "entity.too.large") return errorResponse(res, "validation.video_too_large", "The video exceeds the 200 MB upload limit.", 413);
    if (error?.name === "ValidationError") return errorResponse(res, "validation.invalid_payload", "The request payload is invalid.", 400);
    console.error(error);
    return errorResponse(res, "server.internal_error", "An internal server error occurred.", 500);
  });

  return app;
}

module.exports = { createApp };
