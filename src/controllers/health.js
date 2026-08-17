const { HealthProfile, PCOSDisorderStatus } = require("../models");
const { errorResponse, messageResponse, validationErrors } = require("../utils/response");
const { serialize } = require("../utils/serialize");

async function owned(id, user) {
  const profile = await HealthProfile.findOne({ id: Number(id), profile_id: user.id });
  return profile;
}

async function get(req, res) {
  const profile = await owned(req.params.health_profile_id, req.user);
  if (!profile) return errorResponse(res, "health.not_found", "Health profile not found.", 404);
  return res.json({ health_profile: serialize(profile, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) });
}

async function update(req, res) {
  const profile = await owned(req.params.health_profile_id, req.user);
  if (!profile) return errorResponse(res, "health.not_found", "Health profile not found.", 404);
  if (!req.body || !Object.keys(req.body).length) return errorResponse(res, "request.body_required", "Request body is required.", 400);
  const fields = ["weight", "height", "nutritional_needs", "health_risks", "menarche_age", "average_cycle_length", "average_period_length", "last_period_start", "typical_flow", "cycle_regularity", "sleep_hours", "water_intake_liters", "exercise_frequency", "stress_level", "birth_control_type", "smoking", "alcohol", "is_teenager", "trying_to_conceive", "is_pregnant", "is_breastfeeding", "using_birth_control", "notify_period", "notify_ovulation", "notify_medication", "notify_daily_health", "common_symptoms", "health_conditions"];
  const present = fields.filter((field) => req.body[field] !== undefined);
  if (!present.length) return validationErrors(res, [["validation.no_fields", "At least one health profile field is required."]]);
  for (const field of present) profile[field] = field === "last_period_start" ? new Date(`${req.body[field]}T00:00:00.000Z`) : req.body[field];
  if (profile.weight && profile.height) profile.calculated_bmi = Math.round((Number(profile.weight) / ((Number(profile.height) / 100) ** 2)) * 10) / 10;
  if (req.body.health_conditions) {
    const pcos = await PCOSDisorderStatus.findOne({ health_profile_id: profile.id });
    if (req.body.health_conditions.includes("pcos")) { if (pcos) Object.assign(pcos, { disorder_type: "pcos", diagnosis_status: "diagnosed" }); else await PCOSDisorderStatus.create({ health_profile_id: profile.id, disorder_type: "pcos", diagnosis_status: "diagnosed" }); }
    else if (pcos && pcos.disorder_type === "pcos") Object.assign(pcos, { disorder_type: "none", diagnosis_status: "not_diagnosed" });
    if (pcos) await pcos.save();
  }
  profile.updated_at = new Date();
  await profile.save();
  return messageResponse(res, "health.updated_success", "Health profile updated successfully.", 200, { health_profile: serialize(profile, ["last_period_start", "last_notified_for", "created_at", "updated_at"]) });
}

async function risks(req, res) {
  const profile = await owned(req.params.health_profile_id, req.user);
  if (!profile) return errorResponse(res, "health.not_found", "Health profile not found.", 404);
  const risks = profile.health_risks ? [profile.health_risks] : [];
  let bmiCategory = null;
  if (profile.calculated_bmi !== null && profile.calculated_bmi !== undefined) {
    if (profile.calculated_bmi < 18.5) { bmiCategory = "underweight"; risks.push("Underweight BMI — discuss nutrition with a clinician."); }
    else if (profile.calculated_bmi < 25) bmiCategory = "normal";
    else if (profile.calculated_bmi < 30) { bmiCategory = "overweight"; risks.push("Overweight BMI — lifestyle and diet review recommended."); }
    else { bmiCategory = "obese"; risks.push("Obese BMI — clinical follow-up recommended."); }
  }
  return res.json({ health_profile_id: profile.id, calculated_bmi: profile.calculated_bmi, bmi_category: bmiCategory, health_risks: profile.health_risks, nutritional_needs: profile.nutritional_needs, risks });
}

module.exports = { get, risks, update };
