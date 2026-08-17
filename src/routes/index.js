const express = require("express");

// The router is assembled here so the public URL prefixes remain visible in
// one place, just as the legacy blueprint registry did.
const router = express.Router();
router.use("/api/auth", require("./auth"));
router.use(require("./core"));
router.use(require("./additional"));
router.use(require("./content"));
router.use(require("./sharing"));
router.use(require("./ai"));
router.use(require("./admin"));
module.exports = router;
