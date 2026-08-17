const { startServer } = require("./app");
const { config, validateServerConfig } = require("./config/config");
const { connectDatabase } = require("./config/db");

async function start() {
  validateServerConfig();
  await connectDatabase(config.mongodbUri);
  return startServer();
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start Penmozhi API:", error);
    process.exitCode = 1;
  });
}

module.exports = { start };
