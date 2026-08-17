const express = require("express");

// Endpoint routers are added in the second migration slice. Keeping this
// router valid in the first slice lets the runtime/configuration commit be
// syntax-checked and started independently.
module.exports = express.Router();
