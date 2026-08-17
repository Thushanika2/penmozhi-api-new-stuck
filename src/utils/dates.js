function parseDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = parseDateOnly(value) || new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + Number(days));
  return result;
}

function diffDays(later, earlier) {
  const a = parseDateOnly(later) || new Date(later);
  const b = parseDateOnly(earlier) || new Date(earlier);
  return Math.round((a - b) / 86_400_000);
}

module.exports = { addDays, dateOnly, diffDays, parseDateOnly };
