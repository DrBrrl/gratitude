import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accentChoices, accentTheme } from '../../src/lib/appearance.ts';
import { colours } from '../../src/lib/colours.ts';
import { replay, emptyProjection, parseAction, type JournalEvent } from '../../src/lib/domain.ts';

test('fourteen account accents reuse alternate journal shades, starting at yellow', () => {
  assert.equal(accentChoices.length, 14);
  assert.equal(accentChoices[0].name, 'Yellow');
  assert.equal(accentChoices[0].colour, '#e5e561');
  assert.deepEqual(accentChoices.map(choice => choice.colour), colours.filter((_, index) => index % 2 === 0));
  assert.deepEqual(accentTheme(99), accentTheme(0));
  for (const choice of accentChoices) {
    assert.equal(accentTheme(choice.colourIndex).colour, choice.colour);
    assert.equal(accentTheme(choice.colourIndex).smokeRotation, `${choice.colourIndex * 360 / 28}deg`);
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

test('accent labels retain readable contrast on the frosted navigation, including blue and violet', () => {
  function luminance(values: number[]) {
    const rgb = values.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }
  for (const choice of accentChoices) {
    const theme = accentTheme(choice.colourIndex), weight = parseFloat(theme.textWeight) / 100;
    const mixed = [1, 3, 5].map(at => parseInt(theme.colour.slice(at, at + 2), 16) * weight + 255 * (1 - weight));
    assert.ok((luminance(mixed) + .05) / (luminance([87, 87, 87]) + .05) >= 4.5, choice.name);
  }
  assert.equal(accentTheme(0).textWeight, '78%', 'Default yellow retains its existing text tint');
});
