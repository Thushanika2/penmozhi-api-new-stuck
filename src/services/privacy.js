const { CycleShare, HealthProfile, PrivacyRequest, UserConsent, UserProfile } = require("../models");

const POLICY_VERSIONS = {
  terms_of_service: "1.0",
  privacy_policy: "1.0",
  health_data_processing: "1.0",
  wearable_data_sharing: "1.0",
  cycle_date_sharing: "1.0",
};

async function recordConsent(userId, consentType, context = null) {
  return UserConsent.create({ user_id: userId, consent_type: consentType, policy_version: POLICY_VERSIONS[consentType] || "1.0", context });
}

async function recordSignupConsents(userId) {
  await Promise.all(["terms_of_service", "privacy_policy", "health_data_processing"].map((type) => recordConsent(userId, type)));
}

async function createPrivacyRequest(user, requestType) {
  const existing = await PrivacyRequest.findOne({ user_id: user.id, request_type: requestType, status: "pending" });
  return existing || PrivacyRequest.create({ user_id: user.id, user_email: user.email, request_type: requestType, status: "pending" });
}

async function deleteUserAccount(userId) {
  const collections = [
    "ForumComment", "ForumPost", "SymptomTrackingLog", "CustomTag", "PerimenopauseLog", "PregnancyProfile", "PushSubscription", "CycleShare", "SharingInvite", "SharedConnection", "WearableConnection", "Subscription", "AIHealthAssistantSession", "MedicationSupplementReminder", "DailyLog", "CycleHistoryLog", "PasswordResetToken", "UserConsent", "PCOSDisorderStatus", "HealthProfile",
  ];
  // Collection references are numeric to preserve the legacy API IDs.
  const modelMap = require("../models");
  await Promise.all(collections.map((name) => {
    const Model = modelMap[name];
    if (!Model) return null;
    const fields = name === "ForumComment" ? { profile_id: userId } : name === "ForumPost" ? { profile_id: userId } : name === "PCOSDisorderStatus" ? null : { profile_id: userId };
    return fields ? Model.deleteMany(fields) : null;
  }));
  await HealthProfile.deleteMany({ profile_id: userId });
  await CycleShare.updateMany({ shared_with_profile_id: userId }, { $set: { shared_with_profile_id: null } });
  await UserProfile.deleteOne({ id: userId });
}

module.exports = { POLICY_VERSIONS, createPrivacyRequest, deleteUserAccount, recordConsent, recordSignupConsents };
