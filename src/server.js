const { createApp } = require("./app");
const { config, validateServerConfig, connectDatabase } = require("./config/db");

async function start() {
  validateServerConfig();
  await connectDatabase();
  const app = createApp();
  return app.listen(config.port, () => console.log(`Penmozhi API listening on port ${config.port}`));
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start Penmozhi API:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { start };
