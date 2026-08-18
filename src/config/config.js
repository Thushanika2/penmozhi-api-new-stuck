const crypto = require("node:crypto");
const dns = require("node:dns");
const path = require("node:path");
const dotenv = require("dotenv");

// Load environment variables once so configuration is available consistently
// to the server, controllers, middleware, and migration scripts.
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// Some local networks advertise an IPv6 router DNS server that refuses the
// MongoDB SRV lookup. Use public DNS during development, while leaving hosted
// environments on their platform-provided resolver by default.
const configuredDnsServers = process.env.MONGODB_DNS_SERVERS;
const defaultDnsServers = process.env.NODE_ENV === "production" ? "" : "8.8.8.8,8.8.4.4";
const dnsServers = (configuredDnsServers || defaultDnsServers)
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (dnsServers.length) dns.setServers(dnsServers);

const boolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
};

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const configuredSecret = process.env.JWT_SECRET_KEY;
const jwtSecret = configuredSecret || crypto.randomBytes(48).toString("base64url");

if (!configuredSecret) {
  // Production must provide a stable secret so sessions remain valid after
  // a restart. The generated fallback keeps local development convenient.
  console.warn("JWT_SECRET_KEY is not configured; using an ephemeral signing key.");
}

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: number(process.env.PORT, 5000),
  mongodbUri: process.env.MONGODB_URI || "",
  jwtSecret,
  accessTokenMinutes: number(process.env.JWT_ACCESS_TOKEN_EXPIRES_MINUTES, 1440),
  refreshTokenDays: number(process.env.JWT_REFRESH_TOKEN_EXPIRES_DAYS, 30),
  corsOrigins: process.env.CORS_ORIGINS || "*",
  clientAppUrl: process.env.CLIENT_APP_URL || "http://localhost:3000",
  debug: boolean(process.env.PENMOZHI_DEBUG, false),
  maxContentLength: number(process.env.MAX_CONTENT_LENGTH, 210 * 1024 * 1024),
  adminName: process.env.ADMIN_NAME || "",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
  vapidClaimsEmail: process.env.VAPID_CLAIMS_EMAIL || "mailto:admin@penmozhi.com",
  aiProvider: process.env.AI_PROVIDER || "auto",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-lite-latest",
  brevoApiKey: process.env.BREVO_API_KEY || "",
  brevoFromEmail: process.env.BREVO_FROM_EMAIL || "",
  brevoFromName: process.env.BREVO_FROM_NAME || "Penmozhi",
  enableScheduler: boolean(process.env.ENABLE_SCHEDULER, false),
};

function validateServerConfig() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI must be configured before starting the API.");
  }
  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET_KEY must be at least 32 characters.");
  }
}

module.exports = { config, validateServerConfig };
