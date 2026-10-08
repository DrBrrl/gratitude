import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reflectionPreview } from '../../src/lib/reflection-preview.ts';

// Stand in for browser wrapping; paragraph gaps must not count as text lines.
const fitsThreeLines = (width: number) => (value: string) =>
  value.split('\n').reduce((sum, paragraph) => sum + Math.max(1, Math.ceil([...paragraph].length / width)), 0) <= 3;

test('short entries and exactly three paragraphs remain complete', () => {
  for (const text of ['A kindness.', 'First\nSecond\nThird']) {
    assert.deepEqual(reflectionPreview(text, fitsThreeLines(10)), { text, truncated: false });
  }
});

test('the third line may start a new paragraph and reserves room for an ellipsis', () => {
  const fits = fitsThreeLines(10);
  const result = reflectionPreview('First\nSecond\nThird paragraph continues for a while', fits);
  assert.equal(result.truncated, true);
  assert.equal(result.text, 'First\nSecond\nThird …');
  assert.ok(fits(result.text));
});

test('a complete sentence at the cutoff needs no extra ellipsis', () => {
  assert.deepEqual(reflectionPreview('One. Two. Three.', value => value.length <= 4),
    { text: 'One.', truncated: true });
});

test('mid-sentence truncation prefers a word boundary', () => {
  assert.deepEqual(reflectionPreview('A pleasant afternoon outside', value => value.length <= 15),
    { text: 'A pleasant …', truncated: true });
});

test('truncation does not split a combined emoji', () => {
  const family = '👨‍👩‍👧‍👦';
  assert.deepEqual(reflectionPreview(`${family}${family}${family}`, value => value.length <= family.length + 2),
    { text: `${family} …`, truncated: true });
});
