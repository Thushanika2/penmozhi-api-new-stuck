const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { config, validateServerConfig } = require("./config/config");
const { connectDatabase, isDatabaseConnected } = require("./config/db");
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
    if (isDatabaseConnected()) return res.json({ status: "ok", database: "connected" });
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

const app = createApp();

async function startServer() {
  try {
    validateServerConfig();
    await connectDatabase(config.mongodbUri);

    const server = app.listen(config.port);
    server.on("listening", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : config.port;
      console.log(`Penmozhi API server is running on port ${port}.`);
    });
    server.on("error", (error) => {
      console.error("Penmozhi API server error:", error);
    });
    return server;
  } catch (error) {
    console.error("Failed to start Penmozhi API:", error);
    throw error;
  }
}

// Start the API when this file is executed directly. When it is imported by a
// hosting platform or tests, the Express app is exported without opening a
// second listener.
if (require.main === module && !process.env.VERCEL) {
  startServer().catch(() => {
    process.exitCode = 1;
  });
}

// Vercel can use the exported Express app and connect during cold start.
if (process.env.VERCEL) {
  connectDatabase(config.mongodbUri).catch((error) => {
    console.error("Database connection error:", error);
  });
}

// CommonJS export keeps this project compatible with its existing route and
// test files while also exposing the app directly to hosting platforms.
module.exports = app;
module.exports.app = app;
module.exports.createApp = createApp;
module.exports.startServer = startServer;
