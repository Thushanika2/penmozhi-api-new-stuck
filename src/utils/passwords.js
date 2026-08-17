// Compatibility aliases used by migration scripts and older controller code.
const { hashPassword, verifyPasswordHash } = require("./password");

module.exports = { hashPassword, checkPassword: verifyPasswordHash };
