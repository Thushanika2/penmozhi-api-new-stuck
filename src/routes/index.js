const express = require("express");

// The router is assembled here so the public URL prefixes remain visible in
// one place, just as the Flask blueprint registry did in the legacy service.
const router = express.Router();
router.use("/api/auth", require("./auth"));
module.exports = router;
