<script lang="ts">
  let { value, disabled = false, oninput }: {
    value: string; disabled?: boolean; oninput: (value: string) => void;
  } = $props();
  const maximum = 10_000;
  let editor = $state<HTMLDivElement>();
  let message = $state('');
  let lastReported: string | undefined;
  let composing = false;

  function render(text: string) {
    if (!editor) return;
    editor.replaceChildren(...text.split(/\r?\n/).map((line, index) => {
      const paragraph = document.createElement('div');
      if (index === 0) paragraph.style.marginTop = '0';
      if (line) paragraph.textContent = line;
      else paragraph.append(document.createElement('br'));
      return paragraph;
    }));
  }
  $effect(() => {
    if (editor && value !== lastReported) {
      render(value);
      lastReported = value;
    }
  });
  function plainText() {
    if (!editor) return '';
    // innerText counts an empty block's placeholder BR and its block boundary
    // separately. Read paragraph structure so blank lines survive round trips.
    function read(container: Node): string {
      const paragraphs: string[] = [];
      let inline: Node[] = [];
      const flush = () => {
        if (!inline.length) return;
        let value = inline.map(node => node.nodeName === 'BR' ? '\n' : node.textContent ?? '').join('');
        if (inline.at(-1)?.nodeName === 'BR') value = value.slice(0, -1);
        paragraphs.push(value); inline = [];
      };
      for (const node of container.childNodes) {
        if (/^(DIV|P)$/.test(node.nodeName)) { flush(); paragraphs.push(read(node)); }
        else inline.push(node);
      }
      flush();
      return paragraphs.join('\n');
    }
    return read(editor).replace(/\r\n/g, '\n');
  }
  function report() {
    if (composing || !editor) return;
    // Enter clones the first paragraph's inline margin; normalize every block.
    // Select-all replacement can also leave the first paragraph as a bare text node.
    for (const block of editor.children) {
      if (block instanceof HTMLElement && /^(DIV|P)$/.test(block.tagName)) {
        block.style.marginTop = editor.firstChild === block ? '0' : '.5lh';
      }
    }
    const next = plainText();
    if (next.length > maximum) {
      message = 'Reflections can contain up to 10,000 characters.';
      render(lastReported ?? value);
      const range = document.createRange();
      range.selectNodeContents(editor); range.collapse(false);
      window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
      return;
    }
    message = '';
    lastReported = next;
    oninput(next);
  }
  function beforeInput(event: InputEvent) {
    if (event.inputType.startsWith('format') || event.inputType === 'insertOrderedList' || event.inputType === 'insertUnorderedList') {
      event.preventDefault(); return;
    }
    if (event.isComposing || !event.inputType.startsWith('insert')) return;
    const inserted = event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak' ? '\n' : event.data ?? '';
    if (plainText().length - (window.getSelection()?.toString().length ?? 0) + inserted.length > maximum) {
      event.preventDefault(); message = 'Reflections can contain up to 10,000 characters.';
    }
  }
  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    if (plainText().length - (window.getSelection()?.toString().length ?? 0) >= maximum) {
      message = 'Reflections can contain up to 10,000 characters.'; return;
    }
    document.execCommand('insertParagraph');
    report();
  }
  function paste(event: ClipboardEvent) {
    event.preventDefault();
    const pasted = event.clipboardData?.getData('text/plain').replace(/\r\n?/g, '\n') ?? '';
    if (!pasted) return;
    if (plainText().length - (window.getSelection()?.toString().length ?? 0) + pasted.length > maximum) {
      message = 'This paste would exceed the 10,000-character limit.'; return;
    }
    // Restart the selection transaction so paste has its own undo boundary.
    // insertText alone can merge the paste with preceding keyboard input.
    const selection = window.getSelection();
    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0).cloneRange();
      selection.removeAllRanges(); selection.addRange(range);
    }
    // insertText preserves native undo and does not import clipboard HTML.
    document.execCommand('insertText', false, pasted);
    report();
  }
</script>

<div id="reflection" class="editor" bind:this={editor} contenteditable={!disabled}
  role="textbox" aria-label="Your reflection" aria-multiline="true" aria-disabled={disabled}
  aria-describedby={message ? 'reflection-editor-message' : undefined} tabindex={disabled ? -1 : 0}
  data-empty={value.length === 0} data-placeholder="A few words are enough…" spellcheck="true"
  onfocus={() => document.execCommand('defaultParagraphSeparator', false, 'div')}
  onbeforeinput={beforeInput} oninput={report} onkeydown={keydown} onpaste={paste}
  ondrop={event => event.preventDefault()}
  oncompositionstart={() => composing = true}
  oncompositionend={() => { composing = false; report(); }}></div>
{#if message}<p id="reflection-editor-message" class="message" role="status">{message}</p>{/if}

<style>
  .editor { position: relative; color: inherit; min-height: 210px; width: 100%; font: inherit; font-size: 1.08rem; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; text-align: justify; cursor: text; }
  .editor:focus-visible { outline: none; }
  .editor :global(div), .editor :global(p) { margin: .5lh 0 0; min-height: 1lh; }
  .editor[data-empty=true]::before { content: attr(data-placeholder); position: absolute; color: #c8c4cd; pointer-events: none; }
  .editor[aria-disabled=true] { opacity: .5; cursor: default; }
  .message { margin: 12px 0 0; color: #ffd4cc; font-size: .85rem; }
</style>
