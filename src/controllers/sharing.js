const crypto = require("node:crypto");
const { CycleHistoryLog, SharedConnection, SharingInvite, UserProfile } = require("../models");
const { config } = require("../config/config");
const { computeCycleInsights } = require("../services/cyclePrediction");
const { recordConsent } = require("../services/privacy");
const { hashPassword, verifyPasswordHash } = require("../utils/password");
const { dateOnly } = require("../utils/dates");
const { errorResponse, messageResponse } = require("../utils/response");

const LIFETIME_MINUTES = 10;
const COOLDOWN_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const genericCodeError = "Invalid or expired invitation code.";
const normalizeEmail = (value) => { const email = String(value || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 120 ? email : null; };

async function activeBy(field, value) { return SharedConnection.findOne({ [field]: value, status: "active" }); }
async function connectionPayload(connection, currentUserId) { const [sharer, viewer] = await Promise.all([UserProfile.findOne({ id: connection.sharer_user_id }).lean(), UserProfile.findOne({ id: connection.viewer_user_id }).lean()]); return { id: connection.id, status: connection.status, connected_at: connection.connected_at?.toISOString() || null, disconnected_at: connection.disconnected_at?.toISOString() || null, role: currentUserId === connection.sharer_user_id ? "sharer" : "viewer", sharer: { name: sharer?.full_name || null, email: sharer?.email || null }, viewer: { name: viewer?.full_name || null, email: viewer?.email || null } }; }

async function send(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email) return errorResponse(res, "invitations.invalid_email", "Enter a valid email address.", 400);
  if (req.body?.consent !== true) return errorResponse(res, "cycle_sharing.consent_required", "You must agree to share only your cycle dates before generating a code.", 400);
  if (await activeBy("sharer_user_id", req.user.id)) return errorResponse(res, "cycle_sharing.already_sharing", "Disconnect your current viewer before creating a new invite.", 409);
  const previous = await SharingInvite.findOne({ invited_email: email, status: "active" }).sort({ created_at: -1 });
  if (previous) { const retry = COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(previous.created_at).getTime()) / 1000); if (retry > 0) return res.status(429).json({ error: "Please wait before requesting another invitation.", error_code: "invitations.cooldown", retry_after: retry }); }
  if (!config.brevoApiKey && !process.env.ALLOW_EMAIL_STUBS) return errorResponse(res, "invitations.delivery_failed", "Invitation could not be sent. Please try again later.", 503);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await SharingInvite.updateMany({ invited_email: email, status: "active" }, { $set: { status: "invalidated" } });
  await SharingInvite.create({ invited_email: email, code_hash: await hashPassword(code), sharer_user_id: req.user.id, expires_at: new Date(Date.now() + LIFETIME_MINUTES * 60 * 1000) });
  await recordConsent(req.user.id, "cycle_date_sharing", "email invitation");
  return res.json({ message: "Invitation sent successfully. Please check the email for your invitation code.", expires_in: LIFETIME_MINUTES * 60, resend_after: COOLDOWN_SECONDS });
}

async function verify(req, res) {
  const email = normalizeEmail(req.body?.email); const code = String(req.body?.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) return errorResponse(res, "invitations.invalid_code", genericCodeError, 400);
  const invite = await SharingInvite.findOne({ invited_email: email, status: "active" }).sort({ created_at: -1 });
  if (!invite) return errorResponse(res, "invitations.invalid_code", genericCodeError, 400);
  const invalid = new Date(invite.expires_at) <= new Date() || invite.used_at || invite.verification_attempts >= MAX_ATTEMPTS || req.user.email.toLowerCase() !== email || !(await verifyPasswordHash(invite.code_hash, code));
  if (invalid) { invite.verification_attempts += 1; if (new Date(invite.expires_at) <= new Date() || invite.verification_attempts >= MAX_ATTEMPTS) invite.status = "invalidated"; await invite.save(); return errorResponse(res, "invitations.invalid_code", genericCodeError, 400); }
  if (invite.sharer_user_id === req.user.id) return errorResponse(res, "invitations.invalid_code", genericCodeError, 400);
  if (await activeBy("sharer_user_id", invite.sharer_user_id)) return errorResponse(res, "cycle_sharing.sharer_busy", "This person is already sharing with someone.", 409);
  if (await activeBy("viewer_user_id", req.user.id)) return errorResponse(res, "cycle_sharing.viewer_busy", "Disconnect your current shared cycle before connecting.", 409);
  const connection = await SharedConnection.create({ sharer_user_id: invite.sharer_user_id, viewer_user_id: req.user.id, active_sharer_user_id: invite.sharer_user_id, active_viewer_user_id: req.user.id, status: "active" });
  invite.used_at = new Date(); invite.used_by_user_id = req.user.id; invite.status = "used"; await invite.save();
  return res.status(201).json({ connection: await connectionPayload(connection, req.user.id) });
}

async function resend(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email || email !== req.user.email.toLowerCase()) return errorResponse(res, "invitations.invalid_code", genericCodeError, 400);
  const previous = await SharingInvite.findOne({ invited_email: email, status: "active" }).sort({ created_at: -1 });
  if (!previous) return errorResponse(res, "invitations.invalid_code", genericCodeError, 400);
  const retry = COOLDOWN_SECONDS - Math.floor((Date.now() - new Date(previous.created_at).getTime()) / 1000);
  if (retry > 0) return res.status(429).json({ error: "Please wait before requesting another invitation.", error_code: "invitations.cooldown", retry_after: retry });
  if (!config.brevoApiKey && !process.env.ALLOW_EMAIL_STUBS) return errorResponse(res, "invitations.delivery_failed", "Invitation could not be sent. Please try again later.", 503);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await SharingInvite.updateMany({ invited_email: email, status: "active" }, { $set: { status: "invalidated" } });
  await SharingInvite.create({ invited_email: email, code_hash: await hashPassword(code), sharer_user_id: previous.sharer_user_id, expires_at: new Date(Date.now() + LIFETIME_MINUTES * 60 * 1000) });
  return res.json({ message: "Invitation sent successfully. Please check the email for your invitation code.", expires_in: LIFETIME_MINUTES * 60, resend_after: COOLDOWN_SECONDS });
}
async function list(req, res) { const rows = await SharedConnection.find({ $or: [{ sharer_user_id: req.user.id }, { viewer_user_id: req.user.id }] }).sort({ connected_at: -1 }); return res.json({ connections: await Promise.all(rows.map((row) => connectionPayload(row, req.user.id))) }); }
async function disconnect(req, res) { const row = await SharedConnection.findOne({ id: Number(req.params.connection_id) }); if (!row) return errorResponse(res, "cycle_sharing.not_found", "Connection not found.", 404); if (![row.sharer_user_id, row.viewer_user_id].includes(req.user.id)) return errorResponse(res, "auth.forbidden", "Access forbidden: insufficient permissions.", 403); if (row.status !== "active") return errorResponse(res, "cycle_sharing.already_disconnected", "Connection is already disconnected.", 409); row.status = "disconnected"; row.disconnected_at = new Date(); row.active_sharer_user_id = null; row.active_viewer_user_id = null; await row.save(); return messageResponse(res, "cycle_sharing.disconnected", "Connection disconnected."); }
async function view(req, res) { const row = await SharedConnection.findOne({ id: Number(req.params.connection_id), status: "active" }); if (!row) return errorResponse(res, "cycle_sharing.inactive", "This connection is not active.", 403); if (row.viewer_user_id !== req.user.id) return errorResponse(res, "auth.forbidden", "Access forbidden: insufficient permissions.", 403); const periods = await CycleHistoryLog.find({ profile_id: row.sharer_user_id }).sort({ cycle_start_date: -1 }).limit(12).lean(); const owner = await UserProfile.findOne({ id: row.sharer_user_id }); const insights = await computeCycleInsights(owner); return res.json({ connection: await connectionPayload(row, req.user.id), periods: periods.map((period) => ({ period_start_date: dateOnly(period.cycle_start_date), period_end_date: dateOnly(period.cycle_end_date) })), predictions: { fertile_window_start: insights.fertile_window_start, fertile_window_end: insights.fertile_window_end, ovulation_date: insights.ovulation_date, pms_window_start: insights.pms_window_start, pms_window_end: insights.pms_window_end } }); }
function legacyDisabled(_req, res) { return errorResponse(res, "cycle_sharing.legacy_disabled", "This sharing flow has been retired. Generate a new one-time invite code.", 410); }

module.exports = { connect: verify, createInvite: send, disconnect, legacyDisabled, list, resend, send, verify, view };
