const mysql = require("mysql2/promise");
const mongoose = require("mongoose");
const { config } = require("../src/config/env");
const { Counter, ...models } = require("../src/models");

const tableToModel = {
  user_profiles: "UserProfile",
  health_profiles: "HealthProfile",
  cycle_history_logs: "CycleHistoryLog",
  symptom_tracking_logs: "SymptomTrackingLog",
  medication_supplement_reminders: "MedicationSupplementReminder",
  ai_health_assistant_sessions: "AIHealthAssistantSession",
  pcos_disorder_statuses: "PCOSDisorderStatus",
  educational_resources: "EducationalResource",
  education_videos: "EducationVideo",
  forum_posts: "ForumPost",
  forum_comments: "ForumComment",
  daily_logs: "DailyLog",
  password_reset_tokens: "PasswordResetToken",
  tracking_categories: "TrackingCategory",
  custom_tags: "CustomTag",
  pregnancy_profiles: "PregnancyProfile",
  perimenopause_logs: "PerimenopauseLog",
  push_subscriptions: "PushSubscription",
  cycle_shares: "CycleShare",
  wearable_connections: "WearableConnection",
  subscriptions: "Subscription",
  privacy_requests: "PrivacyRequest",
  user_consents: "UserConsent",
  admin_action_logs: "AdminActionLog",
  sharing_invites: "SharingInvite",
  shared_connections: "SharedConnection",
};

const dateOnlyFields = new Set([
  "date_of_birth", "last_period_start", "last_notified_for", "cycle_start_date", "cycle_end_date", "predicted_next_period_date", "log_date", "adherence_date", "last_push_sent_on", "diagnosed_date", "publication_date", "last_menstrual_period", "due_date",
]);

function mysqlOptions() {
  if (process.env.MYSQL_URL || process.env.DATABASE_URL) return process.env.MYSQL_URL || process.env.DATABASE_URL;
  return { host: process.env.DB_HOST || process.env.MYSQLHOST, port: Number(process.env.DB_PORT || process.env.MYSQLPORT || 3306), user: process.env.DB_USER || process.env.MYSQLUSER, password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD, database: process.env.DB_NAME || process.env.MYSQLDATABASE };
}

function normalizeRow(row) {
  const document = { ...row };
  for (const field of dateOnlyFields) if (document[field] && /^\d{4}-\d{2}-\d{2}/.test(String(document[field]))) document[field] = new Date(`${String(document[field]).slice(0, 10)}T00:00:00.000Z`);
  for (const field of ["created_at", "updated_at", "last_active_at", "token_valid_after", "expires_at", "used_at", "completed_at", "connected_at", "disconnected_at", "current_period_end", "last_synced_at", "granted_at", "timestamp"]) if (document[field]) document[field] = new Date(document[field]);
  if (typeof document.permissions === "string") { try { document.permissions = JSON.parse(document.permissions); } catch (_error) { document.permissions = {}; } }
  for (const field of ["common_symptoms", "health_conditions"]) if (typeof document[field] === "string") { try { document[field] = JSON.parse(document[field]); } catch (_error) { document[field] = []; } }
  return document;
}

async function migrateTable(connection, table, Model) {
  const [rows] = await connection.query(`SELECT * FROM \`${table}\``);
  if (!rows.length) return 0;
  const operations = rows.map((row) => { const document = normalizeRow(row); return { updateOne: { filter: { id: document.id }, update: { $set: document }, upsert: true } }; });
  await Model.bulkWrite(operations, { ordered: false });
  const max = Math.max(...rows.map((row) => Number(row.id) || 0));
  if (max) await Counter.findOneAndUpdate({ name: Model.modelName }, { $max: { sequence: max } }, { upsert: true });
  return rows.length;
}

async function main() {
  if (!config.mongodbUri) throw new Error("MONGODB_URI is required.");
  if (process.env.MIGRATION_REPLACE === "true") console.warn("MIGRATION_REPLACE=true was supplied; existing MongoDB documents will be replaced table by table.");
  const source = await mysql.createConnection(mysqlOptions());
  await mongoose.connect(config.mongodbUri);
  try {
    for (const [table, modelName] of Object.entries(tableToModel)) {
      const Model = models[modelName];
      if (!Model) throw new Error(`No Mongoose model registered for ${modelName}`);
      if (process.env.MIGRATION_REPLACE === "true") await Model.deleteMany({});
      try { const count = await migrateTable(source, table, Model); console.log(`${table}: migrated ${count} row(s)`); } catch (error) { if (error.code === "ER_NO_SUCH_TABLE") console.warn(`${table}: source table does not exist; skipped`); else throw error; }
    }
  } finally {
    await source.end();
    await mongoose.disconnect();
  }
}

main().catch((error) => { console.error("MySQL to MongoDB migration failed:", error.message); process.exitCode = 1; });
