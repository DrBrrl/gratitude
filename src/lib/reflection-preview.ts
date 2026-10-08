/** Fit plain reflection text to a measured line budget without changing stored text. */
export function reflectionPreview(text: string, fits: (value: string) => boolean) {
  if (fits(text)) return { text, truncated: false };
  const characters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(part => part.segment);
  const prefix = (end: number) => characters.slice(0, end).join('').trimEnd();
  const sentenceEnded = (value: string) => /[.!?…]["'”’»\])}]*$/u.test(value);
  function longest(suffix: string) {
    let low = 0;
    let high = characters.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(prefix(middle) + suffix)) low = middle;
      else high = middle - 1;
    }
    return low;
  }
  const unmarkedEnd = longest('');
  if (sentenceEnded(prefix(unmarkedEnd))) return { text: prefix(unmarkedEnd), truncated: true };
  const end = longest(' …');
  let result = prefix(end);
  // Prefer a whole word when the line budget cuts through one. Long single words
  // can still be shortened; the ellipsis makes that interruption explicit.
  if (/[\p{L}\p{N}]$/u.test(characters[end - 1] ?? '') && /^[\p{L}\p{N}]/u.test(characters[end] ?? '')) {
    const wholeWords = result.replace(/\s+\S+$/u, '').trimEnd();
    if (wholeWords) result = wholeWords;
  }
  return { text: result + (sentenceEnded(result) ? '' : ' …'), truncated: true };
}
