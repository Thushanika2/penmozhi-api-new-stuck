const { AIHealthAssistantSession, SymptomTrackingLog } = require("../models");
const { config } = require("../config/env");
const { errorResponse, validationErrors } = require("../utils/response");
const { serialize } = require("../utils/serialize");

function parseMessages(value) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; return Array.isArray(parsed) ? parsed.filter((item) => item && ["user", "assistant"].includes(item.role) && item.content !== undefined).map((item) => ({ role: item.role, content: String(item.content), response_type: item.response_type || "answer", options: Array.isArray(item.options) ? item.options : [] })) : []; } catch (_error) { return []; } }
function preview(messages) { const first = messages.find((item) => item.role === "user"); return first ? first.content.slice(0, 39) + (first.content.length > 40 ? "…" : "") : null; }
function recommendations(message, symptoms) { const lower = String(message || "").toLowerCase(); const result = []; if (symptoms.some((item) => item.pain_severity >= 7) || /pain|cramp|severe/.test(lower)) result.push("High pain patterns detected. Review your PCOS disorder status and consider consulting a clinician if pain persists."); if (/pcos|irregular|cycle/.test(lower)) result.push("Track at least two full cycles so next-period prediction can update, and keep your PCOS status current under Dashboard → PCOS Status."); if (/sleep|insomnia|tired/.test(lower)) result.push("Log sleep metrics with your symptoms to spot trends over time."); if (/mood|anxiety|stress/.test(lower)) result.push("Mood changes can accompany hormonal shifts — keep daily mood logs and browse related educational resources."); return result.length ? result : ["Continue logging cycles and symptoms regularly. Browse educational resources for evidence-based guidance on menstrual health."]; }

async function externalReply(message, history) {
  // The HTTP calls remain optional: deployments without a provider still have
  // a deterministic, safe assistant response and can enable either provider
  // later without changing the API contract.
  if (config.aiProvider === "anthropic" && config.anthropicApiKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": config.anthropicApiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify({ model: config.anthropicModel, max_tokens: 800, messages: [...history, { role: "user", content: message }] }) });
    if (response.ok) { const payload = await response.json(); return payload.content?.map((part) => part.text).join("\n") || null; }
  }
  if ((config.aiProvider === "gemini" || config.aiProvider === "auto") && config.geminiApiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.geminiModel)}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`;
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contents: [...history.map((item) => ({ role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content }] })), { role: "user", parts: [{ text: message }] }] }) });
    if (response.ok) { const payload = await response.json(); return payload.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n") || null; }
  }
  return null;
}

function sessionPayload(session) { const messages = parseMessages(session.saved_chat_sessions); const result = serialize(session, ["created_at", "updated_at"]); result.messages = messages; result.message_count = messages.length; result.preview = preview(messages); return result; }

async function chat(req, res) {
  const message = String(req.body?.message || "").trim();
  if (!message) return validationErrors(res, [["validation.message_required", "message is required."]]);
  const chatId = req.body.chat_id ?? req.body.session_id;
  let session = req.body.new_session ? null : chatId ? await AIHealthAssistantSession.findOne({ id: Number(chatId), profile_id: req.user.id }) : await AIHealthAssistantSession.findOne({ profile_id: req.user.id }).sort({ updated_at: -1, created_at: -1 });
  const symptoms = await SymptomTrackingLog.find({ profile_id: req.user.id }).sort({ date_time: -1 }).limit(20).lean();
  const history = session ? parseMessages(session.saved_chat_sessions).slice(-10).map((item) => ({ role: item.role, content: item.content })) : [];
  let reply = await externalReply(message, history);
  if (!reply) reply = "I can help you track symptoms, cycles, sleep, and general menstrual-health questions. For urgent or severe symptoms, please contact a qualified clinician.";
  const tips = recommendations(message, symptoms);
  const messages = session ? parseMessages(session.saved_chat_sessions) : [];
  messages.push({ role: "user", content: message }, { role: "assistant", content: reply, response_type: "answer", options: [] });
  if (!session) session = new AIHealthAssistantSession({ profile_id: req.user.id, created_at: new Date() });
  session.saved_chat_sessions = JSON.stringify(messages); session.posted_messages = JSON.stringify(messages.filter((item) => item.role === "user")); session.generated_recommendations = JSON.stringify(tips); session.symptom_analysis_log = JSON.stringify({ recent_symptom_count: symptoms.length, max_pain: Math.max(0, ...symptoms.map((item) => item.pain_severity || 0)), categories: [...new Set(symptoms.map((item) => item.category))], mode: req.user.mode }); session.updated_at = new Date(); await session.save();
  const data = sessionPayload(session);
  return res.status(201).json({ message: "Chat response generated.", message_code: "ai.chat_generated", reply, response_type: "answer", options: [], recommendations: tips, chat_id: session.id, session_id: session.id, messages: data.messages, session: data });
}
async function history(req, res) { const session = req.query.session_id ? await AIHealthAssistantSession.findOne({ id: Number(req.query.session_id), profile_id: req.user.id }) : await AIHealthAssistantSession.findOne({ profile_id: req.user.id }).sort({ updated_at: -1, created_at: -1 }); if (req.query.session_id && !session) return errorResponse(res, "ai.session_not_found", "Chat session not found.", 404); return res.json({ session_id: session?.id || null, messages: session ? parseMessages(session.saved_chat_sessions) : [], session: session ? sessionPayload(session) : null }); }
async function sessions(req, res) { const rows = await AIHealthAssistantSession.find({ profile_id: req.user.id }).sort({ updated_at: -1, created_at: -1 }).limit(20); return res.json({ sessions: rows.map(sessionPayload) }); }
async function chats(req, res) { const rows = await AIHealthAssistantSession.find({ profile_id: req.user.id }).sort({ updated_at: -1, created_at: -1 }).limit(30); return res.json({ chats: rows.map((row) => { const messages = parseMessages(row.saved_chat_sessions); return { chat_id: row.id, title: preview(messages) || "Chat", last_message_at: row.updated_at?.toISOString() || row.created_at?.toISOString() || null, message_count: messages.length }; }) }); }
async function getRecommendations(req, res) { const symptoms = await SymptomTrackingLog.find({ profile_id: req.user.id }).sort({ date_time: -1 }).limit(20).lean(); return res.json({ recommendations: recommendations("", symptoms) }); }

module.exports = { chat, chats, getRecommendations, history, sessions };
