const { HealthProfile, SymptomTrackingLog, PCOSDisorderStatus, TrackingCategory, CustomTag } = require("../models");
const { dateOnly, parseDateOnly } = require("../utils/dates");
const { errorResponse, messageResponse, validationErrors } = require("../utils/response");
const { serialize } = require("../utils/serialize");

async function createSymptom(req, res) {
  const data = req.body || {};
  const errors = [];
  if (!String(data.category || "").trim()) errors.push("category is required.");
  if (data.pain_severity === undefined || data.pain_severity === null || !Number.isInteger(Number(data.pain_severity)) || Number(data.pain_severity) < 0 || Number(data.pain_severity) > 10) errors.push("pain_severity must be an integer between 0 and 10.");
  if (data.date_time && Number.isNaN(new Date(data.date_time).getTime())) errors.push("date_time must be a valid ISO datetime.");
  if (errors.length) return validationErrors(res, errors.map((message) => ["validation.invalid_payload", message]));
  let disorderStatusId = data.disorder_status_id || null;
  if (!disorderStatusId) { const health = await HealthProfile.findOne({ profile_id: req.user.id }); const status = health && await PCOSDisorderStatus.findOne({ health_profile_id: health.id }).sort({ created_at: -1 }); disorderStatusId = status?.id || null; }
  const symptom = await SymptomTrackingLog.create({ profile_id: req.user.id, date_time: data.date_time ? new Date(data.date_time) : new Date(), category: String(data.category).trim(), pain_severity: Number(data.pain_severity), mood_status: data.mood_status ? String(data.mood_status).trim() : null, sleep_metrics: data.sleep_metrics ? String(data.sleep_metrics).trim() : null, disorder_status_id: disorderStatusId, tracking_category_id: data.tracking_category_id || null, custom_tag_id: data.custom_tag_id || null });
  const payload = { message: "Symptom entry created successfully.", message_code: "symptoms.created_success", symptom: serialize(symptom, ["date_time", "created_at"]) };
  if (symptom.pain_severity >= 7) { payload.ai_flag = "High pain severity detected. Review your PCOS status and consider asking the AI Health Assistant for recommendations."; payload.ai_flag_code = "symptoms.high_pain_severity"; }
  return res.status(201).json(payload);
}

async function symptoms(req, res) {
  const logs = await SymptomTrackingLog.find({ profile_id: req.user.id }).sort({ date_time: -1 });
  return res.json({ symptoms: logs.map((item) => serialize(item, ["date_time", "created_at"])) });
}

async function trends(req, res) {
  const logs = await SymptomTrackingLog.find({ profile_id: req.user.id }).sort({ date_time: 1 });
  const byDate = new Map();
  const byCategory = new Map();
  for (const log of logs) {
    const date = dateOnly(log.date_time) || "unknown";
    const category = log.category || "uncategorized";
    for (const [key, map] of [[date, byDate], [category, byCategory]]) { const current = map.get(key) || { count: 0, pain_sum: 0 }; current.count += 1; current.pain_sum += Number(log.pain_severity) || 0; map.set(key, current); }
  }
  const average = (map, key) => [...map.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([label, value]) => ({ [key]: label, count: value.count, avg_pain: Math.round((value.pain_sum / value.count) * 100) / 100 }));
  return res.json({ date_trends: average(byDate, "date"), category_trends: average(byCategory, "category"), total_entries: logs.length });
}

async function categories(req, res) {
  const query = req.query.group ? { group: req.query.group } : {};
  const rows = await TrackingCategory.find(query).sort({ group: 1, label: 1 });
  return res.json({ tracking_categories: rows.map((item) => serialize(item, ["created_at"])) });
}

async function createTag(req, res) {
  const label = String(req.body?.label || "").trim();
  if (!label) return validationErrors(res, [["validation.label_required", "label is required."]]);
  if (await CustomTag.exists({ profile_id: req.user.id, label })) return validationErrors(res, [["validation.label_exists", "A custom tag with this label already exists."]]);
  const tag = await CustomTag.create({ profile_id: req.user.id, label, icon: req.body.icon || null });
  return messageResponse(res, "custom_tags.created_success", "Custom tag created successfully.", 201, { custom_tag: serialize(tag, ["created_at"]) });
}

async function tags(req, res) {
  const rows = await CustomTag.find({ profile_id: req.user.id }).sort({ label: 1 });
  return res.json({ custom_tags: rows.map((item) => serialize(item, ["created_at"])) });
}

async function updateTag(req, res) {
  const tag = await CustomTag.findOne({ id: Number(req.params.tag_id), profile_id: req.user.id });
  if (!tag) return errorResponse(res, "custom_tags.not_found", "Custom tag not found.", 404);
  if (req.body?.label !== undefined) tag.label = String(req.body.label).trim();
  if (req.body?.icon !== undefined) tag.icon = req.body.icon || null;
  await tag.save();
  return messageResponse(res, "custom_tags.updated_success", "Custom tag updated successfully.", 200, { custom_tag: serialize(tag, ["created_at"]) });
}

async function deleteTag(req, res) {
  const tag = await CustomTag.findOne({ id: Number(req.params.tag_id), profile_id: req.user.id });
  if (!tag) return errorResponse(res, "custom_tags.not_found", "Custom tag not found.", 404);
  await tag.deleteOne();
  return messageResponse(res, "custom_tags.deleted_success", "Custom tag deleted successfully.");
}

module.exports = { categories, createSymptom, createTag, deleteTag, symptoms, tags, trends, updateTag };
