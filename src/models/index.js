const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  { name: { type: String, unique: true, required: true }, sequence: { type: Number, default: 0 } },
  { versionKey: false },
);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema, "counters");

async function nextNumericId(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
  return counter.sequence;
}

function baseSchema(definition, modelName, options = {}) {
  const schema = new mongoose.Schema(definition, {
    strict: false,
    versionKey: false,
    ...options,
  });

  if (definition.id && !options.noNumericId) {
    schema.pre("save", async function assignNumericId(next) {
      if (!this.isNew || this.id !== undefined && this.id !== null) return next();
      try {
        this.id = await nextNumericId(modelName);
        next();
      } catch (error) {
        next(error);
      }
    });
  }

  schema.set("toJSON", {
    transform: (_document, result) => {
      delete result._id;
      delete result.__v;
      delete result.password_hash;
      delete result.pin_hash;
      return result;
    },
  });
  return schema;
}

function model(name, collection, definition, options) {
  return mongoose.models[name] || mongoose.model(name, baseSchema(definition, name, options), collection);
}

const UserProfile = model("UserProfile", "user_profiles", {
  id: { type: Number, unique: true, index: true },
  full_name: { type: String, required: true },
  date_of_birth: Date,
  email: { type: String, unique: true, required: true, lowercase: true, trim: true, index: true },
  password_hash: { type: String, required: true },
  language_preference: { type: String, default: "english" },
  country: String,
  timezone: { type: String, default: "Asia/Kolkata" },
  onboarding_completed: { type: Boolean, default: false },
  role: { type: String, default: "user", index: true },
  status: { type: String, default: "active", index: true },
  token_valid_after: Date,
  is_test_account: { type: Boolean, default: false },
  last_active_at: Date,
  login_count: { type: Number, default: 0 },
  registration_date: { type: Date, default: Date.now },
  mode: { type: String, default: "period" },
  pin_hash: String,
});

const HealthProfile = model("HealthProfile", "health_profiles", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, unique: true, index: true },
  weight: Number, height: Number, calculated_bmi: Number, nutritional_needs: String, health_risks: String,
  menarche_age: Number, average_cycle_length: { type: Number, default: 28 }, average_period_length: { type: Number, default: 5 },
  last_period_start: Date, typical_flow: String, cycle_regularity: String, common_symptoms: { type: Array, default: [] }, health_conditions: { type: Array, default: [] },
  sleep_hours: Number, water_intake_liters: Number, exercise_frequency: String, stress_level: String,
  smoking: { type: Boolean, default: false }, alcohol: { type: Boolean, default: false }, is_teenager: { type: Boolean, default: false },
  trying_to_conceive: { type: Boolean, default: false }, is_pregnant: { type: Boolean, default: false }, is_breastfeeding: { type: Boolean, default: false },
  using_birth_control: { type: Boolean, default: false }, birth_control_type: String, notify_period: { type: Boolean, default: true },
  notify_ovulation: { type: Boolean, default: true }, notify_medication: { type: Boolean, default: true }, notify_daily_health: { type: Boolean, default: true }, last_notified_for: Date,
  created_at: { type: Date, default: Date.now }, updated_at: { type: Date, default: Date.now },
});

const CycleHistoryLog = model("CycleHistoryLog", "cycle_history_logs", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, cycle_start_date: { type: Date, required: true }, cycle_end_date: { type: Date, required: true },
  flow_intensity: String, notes: String, gap_reason: String, predicted_next_period_date: Date, created_at: { type: Date, default: Date.now },
});

const SymptomTrackingLog = model("SymptomTrackingLog", "symptom_tracking_logs", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, date_time: { type: Date, default: Date.now }, category: String, pain_severity: Number, mood_status: String, sleep_metrics: String,
  disorder_status_id: Number, tracking_category_id: Number, custom_tag_id: Number, created_at: { type: Date, default: Date.now },
});

const MedicationSupplementReminder = model("MedicationSupplementReminder", "medication_supplement_reminders", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, item_name: String, reminder_type: String, scheduled_time: String, dosage: String,
  adherence_status: { type: String, default: "pending" }, adherence_date: Date, last_push_sent_on: Date, created_at: { type: Date, default: Date.now },
});

const AIHealthAssistantSession = model("AIHealthAssistantSession", "ai_health_assistant_sessions", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, symptom_analysis_log: String, generated_recommendations: String, posted_messages: String, saved_chat_sessions: String,
  created_at: { type: Date, default: Date.now }, updated_at: { type: Date, default: Date.now },
});

const PCOSDisorderStatus = model("PCOSDisorderStatus", "pcos_disorder_statuses", {
  id: { type: Number, unique: true, index: true }, health_profile_id: { type: Number, index: true }, disorder_type: { type: String, default: "none" }, diagnosis_status: { type: String, default: "not_diagnosed" }, diagnosed_date: Date, created_at: { type: Date, default: Date.now },
});

const EducationalResource = model("EducationalResource", "educational_resources", {
  id: { type: Number, unique: true, index: true }, article_title: String, content_category: String, content_body: String, language: { type: String, default: "english" }, publication_date: Date, video_url: String, video_public_id: String, created_at: { type: Date, default: Date.now },
});

const EducationVideo = model("EducationVideo", "education_videos", {
  id: { type: Number, unique: true, index: true }, title: String, description: String, video_url: String, video_public_id: String, thumbnail_url: String, category: String, created_by_admin_id: Number, created_at: { type: Date, default: Date.now }, updated_at: { type: Date, default: Date.now },
});

const ForumPost = model("ForumPost", "forum_posts", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, content_id: Number, title: String, body: String, posted_at: { type: Date, default: Date.now }, created_at: { type: Date, default: Date.now },
});

const ForumComment = model("ForumComment", "forum_comments", {
  id: { type: Number, unique: true, index: true }, post_id: { type: Number, index: true }, profile_id: { type: Number, index: true }, body: String, posted_at: { type: Date, default: Date.now }, created_at: { type: Date, default: Date.now },
});

const DailyLog = model("DailyLog", "daily_logs", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, log_date: { type: Date, index: true }, flow_level: String, pain_level: String, mood: String, energy: String, sleep_hours: Number, exercise: String, weight: Number, basal_temp: Number, cervical_fluid: String, sexual_activity: { type: Boolean, default: false }, notes: String, sleep_source: String, created_at: { type: Date, default: Date.now }, updated_at: { type: Date, default: Date.now },
});

const PasswordResetToken = model("PasswordResetToken", "password_reset_tokens", {
  id: { type: Number, unique: true, index: true }, user_id: { type: Number, index: true }, token_hash: { type: String, unique: true }, expires_at: Date, used_at: Date, created_at: { type: Date, default: Date.now },
});

const TrackingCategory = model("TrackingCategory", "tracking_categories", {
  id: { type: Number, unique: true, index: true }, key: { type: String, unique: true }, label: String, label_ta: String, group: String, is_default: { type: Boolean, default: true }, created_at: { type: Date, default: Date.now },
});

const CustomTag = model("CustomTag", "custom_tags", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, label: String, icon: String, created_at: { type: Date, default: Date.now },
});

const PregnancyProfile = model("PregnancyProfile", "pregnancy_profiles", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, unique: true, index: true }, last_menstrual_period: Date, due_date: Date, current_trimester: Number, created_at: { type: Date, default: Date.now }, updated_at: { type: Date, default: Date.now },
});

const PerimenopauseLog = model("PerimenopauseLog", "perimenopause_logs", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, log_date: Date, hot_flashes: { type: Boolean, default: false }, night_sweats: { type: Boolean, default: false }, mood_changes: String, sleep_disruption: { type: Boolean, default: false }, notes: String, created_at: { type: Date, default: Date.now },
});

const PushSubscription = model("PushSubscription", "push_subscriptions", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, endpoint: String, p256dh: String, auth: String, device_type: String, created_at: { type: Date, default: Date.now },
});

const CycleShare = model("CycleShare", "cycle_shares", {
  id: { type: Number, unique: true, index: true }, owner_profile_id: Number, shared_with_email: String, shared_with_profile_id: Number, status: { type: String, default: "pending" }, permissions: { type: Object, default: {} }, created_at: { type: Date, default: Date.now },
});

const WearableConnection = model("WearableConnection", "wearable_connections", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, index: true }, provider: String, access_token: String, refresh_token: String, last_synced_at: Date, created_at: { type: Date, default: Date.now },
});

const Subscription = model("Subscription", "subscriptions", {
  id: { type: Number, unique: true, index: true }, profile_id: { type: Number, unique: true, index: true }, plan: { type: String, default: "free" }, status: { type: String, default: "active" }, current_period_end: Date, created_at: { type: Date, default: Date.now },
});

const PrivacyRequest = model("PrivacyRequest", "privacy_requests", {
  id: { type: Number, unique: true, index: true }, user_id: { type: Number, index: true }, user_email: String, request_type: String, status: { type: String, default: "pending" }, created_at: { type: Date, default: Date.now }, completed_at: Date, completed_by_admin_id: Number,
});

const UserConsent = model("UserConsent", "user_consents", {
  id: { type: Number, unique: true, index: true }, user_id: { type: Number, index: true }, consent_type: String, policy_version: String, granted_at: { type: Date, default: Date.now }, context: String,
});

const AdminActionLog = model("AdminActionLog", "admin_action_logs", {
  id: { type: Number, unique: true, index: true }, admin_id: Number, action_type: String, target_user_id: Number, timestamp: { type: Date, default: Date.now }, notes: String,
});

const SharingInvite = model("SharingInvite", "sharing_invites", {
  id: { type: Number, unique: true, index: true }, invited_email: { type: String, index: true }, code_hash: String, sharer_user_id: { type: Number, index: true }, created_at: { type: Date, default: Date.now }, expires_at: Date, used_at: Date, status: { type: String, default: "active", index: true }, verification_attempts: { type: Number, default: 0 }, used_by_user_id: Number,
});

const SharedConnection = model("SharedConnection", "shared_connections", {
  id: { type: Number, unique: true, index: true }, sharer_user_id: { type: Number, index: true }, viewer_user_id: { type: Number, index: true }, active_sharer_user_id: Number, active_viewer_user_id: Number, status: { type: String, default: "active", index: true }, connected_at: { type: Date, default: Date.now }, disconnected_at: Date,
});

module.exports = {
  AdminActionLog, AIHealthAssistantSession, Counter, CustomTag, CycleHistoryLog, CycleShare, DailyLog, EducationVideo, EducationalResource, ForumComment, ForumPost, HealthProfile, MedicationSupplementReminder, PCOSDisorderStatus, PasswordResetToken, PerimenopauseLog, PregnancyProfile, PrivacyRequest, PushSubscription, SharedConnection, SharingInvite, Subscription, SymptomTrackingLog, TrackingCategory, UserConsent, UserProfile, WearableConnection,
};
