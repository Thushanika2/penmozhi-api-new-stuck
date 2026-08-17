const { DailyLog, MedicationSupplementReminder, PerimenopauseLog } = require("../models");
const { addDays, dateOnly, parseDateOnly } = require("../utils/dates");
const { errorResponse, messageResponse, validationErrors } = require("../utils/response");
const { serialize } = require("../utils/serialize");

const logFields = ["log_date", "flow_level", "pain_level", "mood", "energy", "sleep_hours", "exercise", "weight", "basal_temp", "cervical_fluid", "sexual_activity", "notes", "sleep_source"];

async function getLogs(req, res) {
  const query = { profile_id: req.user.id };
  if (req.query.from) { const value = parseDateOnly(req.query.from); if (!value) return validationErrors(res, [["validation.from", "Invalid from date."]]); query.log_date = { ...(query.log_date || {}), $gte: value }; }
  if (req.query.to) { const value = parseDateOnly(req.query.to); if (!value) return validationErrors(res, [["validation.to", "Invalid to date."]]); query.log_date = { ...(query.log_date || {}), $lte: value }; }
  const rows = await DailyLog.find(query).sort({ log_date: -1 });
  return res.json({ daily_logs: rows.map((item) => serialize(item, ["log_date", "created_at", "updated_at"])) });
}

async function getLogByDate(req, res) {
  const date = parseDateOnly(req.params.log_date);
  if (!date) return validationErrors(res, [["validation.log_date", "Invalid date."]]);
  const row = await DailyLog.findOne({ profile_id: req.user.id, log_date: date });
  return res.json({ daily_log: row ? serialize(row, ["log_date", "created_at", "updated_at"]) : null });
}

function validateLog(data, requireDate = true) {
  const errors = [];
  if (requireDate && !parseDateOnly(data.log_date)) errors.push("log_date must be a valid date (YYYY-MM-DD).");
  return errors;
}

async function upsertLog(req, res) {
  const data = req.body || {};
  const errors = validateLog(data);
  if (errors.length) return validationErrors(res, errors.map((message) => ["validation.invalid_payload", message]));
  const logDate = parseDateOnly(data.log_date);
  let row = await DailyLog.findOne({ profile_id: req.user.id, log_date: logDate });
  const created = !row;
  if (!row) row = new DailyLog({ profile_id: req.user.id, log_date: logDate });
  for (const field of logFields.filter((key) => key !== "log_date" && data[key] !== undefined)) row[field] = data[field];
  row.updated_at = new Date();
  await row.save();
  return messageResponse(res, created ? "daily_log.created" : "daily_log.updated", created ? "Daily log created successfully." : "Daily log updated successfully.", created ? 201 : 200, { daily_log: serialize(row, ["log_date", "created_at", "updated_at"]) });
}

async function updateLog(req, res) {
  const row = await DailyLog.findOne({ id: Number(req.params.log_id), profile_id: req.user.id });
  if (!row) return errorResponse(res, "daily_log.not_found", "Daily log not found.", 404);
  if (!req.body || !Object.keys(req.body).length) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  if (req.body.log_date && !parseDateOnly(req.body.log_date)) return validationErrors(res, [["validation.log_date", "Invalid date."]]);
  for (const field of logFields.filter((key) => req.body[key] !== undefined)) row[field] = field === "log_date" ? parseDateOnly(req.body[field]) : req.body[field];
  row.updated_at = new Date();
  await row.save();
  return messageResponse(res, "daily_log.updated", "Daily log updated successfully.", 200, { daily_log: serialize(row, ["log_date", "created_at", "updated_at"]) });
}

async function deleteLog(req, res) {
  const row = await DailyLog.findOne({ id: Number(req.params.log_id), profile_id: req.user.id });
  if (!row) return errorResponse(res, "daily_log.not_found", "Daily log not found.", 404);
  await row.deleteOne();
  return messageResponse(res, "daily_log.deleted", "Daily log deleted successfully.");
}

async function calendar(req, res) {
  const year = Number(req.query.year); const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) return validationErrors(res, [["validation.month", "year and month are required."]]);
  const monthStart = new Date(Date.UTC(year, month - 1, 1)); const monthEnd = new Date(Date.UTC(year, month, 0));
  const rows = await DailyLog.find({ profile_id: req.user.id, log_date: { $gte: monthStart, $lte: monthEnd } });
  const cycles = await require("../models").CycleHistoryLog.find({ profile_id: req.user.id }).lean();
  const periodDays = new Set();
  for (const cycle of cycles) for (let current = new Date(cycle.cycle_start_date); current <= cycle.cycle_end_date; current = addDays(current, 1)) if (current >= monthStart && current <= monthEnd) periodDays.add(dateOnly(current));
  const insights = await require("../services/cyclePrediction").computeCycleInsights(req.user, new Date(Math.min(Date.now(), monthEnd.getTime())));
  const range = (start, end) => { const result = []; if (!start || !end) return result; for (let current = parseDateOnly(start); current <= parseDateOnly(end); current = addDays(current, 1)) if (current >= monthStart && current <= monthEnd) result.push(dateOnly(current)); return result; };
  return res.json({ year, month, period_days: [...periodDays].sort(), predicted_period_days: insights.next_period_date ? range(insights.next_period_date, dateOnly(addDays(insights.next_period_date, (insights.average_period_length || 5) - 1))) : [], fertile_days: range(insights.fertile_window_start, insights.fertile_window_end), ovulation_days: range(insights.ovulation_date, insights.ovulation_date), pms_days: range(insights.pms_window_start, insights.pms_window_end), daily_logs: rows.map((item) => serialize(item, ["log_date", "created_at", "updated_at"])), insights });
}

function localToday() { return new Date(); }

async function createReminder(req, res) {
  const data = req.body || {};
  const errors = ["item_name", "reminder_type", "scheduled_time"].filter((field) => !String(data[field] || "").trim()).map((field) => `${field} is required.`);
  if (errors.length) return validationErrors(res, errors.map((message) => ["validation.invalid_payload", message]));
  const row = await MedicationSupplementReminder.create({ profile_id: req.user.id, item_name: String(data.item_name).trim(), reminder_type: String(data.reminder_type).trim(), scheduled_time: String(data.scheduled_time).trim(), dosage: data.dosage || null, adherence_status: data.adherence_status || "pending" });
  return messageResponse(res, "reminders.created_success", "Reminder created successfully.", 201, { reminder: serialize(row, ["adherence_date", "last_push_sent_on", "created_at"]) });
}

async function getReminders(req, res) { const rows = await MedicationSupplementReminder.find({ profile_id: req.user.id }).sort({ scheduled_time: 1 }); return res.json({ reminders: rows.map((item) => serialize(item, ["adherence_date", "last_push_sent_on", "created_at"])) }); }

async function ownedReminder(req, res) { const row = await MedicationSupplementReminder.findOne({ id: Number(req.params.reminder_id), profile_id: req.user.id }); if (!row) { errorResponse(res, "reminders.not_found", "Reminder not found.", 404); return null; } return row; }

async function updateReminder(req, res) { const row = await ownedReminder(req, res); if (!row) return; for (const field of ["item_name", "reminder_type", "scheduled_time", "dosage", "adherence_status"]) if (req.body?.[field] !== undefined) row[field] = req.body[field]; await row.save(); return messageResponse(res, "reminders.updated_success", "Reminder updated successfully.", 200, { reminder: serialize(row, ["adherence_date", "last_push_sent_on", "created_at"]) }); }
async function markTaken(req, res) { const row = await ownedReminder(req, res); if (!row) return; row.adherence_status = "taken"; row.adherence_date = localToday(); await row.save(); return messageResponse(res, "reminders.marked_taken", "Reminder marked as taken.", 200, { reminder: serialize(row, ["adherence_date", "last_push_sent_on", "created_at"]) }); }
async function snooze(req, res) { const row = await ownedReminder(req, res); if (!row) return; const minutes = Number(req.body?.minutes ?? 10); if (!Number.isInteger(minutes) || minutes <= 0) return errorResponse(res, "validation.minutes_positive", "minutes must be a positive integer.", 400); const [hours, mins] = String(row.scheduled_time).split(":").map(Number); const total = (hours * 60 + mins + minutes) % (24 * 60); row.scheduled_time = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; row.adherence_status = "snoozed"; row.adherence_date = localToday(); row.last_push_sent_on = null; await row.save(); return messageResponse(res, "reminders.snoozed", `Reminder snoozed by ${minutes} minutes.`, 200, { reminder: serialize(row, ["adherence_date", "last_push_sent_on", "created_at"]) }); }
async function deleteReminder(req, res) { const row = await ownedReminder(req, res); if (!row) return; await row.deleteOne(); return messageResponse(res, "reminders.deleted_success", "Reminder deleted successfully."); }

module.exports = { calendar, createReminder, createSymptom: undefined, deleteLog, deleteReminder, getLogByDate, getLogs, getReminders, markTaken, snooze, updateLog, updateReminder, upsertLog };
