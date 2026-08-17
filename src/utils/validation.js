const { parseDateOnly } = require("./dates");

const LANGUAGES = ["tamil", "english"];
const TRACKING_MODES = ["period", "conceive", "pregnancy", "perimenopause", "non_bleeding"];

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requiredBody(body) {
  return isObject(body) && Object.keys(body).length > 0;
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function requiredString(value, min = 1, max = Infinity) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

function validationItems(items) {
  return items.filter(Boolean).map((message) => ["validation.invalid_payload", message]);
}

function validateRegister(data) {
  return validationItems([
    !requiredString(data.full_name, 2, 255) && "full_name must be between 2 and 255 characters.",
    !validEmail(data.email) && "email must be a valid email address.",
    !requiredString(data.password, 6, 128) && "password must be between 6 and 128 characters.",
    data.language_preference !== undefined && !LANGUAGES.includes(String(data.language_preference).toLowerCase()) && "language_preference must be 'tamil' or 'english'.",
  ]);
}

function validateLogin(data) {
  return validationItems([
    !validEmail(data.email) && "email must be a valid email address.",
    !requiredString(data.password) && "password is required.",
  ]);
}

function validateDateField(value, field) {
  return value === undefined || parseDateOnly(value) ? null : `${field} must be a valid date (YYYY-MM-DD).`;
}

module.exports = { LANGUAGES, TRACKING_MODES, isObject, requiredBody, requiredString, validEmail, validationItems, validateDateField, validateLogin, validateRegister };
