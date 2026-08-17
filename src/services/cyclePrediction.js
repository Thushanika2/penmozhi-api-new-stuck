const { CycleHistoryLog, HealthProfile } = require("../models");
const { addDays, dateOnly, diffDays } = require("../utils/dates");

const MIN_CYCLE_LENGTH = 21;
const MAX_TYPICAL_CYCLE_LENGTH = 45;
const UNUSUAL_GAP_DAYS = 46;
const clamp = (value, fallback = 28) => Math.max(MIN_CYCLE_LENGTH, Math.min(Number(value) || fallback, MAX_TYPICAL_CYCLE_LENGTH));

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function phaseSchedule(cycleLength, periodLength) {
  const length = clamp(cycleLength);
  const period = Math.min(Math.max(Number(periodLength) || 5, 2), length - 10);
  const peak = length - 14;
  const ovulationStart = Math.max(period + 1, peak - 1);
  const ovulationEnd = Math.min(length, peak + 1);
  return { period, peak, ovulationStart, ovulationEnd, pmsStart: Math.max(ovulationEnd + 1, length - 6), follicularStart: period + 1, follicularEnd: ovulationStart - 1, lutealStart: ovulationEnd + 1 };
}

function emptyInsights(stats, defaultCycle) {
  return {
    has_data: false, cycle_day: null, current_phase: null, last_period_start: null, next_period_date: null, ovulation_date: null,
    fertile_window_start: null, fertile_window_end: null, pms_window_start: null, pms_window_end: null, follicular_start_date: null,
    follicular_end_date: null, luteal_start_date: null, luteal_end_date: null, days_until_next_period: null, average_cycle_length: defaultCycle,
    average_period_length: stats.average_period_length || 5, phase_ranges: null, prediction_quality: { quality: "fallback", typical_cycles_used: 0, outlier_gaps_excluded: stats.outlier_gaps_excluded || 0, using_profile_default: true, assumed_cycle_length: defaultCycle }, statistics: stats,
  };
}

async function computeCycleInsights(user, referenceDate = new Date()) {
  const health = await HealthProfile.findOne({ profile_id: user.id }).lean();
  const cycles = await CycleHistoryLog.find({ profile_id: user.id }).sort({ cycle_start_date: 1 }).lean();
  const starts = cycles.map((cycle) => cycle.cycle_start_date).filter(Boolean);
  const defaultCycle = clamp(health?.average_cycle_length || 28);
  const defaultPeriod = Number(health?.average_period_length || 5);
  const rawGaps = starts.slice(1).map((value, index) => diffDays(value, starts[index]));
  const typicalGaps = rawGaps.filter((value) => value >= MIN_CYCLE_LENGTH && value <= MAX_TYPICAL_CYCLE_LENGTH);
  const averageCycle = clamp(median(typicalGaps.slice(-6)) || defaultCycle);
  const periodLengths = cycles.map((cycle) => diffDays(cycle.cycle_end_date, cycle.cycle_start_date) + 1).filter((value) => value > 0);
  const stats = { average_cycle_length: averageCycle, average_period_length: periodLengths.length ? Math.round(periodLengths.reduce((a, b) => a + b, 0) / periodLengths.length) : defaultPeriod, longest_cycle: rawGaps.length ? Math.max(...rawGaps) : null, shortest_cycle: rawGaps.length ? Math.min(...rawGaps) : null, longest_typical_cycle: typicalGaps.length ? Math.max(...typicalGaps) : null, shortest_typical_cycle: typicalGaps.length ? Math.min(...typicalGaps) : null, logged_cycles: cycles.length, typical_cycles_used: Math.min(typicalGaps.length, 6), outlier_gaps_excluded: rawGaps.length - typicalGaps.length };
  const latest = cycles[cycles.length - 1]?.cycle_start_date || health?.last_period_start;
  if (!latest) return emptyInsights(stats, defaultCycle);

  let currentStart = new Date(latest);
  let next = addDays(currentStart, averageCycle);
  while (next <= referenceDate) { currentStart = next; next = addDays(currentStart, averageCycle); }
  const schedule = phaseSchedule(averageCycle, stats.average_period_length);
  const iso = (days) => dateOnly(addDays(currentStart, days - 1));
  const cycleDay = Math.min(averageCycle, Math.max(1, diffDays(referenceDate, currentStart) + 1));
  let phase = "luteal";
  if (cycleDay <= schedule.period) phase = "menstrual";
  else if (cycleDay <= schedule.follicularEnd) phase = "follicular";
  else if (cycleDay < schedule.peak) phase = "fertile";
  else if (cycleDay <= schedule.peak + 1) phase = cycleDay === schedule.peak ? "ovulation" : "fertile";
  else if (cycleDay >= schedule.pmsStart) phase = "pms";
  const quality = stats.typical_cycles_used >= 3 ? "good" : stats.typical_cycles_used >= 1 ? "fair" : "fallback";
  return {
    has_data: true, cycle_day: cycleDay, current_phase: phase, last_period_start: dateOnly(currentStart), next_period_date: dateOnly(next), ovulation_date: iso(schedule.peak),
    fertile_window_start: iso(schedule.ovulationStart), fertile_window_end: iso(schedule.ovulationEnd), pms_window_start: iso(schedule.pmsStart), pms_window_end: dateOnly(addDays(next, -1)),
    follicular_start_date: schedule.follicularStart <= schedule.follicularEnd ? iso(schedule.follicularStart) : null, follicular_end_date: schedule.follicularStart <= schedule.follicularEnd ? iso(schedule.follicularEnd) : null,
    luteal_start_date: iso(schedule.lutealStart), luteal_end_date: dateOnly(addDays(next, -1)), days_until_next_period: diffDays(next, referenceDate), average_cycle_length: averageCycle, average_period_length: stats.average_period_length,
    phase_ranges: { menstrual: { start_day: 1, end_day: schedule.period }, follicular: { start_day: schedule.follicularStart, end_day: schedule.follicularEnd }, ovulation: { start_day: schedule.ovulationStart, end_day: schedule.ovulationEnd }, luteal: { start_day: schedule.lutealStart, end_day: averageCycle }, pms: { start_day: schedule.pmsStart, end_day: averageCycle } },
    prediction_quality: { quality, typical_cycles_used: stats.typical_cycles_used, outlier_gaps_excluded: stats.outlier_gaps_excluded, using_profile_default: stats.typical_cycles_used === 0, assumed_cycle_length: averageCycle }, statistics: stats,
  };
}

async function unusualGap(userId, start, excludeId = null) {
  const query = { profile_id: userId, cycle_start_date: { $lt: start } };
  if (excludeId !== null) query.id = { $ne: Number(excludeId) };
  const previous = await CycleHistoryLog.findOne(query).sort({ cycle_start_date: -1 }).lean();
  if (!previous) return null;
  const gapDays = diffDays(start, previous.cycle_start_date);
  return gapDays >= UNUSUAL_GAP_DAYS ? { gap_days: gapDays, previous_start: dateOnly(previous.cycle_start_date), new_start: dateOnly(start) } : null;
}

module.exports = { MAX_TYPICAL_CYCLE_LENGTH, UNUSUAL_GAP_DAYS, computeCycleInsights, unusualGap };
