const { dateOnly } = require("./dates");

function objectOf(value) {
  if (!value) return null;
  return typeof value.toObject === "function" ? value.toObject() : { ...value };
}

function serialize(value, dateFields = []) {
  const result = objectOf(value);
  if (!result) return null;
  delete result._id;
  delete result.__v;
  for (const field of dateFields) result[field] = dateOnly(result[field]);
  return result;
}

function publicUser(user) {
  const result = serialize(user, ["date_of_birth", "last_active_at", "registration_date", "token_valid_after"]);
  if (!result) return null;
  delete result.password_hash;
  delete result.pin_hash;
  result.has_app_lock = Boolean(user.pin_hash);
  return result;
}

module.exports = { objectOf, publicUser, serialize };
