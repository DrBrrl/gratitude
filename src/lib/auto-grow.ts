/** Grow textareas with wrapped lines in Firefox as well as Chromium. */
export function autoGrow(node: HTMLTextAreaElement, _value: string) {
  let frame = 0;
  let width = node.clientWidth;
  function resize() {
    node.style.height = 'auto';
    const border = node.offsetHeight - node.clientHeight;
    node.style.height = `${node.scrollHeight + border}px`;
  }
  function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(resize); }
  // Svelte updates the value property, not the value attribute. The action's
  // update callback covers programmatic guidance changes; input covers typing.
  const observer = new ResizeObserver(() => { if (node.clientWidth !== width) { width = node.clientWidth; schedule(); } });
  observer.observe(node); schedule();
  node.addEventListener('input', schedule);
  return { update() { schedule(); }, destroy() { cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('input', schedule); } };
}
