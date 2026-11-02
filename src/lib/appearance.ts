import { colours } from './colours.ts';

const names = ['Yellow', 'Lime', 'Green', 'Sea green', 'Turquoise', 'Cyan', 'Sky blue', 'Blue', 'Violet', 'Purple', 'Magenta', 'Rose', 'Red', 'Orange'];
/** Account accents use alternate shades of the existing 28-day journal wheel. */
export const accentChoices = Object.freeze(names.map((name, index) => ({ name, colourIndex: index * 2, colour: colours[index * 2] })));
function luminance(channels: number[]) {
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function readableWeight(colour: string, minimumContrast: number) {
  const channels = [1, 3, 5].map(at => parseInt(colour.slice(at, at + 2), 16) / 255);
  // Bound the frosted navigation over even a white photo. Small labels need
  // 4.5:1; graphical highlights can retain more colour at their 3:1 target.
  const surface = luminance([87 / 255, 87 / 255, 87 / 255]);
  for (let weight = 78; weight >= 0; weight--) {
    const text = channels.map(value => value * weight / 100 + 1 - weight / 100);
    if ((luminance(text) + .05) / (surface + .05) >= minimumContrast) return `${weight}%`;
  }
  return '0%';
}
export function accentTheme(colourIndex: number) {
  const choice = accentChoices.find(choice => choice.colourIndex === colourIndex) ?? accentChoices[0];
  // The smoke's original ochre is the default. Rotate colour, retaining its texture
  // and neutral charcoal; apply the filter to the background alone, never the UI.
  return { colour: choice.colour, textWeight: readableWeight(choice.colour, 4.5), highlightWeight: readableWeight(choice.colour, 3), smokeRotation: `${choice.colourIndex * 360 / colours.length}deg` };
}
