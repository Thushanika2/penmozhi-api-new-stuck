// Catch-all handler for all API routes under /api/*
const app = require("../../src/app");

module.exports = (req, res) => {
  return app(req, res);
};
