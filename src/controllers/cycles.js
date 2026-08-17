const { CycleHistoryLog, HealthProfile } = require("../models");
const { addDays, dateOnly, parseDateOnly } = require("../utils/dates");
const { computeCycleInsights, unusualGap } = require("../services/cyclePrediction");
const { errorResponse, messageResponse, validationErrors } = require("../utils/response");
const { serialize } = require("../utils/serialize");

const GAP_REASONS = ["medication", "medical", "stress", "missed_logging", "contraception", "pregnancy_postpartum", "other"];

function validate(data) {
  const errors = [];
  for (const field of ["cycle_start_date", "cycle_end_date", "flow_intensity"]) if (!String(data[field] || "").trim()) errors.push(`${field} is required.`);
  const start = parseDateOnly(data.cycle_start_date); const end = parseDateOnly(data.cycle_end_date);
  if (!start || !end) errors.push("cycle_start_date and cycle_end_date must be valid dates (YYYY-MM-DD).");
  if (start && end && end < start) errors.push("cycle_end_date must be on or after cycle_start_date.");
  if (data.gap_reason && !GAP_REASONS.includes(data.gap_reason)) errors.push(`gap_reason must be one of: ${GAP_REASONS.join(", ")}`);
  if (data.prior_periods && (!Array.isArray(data.prior_periods) || data.prior_periods.some((period) => !parseDateOnly(period.cycle_start_date) || !parseDateOnly(period.cycle_end_date)))) errors.push("prior_periods must contain valid cycle dates.");
  return errors;
}

function gapPayload(gap) {
  return { error_code: "cycle.unusual_gap", error: "Unusual gap detected between period dates. Please explain the gap and add an earlier period date so predictions stay accurate.", gap_days: gap.gap_days, previous_start: gap.previous_start, new_start: gap.new_start, unusual_gap_threshold_days: 46, requires_gap_reason: true, requires_prior_period: true, gap_reason_options: GAP_REASONS };
}

async function create(req, res) {
  const data = req.body || {};
  const start = parseDateOnly(data.cycle_start_date);
  const gap = start && await unusualGap(req.user.id, start);
  if (gap && (!GAP_REASONS.includes(data.gap_reason) || !Array.isArray(data.prior_periods) || !data.prior_periods.length)) return res.status(422).json(gapPayload(gap));
  const errors = validate(data);
  if (errors.length) return validationErrors(res, errors.map((message) => ["validation.invalid_payload", message]));
  const health = await HealthProfile.findOne({ profile_id: req.user.id }).lean();
  const extra = data.prior_periods || [];
  const priorRows = [];
  for (const prior of extra) if (!await CycleHistoryLog.exists({ profile_id: req.user.id, cycle_start_date: parseDateOnly(prior.cycle_start_date) })) priorRows.push(await CycleHistoryLog.create({ profile_id: req.user.id, cycle_start_date: parseDateOnly(prior.cycle_start_date), cycle_end_date: parseDateOnly(prior.cycle_end_date), flow_intensity: prior.flow_intensity, notes: prior.notes || null, gap_reason: prior.gap_reason || null }));
  const cycle = await CycleHistoryLog.create({ profile_id: req.user.id, cycle_start_date: start, cycle_end_date: parseDateOnly(data.cycle_end_date), flow_intensity: String(data.flow_intensity).trim(), notes: data.notes ? String(data.notes).trim() : null, gap_reason: data.gap_reason || null, predicted_next_period_date: addDays(start, health?.average_cycle_length || 28) });
  return messageResponse(res, "cycle.created_success", "Cycle entry created successfully.", 201, { cycle: serialize(cycle, ["cycle_start_date", "cycle_end_date", "gap_reason", "predicted_next_period_date", "created_at"]), prior_cycles: priorRows.map((row) => serialize(row, ["cycle_start_date", "cycle_end_date", "predicted_next_period_date", "created_at"])) });
}

async function list(req, res) { const rows = await CycleHistoryLog.find({ profile_id: req.user.id }).sort({ cycle_start_date: -1 }); return res.json({ cycles: rows.map((item) => serialize(item, ["cycle_start_date", "cycle_end_date", "predicted_next_period_date", "created_at"])) }); }
async function insights(req, res) { return res.json(await computeCycleInsights(req.user)); }
async function predictNext(req, res) { const data = await computeCycleInsights(req.user); if (!data.has_data) return res.json({ predicted_next_period_date: null, message: "Log at least one cycle to get a prediction.", message_code: "cycle.log_at_least_one" }); return res.json({ predicted_next_period_date: data.next_period_date, ovulation_date: data.ovulation_date, fertile_window_start: data.fertile_window_start, fertile_window_end: data.fertile_window_end, pms_window_start: data.pms_window_start, pms_window_end: data.pms_window_end, cycle_day: data.cycle_day, current_phase: data.current_phase, days_until_next_period: data.days_until_next_period, average_cycle_length: data.average_cycle_length, based_on_cycles: data.statistics.typical_cycles_used, outlier_gaps_excluded: data.statistics.outlier_gaps_excluded, prediction_quality: data.prediction_quality }); }
async function update(req, res) { const row = await CycleHistoryLog.findOne({ id: Number(req.params.cycle_id), profile_id: req.user.id }); if (!row) return errorResponse(res, "cycle.not_found", "Cycle entry not found.", 404); const data = req.body || {}; const errors = validate(data); if (errors.length) return validationErrors(res, errors.map((message) => ["validation.invalid_payload", message])); row.cycle_start_date = parseDateOnly(data.cycle_start_date); row.cycle_end_date = parseDateOnly(data.cycle_end_date); row.flow_intensity = String(data.flow_intensity).trim(); row.notes = data.notes ? String(data.notes).trim() : null; if (data.gap_reason) row.gap_reason = data.gap_reason; const health = await HealthProfile.findOne({ profile_id: req.user.id }).lean(); row.predicted_next_period_date = addDays(row.cycle_start_date, health?.average_cycle_length || 28); await row.save(); return messageResponse(res, "cycle.updated_success", "Cycle entry updated successfully.", 200, { cycle: serialize(row, ["cycle_start_date", "cycle_end_date", "predicted_next_period_date", "created_at"]) }); }
async function remove(req, res) { const row = await CycleHistoryLog.findOne({ id: Number(req.params.cycle_id), profile_id: req.user.id }); if (!row) return errorResponse(res, "cycle.not_found", "Cycle entry not found.", 404); await row.deleteOne(); return messageResponse(res, "cycle.deleted_success", "Cycle entry deleted successfully."); }
async function conceive(req, res) { const data = await computeCycleInsights(req.user); return res.json({ has_data: data.has_data, fertile_window_start: data.fertile_window_start, fertile_window_end: data.fertile_window_end, ovulation_date: data.ovulation_date, next_period_date: data.next_period_date, message: data.has_data ? "Your fertile window is estimated from your logged cycles." : "Log at least one cycle to get conceive insights.", message_code: data.has_data ? "conceive.insights_ready" : "cycle.log_at_least_one" }); }

module.exports = { conceive, create, insights, list, predictNext, remove, update };
