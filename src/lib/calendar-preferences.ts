/** Literal calendar display choices; daily dates, streaks and rainbow colours are independent. */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export function validWeekStart(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}
export function weekdayLabels(weekStartsOn = 0) {
  return Array.from({length: 7}, (_, offset) => WEEKDAYS[(weekStartsOn + offset) % 7].slice(0, 3));
}
export type CalendarPreferenceAction = {
  eventId: string; type: 'WeekStartChosen'; schemaVersion: 1;
  payload: { previousEventId: string | null; weekStartsOn: number };
};
