const express = require("express");
const cycles = require("../controllers/cycles");
const dashboard = require("../controllers/dashboard");
const health = require("../controllers/health");
const logs = require("../controllers/logs");
const onboarding = require("../controllers/onboarding");
const tracking = require("../controllers/tracking");
const { authenticate, rolesRequired } = require("../middleware/auth");

const router = express.Router();
const user = rolesRequired("user");

router.use("/api/onboarding", authenticate);
router.get("/api/onboarding/status", onboarding.status);
router.post("/api/onboarding/complete", onboarding.complete);

router.use("/api/health-profiles", user);
router.get("/api/health-profiles/:health_profile_id", health.get);
router.put("/api/health-profiles/:health_profile_id", health.update);
router.get("/api/health-profiles/:health_profile_id/risks", health.risks);

router.use("/api/cycles", user);
router.post("/api/cycles", cycles.create);
router.get("/api/cycles/my", cycles.list);
router.get("/api/cycles/predict-next", cycles.predictNext);
router.get("/api/cycles/insights", cycles.insights);
router.get("/api/cycles/calendar", logs.calendar);
router.get("/api/cycles/predict-conceive", cycles.conceive);
router.put("/api/cycles/:cycle_id", cycles.update);
router.delete("/api/cycles/:cycle_id", cycles.remove);

router.use("/api/daily-logs", user);
router.get("/api/daily-logs/my", logs.getLogs);
router.get("/api/daily-logs/date/:log_date", logs.getLogByDate);
router.post("/api/daily-logs", logs.upsertLog);
router.put("/api/daily-logs/:log_id", logs.updateLog);
router.delete("/api/daily-logs/:log_id", logs.deleteLog);

router.use("/api/symptoms", user);
router.post("/api/symptoms", tracking.createSymptom);
router.get("/api/symptoms/my", tracking.symptoms);
router.get("/api/symptoms/trends", tracking.trends);

router.use("/api/reminders", user);
router.post("/api/reminders", logs.createReminder);
router.get("/api/reminders/my", logs.getReminders);
router.put("/api/reminders/:reminder_id", logs.updateReminder);
router.post("/api/reminders/:reminder_id/mark-taken", logs.markTaken);
router.post("/api/reminders/:reminder_id/snooze", logs.snooze);
router.delete("/api/reminders/:reminder_id", logs.deleteReminder);

router.use("/api/dashboard", user);
router.get("/api/dashboard/summary", dashboard.summary);

router.use("/api/tracking-categories", user);
router.get("/api/tracking-categories", tracking.categories);

router.use("/api/custom-tags", user);
router.post("/api/custom-tags", tracking.createTag);
router.get("/api/custom-tags/my", tracking.tags);
router.put("/api/custom-tags/:tag_id", tracking.updateTag);
router.delete("/api/custom-tags/:tag_id", tracking.deleteTag);

module.exports = router;
