const express = require("express");
const controller = require("../controllers/auth");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/logout", authenticate, controller.logout);
router.get("/profile", authenticate, controller.profile);
router.patch("/profile", authenticate, controller.updateProfile);
router.post("/refresh", controller.refresh);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.patch("/mode", authenticate, controller.updateMode);
router.patch("/app-lock", authenticate, controller.updateAppLock);
router.post("/app-lock/verify", authenticate, controller.verifyAppLock);
router.delete("/account", authenticate, controller.deleteAccount);
module.exports = router;
