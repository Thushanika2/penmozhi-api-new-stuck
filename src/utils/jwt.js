const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

function issueTokens(user) {
  const subject = String(user.id);
  return {
    access_token: jwt.sign({ sub: subject, type: "access" }, config.jwtSecret, { expiresIn: `${config.accessTokenMinutes}m` }),
    refresh_token: jwt.sign({ sub: subject, type: "refresh" }, config.jwtSecret, { expiresIn: `${config.refreshTokenDays}d` }),
  };
}

function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

module.exports = { issueTokens, verifyToken };
