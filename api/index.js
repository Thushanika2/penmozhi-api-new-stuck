// Vercel serverless function handler for the Express app
const app = require("../src/app");

// Vercel's serverless function handler - passes all requests to Express app
module.exports = (req, res) => {
  return app(req, res);
};
