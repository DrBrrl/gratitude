import { civilDate } from './civil-date.ts';

export const COLOUR_ANCHOR = '2026-10-25';
export const COLOUR_PERIOD = 28;
const anchor = civilDate(COLOUR_ANCHOR).getTime();

// Soft, equally spaced hue steps for the glass cards. Yellow is the anchor;
// the wheel crosses red between pink and orange before returning to yellow.
function hueHex(hue: number) {
  const lightness = .64;
  const amplitude = .72 * Math.min(lightness, 1 - lightness);
  const channel = (offset: number) => {
    const position = (offset + hue / 30) % 12;
    const value = lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
    return Math.round(255 * value).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
export const colours = Object.freeze(Array.from({ length: COLOUR_PERIOD }, (_, index) => hueHex((60 + index * 360 / COLOUR_PERIOD) % 360)));

export function colourIndexForDay(day: string) {
  // UTC noon represents a civil date here, not the instant of local midnight.
  // Its integer day distance is unaffected by 23/25-hour daylight-saving days.
  const distance = (civilDate(day).getTime() - anchor) / 86_400_000;
  return ((distance % COLOUR_PERIOD) + COLOUR_PERIOD) % COLOUR_PERIOD;
}
export function colourForDay(day: string) { return colours[colourIndexForDay(day)]; }
