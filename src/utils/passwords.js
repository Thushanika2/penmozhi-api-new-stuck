// Compatibility aliases used by migration scripts and older controller code.
const { hashPassword, verifyWerkzeugHash } = require("./password");

module.exports = { hashPassword, checkPassword: verifyWerkzeugHash };
