const { CycleHistoryLog, HealthProfile, PCOSDisorderStatus } = require("../models");
const { addDays, dateOnly, parseDateOnly } = require("../utils/dates");
const { publicUser, serialize } = require("../utils/serialize");
const { LANGUAGES, requiredBody, validationItems } = require("../utils/validation");
const { errorResponse, validationErrors } = require("../utils/response");

const FLOW = ["light", "medium", "heavy", "very_heavy"];
const SYMPTOMS = ["cramps", "headache", "acne", "back_pain", "mood_swings", "tender_breasts", "fatigue", "bloating", "nausea", "cravings", "no_symptoms"];
const CONDITIONS = ["pcos", "endometriosis", "fibroids", "anemia", "thyroid", "diabetes", "hypertension", "migraine", "depression", "anxiety", "none"];

function ageAt(date) {
  const today = new Date();
  const birth = parseDateOnly(date);
  if (!birth) return null;
  return today.getUTCFullYear() - birth.getUTCFullYear() - ((today.getUTCMonth() + 1 < birth.getUTCMonth() + 1 || today.getUTCMonth() + 1 === birth.getUTCMonth() + 1 && today.getUTCDate() < birth.getUTCDate()) ? 1 : 0);
}

function validate(data) {
  const errors = [];
  for (const field of ["full_name", "date_of_birth", "country", "height", "weight", "language_preference", "timezone", "period_history", "average_cycle_length", "common_symptoms", "health_conditions", "sleep_hours", "water_intake_liters", "exercise_frequency", "stress_level", "smoking", "alcohol", "is_teenager", "trying_to_conceive", "is_pregnant", "is_breastfeeding", "using_birth_control", "notify_period", "notify_ovulation", "notify_medication", "notify_daily_health"]) if (data[field] === undefined || data[field] === null || data[field] === "") errors.push(`${field} is required.`);
  if (data.date_of_birth && (ageAt(data.date_of_birth) < 9 || ageAt(data.date_of_birth) > 80)) errors.push("Please enter a valid date of birth. This app is meant for users aged 9 to 80.");
  if (data.language_preference && !LANGUAGES.includes(String(data.language_preference).toLowerCase())) errors.push("language_preference must be 'tamil' or 'english'.");
  if (!Array.isArray(data.period_history) || data.period_history.length < 1 || data.period_history.length > 3) errors.push("Select between 1 and 3 period start date(s).");
  for (const [index, entry] of (data.period_history || []).entries()) if (!entry || !parseDateOnly(entry.period_start) || !FLOW.includes(entry.flow)) errors.push(`Invalid period history entry ${index + 1}.`);
  if (!Array.isArray(data.common_symptoms) || !data.common_symptoms.length || data.common_symptoms.some((item) => !SYMPTOMS.includes(item))) errors.push("common_symptoms contains an invalid option.");
  if (!Array.isArray(data.health_conditions) || !data.health_conditions.length || data.health_conditions.some((item) => !CONDITIONS.includes(item))) errors.push("health_conditions contains an invalid option.");
  return validationItems(errors);
}

async function status(req, res) {
  const health = await HealthProfile.findOne({ profile_id: req.user.id });
  return res.json({ onboarding_completed: req.user.onboarding_completed, user: publicUser(req.user), ...(health ? { health_profile: serialize(health, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) } : {}) });
}

async function complete(req, res) {
  if (req.user.onboarding_completed) return errorResponse(res, "onboarding.already_completed", "Onboarding is already completed.", 409);
  if (!requiredBody(req.body)) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const errors = validate(req.body);
  if (errors.length) return validationErrors(res, errors);
  const data = req.body;
  const sortedHistory = [...data.period_history].sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)));
  const latest = sortedHistory[0];
  let health = await HealthProfile.findOne({ profile_id: req.user.id });
  if (!health) health = new HealthProfile({ profile_id: req.user.id });
  const bmi = Number(data.weight) && Number(data.height) ? Math.round((Number(data.weight) / ((Number(data.height) / 100) ** 2)) * 10) / 10 : null;
  Object.assign(req.user, { full_name: String(data.full_name).trim(), date_of_birth: parseDateOnly(data.date_of_birth), country: String(data.country).trim(), timezone: String(data.timezone).trim(), language_preference: String(data.language_preference).toLowerCase(), onboarding_completed: true });
  Object.assign(health, { height: Number(data.height), weight: Number(data.weight), calculated_bmi: bmi, menarche_age: data.menarche_age ?? null, average_cycle_length: Number(data.average_cycle_length), average_period_length: Number(data.average_period_length || 5), last_period_start: parseDateOnly(latest.period_start), typical_flow: latest.flow, cycle_regularity: data.cycle_regularity || "regular", common_symptoms: data.common_symptoms, health_conditions: data.health_conditions, sleep_hours: Number(data.sleep_hours), water_intake_liters: Number(data.water_intake_liters), exercise_frequency: data.exercise_frequency, stress_level: data.stress_level, smoking: Boolean(data.smoking), alcohol: Boolean(data.alcohol), is_teenager: Boolean(data.is_teenager), trying_to_conceive: Boolean(data.trying_to_conceive), is_pregnant: Boolean(data.is_pregnant), is_breastfeeding: Boolean(data.is_breastfeeding), using_birth_control: Boolean(data.using_birth_control), birth_control_type: data.birth_control_type || "none", notify_period: Boolean(data.notify_period), notify_ovulation: Boolean(data.notify_ovulation), notify_medication: Boolean(data.notify_medication), notify_daily_health: Boolean(data.notify_daily_health), updated_at: new Date() });
  const pcos = await PCOSDisorderStatus.findOne({ health_profile_id: health.id });
  if (data.health_conditions.includes("pcos")) { if (pcos) Object.assign(pcos, { disorder_type: "pcos", diagnosis_status: "diagnosed" }); else await PCOSDisorderStatus.create({ health_profile_id: health.id, disorder_type: "pcos", diagnosis_status: "diagnosed" }); }
  if (!await CycleHistoryLog.exists({ profile_id: req.user.id })) for (const [index, entry] of sortedHistory.entries()) await CycleHistoryLog.create({ profile_id: req.user.id, cycle_start_date: parseDateOnly(entry.period_start), cycle_end_date: addDays(entry.period_start, Number(data.average_period_length || 5) - 1), flow_intensity: entry.flow, predicted_next_period_date: index === 0 ? addDays(entry.period_start, Number(data.average_cycle_length)) : null });
  await Promise.all([req.user.save(), health.save(), pcos?.save()]);
  return res.json({ message_code: "onboarding.completed", message: "Onboarding completed successfully.", user: publicUser(req.user), health_profile: serialize(health, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) });
}

module.exports = { complete, status };
