const { DailyLog, MedicationSupplementReminder, SymptomTrackingLog } = require("../models");
const { computeCycleInsights } = require("../services/cyclePrediction");
const { serialize } = require("../utils/serialize");

async function summary(req, res) {
  const insights = await computeCycleInsights(req.user);
  const health = await require("../models").HealthProfile.findOne({ profile_id: req.user.id }).lean();
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const symptoms = await SymptomTrackingLog.find({ profile_id: req.user.id, date_time: { $gte: today } }).sort({ date_time: -1 });
  const reminders = await MedicationSupplementReminder.find({ profile_id: req.user.id }).sort({ scheduled_time: 1 }).limit(3);
  const tips = { menstrual: "dashboard.tips.menstrual", follicular: "dashboard.tips.follicular", fertile: "dashboard.tips.fertile", ovulation: "dashboard.tips.ovulation", luteal: "dashboard.tips.luteal", pms: "dashboard.tips.pms" };
  return res.json({ cycle_insights: insights, today_symptoms: symptoms.map((item) => serialize(item, ["date_time", "created_at"])), upcoming_reminders: reminders.map((item) => serialize(item, ["adherence_date", "last_push_sent_on", "created_at"])), health_tip_key: tips[insights.current_phase] || "dashboard.tips.default", water_intake_goal_liters: health?.water_intake_liters || 2, quick_actions: [{ href: "/dashboard/cycle", label_key: "dashboard.actions.logPeriod" }, { href: "/dashboard/daily-log", label_key: "dashboard.actions.dailyLog" }, { href: "/dashboard/insights", label_key: "dashboard.actions.viewInsights" }, { href: "/dashboard/symptoms", label_key: "dashboard.actions.logSymptom" }, { href: "/dashboard/reminders", label_key: "dashboard.actions.viewReminders" }] });
}

module.exports = { summary };
