const mongoose = require("mongoose");

let connectionPromise = null;

// Connect to MongoDB using the URI supplied by the server configuration.
// Keeping this lifecycle code in one module makes it reusable for the API,
// migration scripts, and graceful shutdown handling.
async function connectDatabase(mongodbUri) {
  if (!mongodbUri) {
    throw new Error("MONGODB_URI must be configured before connecting to MongoDB.");
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (connectionPromise) return connectionPromise;

  connectionPromise = mongoose.connect(mongodbUri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
    }).then(() => {
      console.log("MongoDB connection successful.");
      return mongoose.connection;
    }).catch((error) => {
      connectionPromise = null;
      console.error("MongoDB connection failed:", error);
      throw error;
    });

  return connectionPromise;
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  connectionPromise = null;
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDatabase, disconnectDatabase, isDatabaseConnected };
