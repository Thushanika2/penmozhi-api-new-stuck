const express = require("express");
const controller = require("../controllers/additional");
const { rolesRequired } = require("../middleware/auth");

const router = express.Router();
const user = rolesRequired("user");

router.use("/api/account", user);
router.get("/api/account/export", controller.accountExport);
router.delete("/api/account", require("../controllers/auth").deleteAccount);

router.use("/api/pregnancy-profile", user);
router.get("/api/pregnancy-profile", controller.getPregnancy);
router.put("/api/pregnancy-profile", controller.updatePregnancy);

router.use("/api/perimenopause-logs", user);
router.post("/api/perimenopause-logs", controller.createPerimenopause);
router.get("/api/perimenopause-logs/my", controller.getPerimenopause);
router.put("/api/perimenopause-logs/:log_id", controller.updatePerimenopause);

router.use("/api/pcos-status", user);
router.get("/api/pcos-status/my", controller.myPcos);
router.get("/api/pcos-status/patterns", controller.pcosPatterns);
router.put("/api/pcos-status/:status_id", controller.updatePcos);
router.get("/api/pcos-status/:status_id/history", controller.pcosHistory);

router.use("/api/push-subscriptions", user);
router.delete("/api/push-subscriptions/:subscription_id", controller.deletePush);
router.use("/api/push", user);
router.post("/api/push/subscribe", controller.createPush);
router.post("/api/push/unsubscribe", controller.unsubscribePush);

router.use("/api/wearables", user);
router.get("/api/wearables/my", controller.wearables);
router.get("/api/wearables/:provider/connect", controller.connectWearable);
router.get("/api/wearables/:provider/callback", controller.callbackWearable);
router.delete("/api/wearables/:provider/disconnect", controller.disconnectWearable);

router.use("/api/subscriptions", user);
router.get("/api/subscriptions/my", controller.subscription);
router.post("/api/subscriptions/checkout", controller.checkout);
router.post("/api/subscriptions/webhook", controller.webhook);

router.use("/api/insights", user);
router.get("/api/insights", controller.insights);

module.exports = router;
