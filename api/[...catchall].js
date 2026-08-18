// Catch-all handler for all API routes under /api/*
const app = require("../src/app");

module.exports = (req, res) => {
  try {
    return app(req, res);
  } catch (error) {
    console.error("Vercel request handler failed:", error);
    if (res.headersSent) return undefined;
    return res.status(500).json({
      error_code: "server.internal_error",
      error: "The API request could not be completed.",
    });
  }
};
