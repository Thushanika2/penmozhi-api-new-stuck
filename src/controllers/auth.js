const crypto = require("node:crypto");
const { config } = require("../config/config");
const { HealthProfile, PasswordResetToken, PCOSDisorderStatus, UserProfile } = require("../models");
const { createPrivacyRequest, recordSignupConsents } = require("../services/privacy");
const { addDays, parseDateOnly } = require("../utils/dates");
const { issueTokens, verifyToken } = require("../utils/jwt");
const { hashPassword, verifyPasswordHash } = require("../utils/password");
const { publicUser, serialize } = require("../utils/serialize");
const { LANGUAGES, TRACKING_MODES, requiredBody, requiredString, validEmail, validateLogin, validateRegister } = require("../utils/validation");
const { errorResponse, messageResponse, validationErrors } = require("../utils/response");

function schemaError(res, items) {
  return validationErrors(res, items.length ? items : [["validation.invalid_payload", "Invalid request payload."]]);
}

async function register(req, res) {
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const errors = validateRegister(req.body);
  if (errors.length) return schemaError(res, errors);
  const email = String(req.body.email).trim().toLowerCase();
  if (await UserProfile.exists({ email })) return validationErrors(res, [["validation.email_exists", "Email address already exists."]]);
  const language = String(req.body.language_preference || "english").trim().toLowerCase();
  let createdUser = null;
  try {
    const user = await UserProfile.create({ full_name: String(req.body.full_name).trim(), email, password_hash: await hashPassword(req.body.password), language_preference: language, role: "user", onboarding_completed: false });
    createdUser = user;
    const healthProfile = await HealthProfile.create({ profile_id: user.id });
    await PCOSDisorderStatus.create({ health_profile_id: healthProfile.id, disorder_type: "none", diagnosis_status: "not_diagnosed" });
    await recordSignupConsents(user.id);
    return res.status(201).json({ message: "User registered successfully.", user: publicUser(user), health_profile: serialize(healthProfile, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) });
  } catch (error) {
    if (createdUser?.id) await UserProfile.deleteOne({ id: createdUser.id });
    console.error(error);
    return errorResponse(res, "server.internal_error", "An internal server error occurred.", 500);
  }
}

async function login(req, res) {
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const errors = validateLogin(req.body);
  if (errors.length) return schemaError(res, errors);
  const user = await UserProfile.findOne({ email: String(req.body.email).trim().toLowerCase() });
  if (!user || !(await verifyPasswordHash(user.password_hash, String(req.body.password)))) return errorResponse(res, "auth.invalid_credentials", "Invalid email or password.", 401);
  if (user.status !== "active") return errorResponse(res, user.status === "suspended" ? "auth.account_suspended" : user.status === "banned" ? "auth.account_banned" : "auth.account_inactive", user.status === "suspended" ? "Your account has been suspended. Please contact support." : user.status === "banned" ? "Your account has been banned." : "Your account is not active.", 403);
  user.login_count = (user.login_count || 0) + 1;
  user.last_active_at = new Date();
  await user.save();
  const tokens = issueTokens(user);
  return res.json({ message: "Login successful.", ...tokens, user: publicUser(user) });
}

async function profile(req, res) {
  const healthProfile = await HealthProfile.findOne({ profile_id: req.user.id });
  return res.json({ user: publicUser(req.user), ...(healthProfile ? { health_profile: serialize(healthProfile, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) } : {}) });
}

async function updateProfile(req, res) {
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const allowed = ["language_preference", "full_name", "country", "timezone", "date_of_birth"];
  const keys = Object.keys(req.body).filter((key) => allowed.includes(key));
  if (!keys.length) return validationErrors(res, [["validation.no_fields", "At least one profile field is required."]]);
  if (req.body.language_preference !== undefined && !LANGUAGES.includes(String(req.body.language_preference).toLowerCase())) return validationErrors(res, [["validation.language_invalid", "language_preference must be 'tamil' or 'english'."]]);
  if (req.body.full_name !== undefined && !requiredString(req.body.full_name, 2, 255)) return validationErrors(res, [["validation.invalid_payload", "full_name must be between 2 and 255 characters."]]);
  if (req.body.date_of_birth !== undefined && !parseDateOnly(req.body.date_of_birth)) return validationErrors(res, [["validation.invalid_payload", "date_of_birth must be a valid date (YYYY-MM-DD)."]]);
  for (const key of keys) req.user[key] = key === "language_preference" ? String(req.body[key]).toLowerCase() : key === "date_of_birth" ? parseDateOnly(req.body[key]) : req.body[key] === null ? null : String(req.body[key]).trim();
  await req.user.save();
  return messageResponse(res, "auth.profile_updated", "Profile updated successfully.", 200, { user: publicUser(req.user) });
}

async function updateMode(req, res) {
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const mode = String(req.body.mode || "").trim().toLowerCase();
  if (!TRACKING_MODES.includes(mode)) return validationErrors(res, [["validation.mode_invalid", `mode must be one of: ${TRACKING_MODES.join(", ")}.`]]);
  req.user.mode = mode;
  await req.user.save();
  return messageResponse(res, "auth.mode_updated", "Tracking mode updated successfully.", 200, { user: publicUser(req.user) });
}

async function updateAppLock(req, res) {
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  if (req.body.clear) req.user.pin_hash = undefined;
  else {
    const pin = String(req.body.pin || "").trim();
    if (pin.length < 4 || pin.length > 8) return validationErrors(res, [["validation.pin_length", "pin must be between 4 and 8 characters."]]);
    req.user.pin_hash = await hashPassword(pin);
  }
  await req.user.save();
  return messageResponse(res, "auth.app_lock_updated", "App lock updated successfully.", 200, { user: publicUser(req.user) });
}

async function verifyAppLock(req, res) {
  if (!req.user.pin_hash) return res.json({ verified: true, message: "App lock is not enabled." });
  if (!requiredBody(req.body) || !req.body.pin) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  if (await verifyPasswordHash(req.user.pin_hash, String(req.body.pin).trim())) return res.json({ verified: true, message: "PIN verified successfully." });
  return errorResponse(res, "auth.invalid_pin", "Invalid PIN.", 401);
}

async function deleteAccount(req, res) {
  if (req.user.role === "admin") return errorResponse(res, "auth.admin_delete_forbidden", "Admin accounts cannot be deleted.", 403);
  if (!requiredBody(req.body) || !req.body.password) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  if (!(await verifyPasswordHash(req.user.password_hash, String(req.body.password)))) return errorResponse(res, "auth.invalid_credentials", "Invalid email or password.", 401);
  await createPrivacyRequest(req.user, "delete");
  return res.status(202).json({ message: "Your account deletion request has been submitted. An administrator will process it shortly.", message_code: "privacy.delete_request_submitted" });
}

async function refresh(req, res) {
  const token = req.body?.refresh_token;
  if (!token) return validationErrors(res, [["validation.invalid_payload", "refresh_token is required."]]);
  try {
    const claims = verifyToken(token);
    if (claims.type !== "refresh") throw new Error("wrong token type");
    const user = await UserProfile.findOne({ id: Number(claims.sub) });
    if (!user) return errorResponse(res, "auth.user_not_found", "User not found.", 404);
    if (user.status !== "active") return errorResponse(res, "auth.account_inactive", "Your account is not active.", 403);
    if (user.token_valid_after && claims.iat && claims.iat * 1000 < new Date(user.token_valid_after).getTime()) return errorResponse(res, "auth.session_expired", "Your session has expired. Please sign in again.", 401);
    return res.json({ message_code: "auth.token_refreshed", message: "Token refreshed successfully.", ...issueTokens(user), user: publicUser(user) });
  } catch (_error) {
    return errorResponse(res, "auth.invalid_refresh_token", "Invalid or expired refresh token.", 401);
  }
}

async function forgotPassword(req, res) {
  if (!requiredBody(req.body) || !validEmail(req.body.email)) return validationErrors(res, [["validation.invalid_payload", "email must be a valid email address."]]);
  const response = { message_code: "auth.reset_email_sent", message: "If an account exists for this email, a reset link has been sent." };
  const user = await UserProfile.findOne({ email: String(req.body.email).trim().toLowerCase() });
  if (!user) return res.json(response);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  await PasswordResetToken.create({ user_id: user.id, token_hash: await hashPassword(rawToken), expires_at: new Date(Date.now() + 60 * 60 * 1000) });
  if (config.debug) response.reset_token = rawToken;
  return res.json(response);
}

async function resetPassword(req, res) {
  if (!requiredBody(req.body) || !requiredString(req.body.token, 10) || !requiredString(req.body.password, 6, 128)) return validationErrors(res, [["validation.invalid_payload", "token and a password between 6 and 128 characters are required."]]);
  const tokens = await PasswordResetToken.find({ used_at: null, expires_at: { $gt: new Date() } }).sort({ created_at: -1 });
  let matched = null;
  for (const entry of tokens) if (await verifyPasswordHash(entry.token_hash, req.body.token)) { matched = entry; break; }
  if (!matched) return errorResponse(res, "auth.invalid_reset_token", "Invalid or expired reset token.", 400);
  const user = await UserProfile.findOne({ id: matched.user_id });
  if (!user) return errorResponse(res, "auth.user_not_found", "User not found.", 404);
  user.password_hash = await hashPassword(req.body.password);
  matched.used_at = new Date();
  await Promise.all([user.save(), matched.save()]);
  return messageResponse(res, "auth.password_reset_success", "Password reset successfully. You can now sign in.");
}

module.exports = { deleteAccount, forgotPassword, login, logout: (_req, res) => messageResponse(res, "auth.logout_success", "Logout successful."), profile, refresh, register, resetPassword, updateAppLock, updateMode, updateProfile, verifyAppLock };
