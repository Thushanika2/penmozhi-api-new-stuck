const { UserProfile } = require("../models");
const { config } = require("../config/config");
const { verifyToken } = require("../utils/jwt");
const { errorResponse } = require("../utils/response");

async function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!token) return errorResponse(res, "auth.invalid_token", "Invalid authentication token.", 401);

  try {
    const claims = verifyToken(token);
    if (claims.type && claims.type !== "access") return errorResponse(res, "auth.invalid_token", "Invalid authentication token.", 401);
    const user = await UserProfile.findOne({ id: Number(claims.sub) });
    if (!user) return errorResponse(res, "auth.user_not_found", "User not found.", 404);
    if (user.status !== "active") {
      const code = user.status === "suspended" ? "auth.account_suspended" : user.status === "banned" ? "auth.account_banned" : "auth.account_inactive";
      const message = user.status === "suspended" ? "Your account has been suspended. Please contact support." : user.status === "banned" ? "Your account has been banned." : "Your account is not active.";
      return errorResponse(res, code, message, 403);
    }
    if (user.token_valid_after && claims.iat && claims.iat * 1000 < new Date(user.token_valid_after).getTime()) {
      return errorResponse(res, "auth.session_expired", "Your session has expired. Please sign in again.", 401);
    }
    req.user = user;
    req.auth = claims;
    return next();
  } catch (_error) {
    return errorResponse(res, "auth.invalid_token", "Invalid authentication token.", 401);
  }
}

function requireRoles(...roles) {
  return async (req, res, next) => {
    const response = await authenticate(req, res, () => undefined);
    if (response) return response;
    if (!roles.includes(req.user.role)) return errorResponse(res, "auth.forbidden", "Access forbidden: insufficient permissions.", 403);
    if (req.user.role === "user" && roles.includes("user") && !req.user.onboarding_completed) {
      return errorResponse(res, "onboarding.incomplete", "Please complete onboarding before using the app.", 403);
    }
    return next();
  };
}

// Express middleware cannot rely on a return value from another middleware;
// this wrapper keeps the role check explicit and preserves the legacy order.
function rolesRequired(...roles) {
  return async (req, res, next) => {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
    if (!token) return errorResponse(res, "auth.invalid_token", "Invalid authentication token.", 401);
    try {
      const claims = verifyToken(token);
      if (claims.type && claims.type !== "access") throw new Error("wrong token type");
      const user = await UserProfile.findOne({ id: Number(claims.sub) });
      if (!user) return errorResponse(res, "auth.user_not_found", "User not found.", 404);
      if (user.status !== "active") return errorResponse(res, user.status === "suspended" ? "auth.account_suspended" : user.status === "banned" ? "auth.account_banned" : "auth.account_inactive", user.status === "suspended" ? "Your account has been suspended. Please contact support." : user.status === "banned" ? "Your account has been banned." : "Your account is not active.", 403);
      if (user.token_valid_after && claims.iat && claims.iat * 1000 < new Date(user.token_valid_after).getTime()) return errorResponse(res, "auth.session_expired", "Your session has expired. Please sign in again.", 401);
      req.user = user;
      req.auth = claims;
      if (!roles.includes(user.role)) return errorResponse(res, "auth.forbidden", "Access forbidden: insufficient permissions.", 403);
      if (user.role === "user" && roles.includes("user") && !user.onboarding_completed) return errorResponse(res, "onboarding.incomplete", "Please complete onboarding before using the app.", 403);
      return next();
    } catch (_error) {
      return errorResponse(res, "auth.invalid_token", "Invalid authentication token.", 401);
    }
  };
}

module.exports = { authenticate, requireRoles, rolesRequired, jwtSecretLength: config.jwtSecret.length };
