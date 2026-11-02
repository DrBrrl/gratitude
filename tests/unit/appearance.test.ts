import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCENT_POINTS, accentChoices, accentTheme } from '../../src/lib/appearance.ts';
import { colours } from '../../src/lib/colours.ts';
import { replay, emptyProjection, parseAction, type JournalEvent } from '../../src/lib/domain.ts';

test('fourteen account accents use the exact supplied points and retain stable source slots', () => {
  assert.equal(accentChoices.length, 14);
  assert.equal(accentChoices[0].name, 'Yellow');
  assert.equal(accentChoices[0].colour, '#ffe100');
  assert.deepEqual(ACCENT_POINTS,['#ffe100','#a4df00','#15d600','#00d660','#00ca94','#3fca9c','#355ce8','#7707ff','#a100ff','#df40ff','#ff35da','#d62e31','#da6709','#dda41d']);
  assert.deepEqual(accentChoices.map(choice=>choice.colourIndex),Array.from({length:14},(_,index)=>index*2));
  assert.deepEqual(accentChoices.map(choice=>choice.colour),ACCENT_POINTS);
  assert.equal(colours[0],'#e5e561','The journal date rainbow is independent');
  assert.deepEqual(accentTheme(99), accentTheme(0));
  for (const choice of accentChoices) {
    assert.equal(accentTheme(choice.colourIndex).colour, choice.colour);
  }
});
test('appearance replays from literal choices, independently of AI consent and date colours', () => {
  const log: Extract<JournalEvent, { type: 'AccentColourChosen' }>[] = [0, 14, 26].map((colourIndex, index) => ({ eventId: `accent-${index}`, type: 'AccentColourChosen', schemaVersion: 1, sequence: index + 1, recordedAt: '2026-10-01T04:31:07.000Z', payload: { previousEventId: index ? `accent-${index - 1}` : null, colourIndex } }));
  assert.deepEqual(replay(log), replay(log.slice(1), replay(log.slice(0, 1))));
  assert.deepEqual(replay(log).appearance, { colourIndex: 26, lastEventId: 'accent-2' });
  assert.deepEqual(replay(log).ai, emptyProjection().ai);
  assert.deepEqual(replay(log).entries, []);
  assert.throws(() => replay([{ ...log[0], payload: { colourIndex: 14, previousEventId: 'stale' } }]), /another device/);
  const { sequence, recordedAt, ...action } = log[0];
  for (const colourIndex of [-2, 1, 28, 2.5, '2', null]) assert.throws(() => parseAction({ ...action, payload: { previousEventId: null, colourIndex } }));
  assert.throws(() => parseAction({ ...action, payload: { ...action.payload, hex: '#fff' } }));
});

function luminance(values: number[]) {
  const rgb = values.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}

test('accent labels retain readable contrast on the frosted navigation, including blue and violet', () => {
  for (const choice of accentChoices) {
    const theme = accentTheme(choice.colourIndex), weight = parseFloat(theme.textWeight) / 100;
    const mixed = [1, 3, 5].map(at => parseInt(theme.colour.slice(at, at + 2), 16) * weight + 255 * (1 - weight));
    assert.ok((luminance(mixed) + .05) / (luminance([87, 87, 87]) + .05) >= 4.5, choice.name);
  }
  assert.equal(accentTheme(0).textWeight, '100%', 'The supplied yellow needs no white tint');
});

test('graphical accents stay close to their swatches while retaining contrast on frosted glass', () => {
  for (const choice of accentChoices) {
    const theme=accentTheme(choice.colourIndex),weight=parseFloat(theme.highlightWeight)/100;
    const mixed=[1,3,5].map(at=>parseInt(choice.colour.slice(at,at+2),16)*weight+255*(1-weight));
    assert.ok(weight>0&&weight<=1, `${choice.name} uses its source colour`);
    if(weight<1){const stronger=[1,3,5].map(at=>parseInt(choice.colour.slice(at,at+2),16)*(weight+.01)+255*(1-weight-.01));assert.ok((luminance(stronger)+.05)/(luminance([87,87,87])+.05)<3,`${choice.name} retains the strongest readable swatch tint`);}
    assert.ok(weight>=parseFloat(theme.textWeight)/100, `${choice.name} highlights are at least as vivid as small text`);
    assert.ok((luminance(mixed)+.05)/(luminance([87,87,87])+.05)>=3, `${choice.name} graphical contrast`);
  }
  assert.equal(accentTheme(0).highlightWeight,accentTheme(0).textWeight,'Yellow keeps its reviewed appearance');
  assert.ok(parseFloat(accentTheme(12).highlightWeight)>parseFloat(accentTheme(12).textWeight)*1.5,'Blue loses the previous grey wash');
});

test('dark supplied swatches have readable selection checks',()=>{
 for(const choice of accentChoices){const ink=[1,3,5].map(at=>parseInt(choice.inkColour.slice(at,at+2),16)),swatch=[1,3,5].map(at=>parseInt(choice.colour.slice(at,at+2),16));const values=[luminance(ink),luminance(swatch)].sort((a,b)=>a-b);assert.ok((values[1]+.05)/(values[0]+.05)>=4.5,choice.name);}
});
