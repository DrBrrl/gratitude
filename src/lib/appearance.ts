/** Account theme points supplied by the user, in picker order. Date colours are independent. */
export const ACCENT_POINTS = Object.freeze([
  '#ffe100', '#a4df00', '#15d600', '#00d660', '#00ca94', '#3fca9c', '#355ce8',
  '#7707ff', '#a100ff', '#df40ff', '#ff35da', '#d62e31', '#da6709', '#dda41d'
]);
const names = ['Yellow', 'Lime', 'Green', 'Sea green', 'Turquoise', 'Teal', 'Blue', 'Violet', 'Purple', 'Magenta', 'Pink', 'Red', 'Orange', 'Gold'];
// Retain the existing even-numbered source-choice slots; no account event migration.
export const accentChoices = Object.freeze(names.map((name, index) => ({ name, colourIndex: index * 2, colour: ACCENT_POINTS[index], inkColour: swatchInk(ACCENT_POINTS[index]) })));
function luminance(channels: number[]) {
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function swatchInk(colour: string) {
  const surface=luminance([1,3,5].map(at=>parseInt(colour.slice(at,at+2),16)/255));
  const dark=luminance([16/255,19/255,24/255]);
  return 1.05/(surface+.05)>(surface+.05)/(dark+.05)?'#ffffff':'#101318';
}
function readableWeight(colour: string, minimumContrast: number) {
  const channels = [1, 3, 5].map(at => parseInt(colour.slice(at, at + 2), 16) / 255);
  // Bound the frosted navigation over even a white photo. Small labels need
  // 4.5:1; graphical highlights can retain more colour at their 3:1 target.
  const surface = luminance([87 / 255, 87 / 255, 87 / 255]);
  for (let weight = 100; weight >= 0; weight--) {
    const text = channels.map(value => value * weight / 100 + 1 - weight / 100);
    if ((luminance(text) + .05) / (surface + .05) >= minimumContrast) return `${weight}%`;
  }
  return '0%';
}
export function accentTheme(colourIndex: number) {
  const choice = accentChoices.find(choice => choice.colourIndex === colourIndex) ?? accentChoices[0];
  return { colour: choice.colour, textWeight: readableWeight(choice.colour, 4.5), highlightWeight: readableWeight(choice.colour, 3) };
}
