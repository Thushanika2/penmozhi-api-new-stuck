const mongoose = require("mongoose");
const { config } = require("./env");

async function connectDatabase() {
  if (!config.mongodbUri) {
    throw new Error("MONGODB_URI must be configured before connecting to MongoDB.");
  }

  await mongoose.connect(config.mongodbUri, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 10,
  });
  return mongoose.connection;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

module.exports = { connectDatabase, disconnectDatabase };
