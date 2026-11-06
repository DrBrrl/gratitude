<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import { TOPICS, SCOPE_OPTIONS, characterCount, type OnboardingAnswers } from '../onboarding';
  let { answers = $bindable(), part = 'all', disabled = false }: { answers: OnboardingAnswers; part?: 'all'|'identity'|'interests'|'prompts'; disabled?: boolean } = $props();
  const field = $props.id();
  let descriptionDialog: HTMLDialogElement;
  let editId = $state(''), editLabel = $state(''), editText = $state(''), editCustom = $state(false);
  let customLabel = $state(''), customDescription = $state('');
  const selectedCount = $derived(answers.selectedTopics.length + answers.customTopics.filter(topic => topic.selected).length);
  const editLimit = $derived(editCustom ? 150 : 149);
  function toggle(id: typeof TOPICS[number][0]) {
    answers.selectedTopics = answers.selectedTopics.includes(id) ? answers.selectedTopics.filter(value => value !== id) : [...answers.selectedTopics, id];
  }
  async function edit(id: string, label: string, description: string, custom = false) {
    editId = id; editLabel = label; editText = description; editCustom = custom;
    await tick(); descriptionDialog.showModal();
  }
  function saveDescription() {
    const text = editText.trim(); if (!text || characterCount(text) > editLimit) return;
    if (editCustom) answers.customTopics = answers.customTopics.map(topic => topic.id === editId ? { ...topic, description: text } : topic);
    else answers.descriptions = { ...answers.descriptions, [editId]: text };
    descriptionDialog.close();
  }
  function addCustom() {
    if (!customLabel.trim() || !customDescription.trim() || answers.customTopics.length >= 20) return;
    answers.customTopics = [...answers.customTopics, { id: `custom_${crypto.randomUUID()}`, label: customLabel.trim(), description: customDescription.trim(), selected: false }];
    customLabel = ''; customDescription = '';
  }
</script>

{#if part === 'all' || part === 'identity'}
  <section class="glass answers-section" aria-label="Private name and pronouns">
    <label for={`${field}-name`}>What would you like to be called?</label>
    <input id={`${field}-name`} bind:value={answers.preferredName} aria-invalid={characterCount(answers.preferredName.trim())>80} maxlength="160" placeholder="(First name)" autocomplete="off" {disabled} />
    <p class="hint">{characterCount(answers.preferredName.trim())} / 80 characters</p>
    <label for={`${field}-pronouns`}>Share your pronouns if you like!</label>
    <input id={`${field}-pronouns`} bind:value={answers.pronouns} aria-invalid={characterCount(answers.pronouns.trim())>80} maxlength="160" placeholder="e.g. she/they" autocomplete="off" {disabled} />
    <p class="hint">{characterCount(answers.pronouns.trim())} / 80 characters</p>
    <p class="hint">Your name and pronouns (up to 80 chatacters) are used privately in your journal. Both fields are optional.</p>
  </section>
{/if}

{#if part === 'all' || part === 'interests'}
  <section class="interests" aria-label="Topics to reflect on">
    <p class="hint">{part==='interests'?'Which':'What'} topics would you like to reflect on? Choosing at least three topics to give the AI a starting point is recommended. You can change these topics whenever you like.</p>
    {#if part==='interests'}<p class="hint">The <strong>topic description</strong> is sent through to the AI for prompt generation. Feel free to edit the description so that it reflects your understanding of the topic at any time. There is space for you to add any topics you'd like that aren't on the list at the bottom of the table!</p>{/if}
    <table class="glass topics">
      <colgroup><col class="topic-column" /><col /><col class="edit-column" /></colgroup>
      <thead><tr><th scope="col">Topic</th><th scope="col">Description</th><th scope="col"><span class="sr-only">Edit</span></th></tr></thead>
      <tbody>
        {#each TOPICS as [id, label] (id)}
          <tr class:selected={answers.selectedTopics.includes(id)}>
            <th scope="row"><button class="topic-choice" type="button" aria-pressed={answers.selectedTopics.includes(id)} onclick={() => toggle(id)} {disabled}>
              <span class="check" aria-hidden="true">{#if answers.selectedTopics.includes(id)}<Icon name="check" size={14} />{/if}</span><span>{label}</span>
            </button></th>
            <td>{answers.descriptions[id]}</td>
            <td><button class="pencil" type="button" aria-label={`Edit ${label} description`} onclick={() => edit(id, label, answers.descriptions[id])} {disabled}><Icon name="edit" size={18} /></button></td>
          </tr>
        {/each}
        {#each answers.customTopics as topic (topic.id)}
          <tr class:selected={topic.selected}>
            <th scope="row"><button class="topic-choice" type="button" aria-pressed={topic.selected} onclick={() => answers.customTopics = answers.customTopics.map(row => row.id === topic.id ? { ...row, selected: !row.selected } : row)} {disabled}>
              <span class="check" aria-hidden="true">{#if topic.selected}<Icon name="check" size={14} />{/if}</span><span>{topic.label}</span>
            </button></th>
            <td>{topic.description}<button class="remove" type="button" aria-label={`Remove ${topic.label} topic`} onclick={() => answers.customTopics = answers.customTopics.filter(row => row.id !== topic.id)} {disabled}>Remove</button></td>
            <td><button class="pencil" type="button" aria-label={`Edit ${topic.label} description`} onclick={() => edit(topic.id, topic.label, topic.description, true)} {disabled}><Icon name="edit" size={18} /></button></td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="hint selected-count" aria-live="polite">{selectedCount} {selectedCount === 1 ? 'topic' : 'topics'} selected. You can continue with none.</p>
    {#if answers.customTopics.length < 20}
      <div class="glass custom-topic">
        <h2>Other</h2>
        <label for={`${field}-custom-name`}>Your topic</label><input id={`${field}-custom-name`} bind:value={customLabel} maxlength="120" {disabled} />
        <label for={`${field}-custom-description`}>Topic description</label><textarea id={`${field}-custom-description`} bind:value={customDescription} rows="3" maxlength="300" {disabled}></textarea>
        <p class="hint">{characterCount(customDescription)} / 150 characters</p>
        <button class="outline" type="button" onclick={addCustom} disabled={disabled || !customLabel.trim() || !customDescription.trim() || characterCount(customLabel.trim()) > 60 || characterCount(customDescription.trim()) > 150}>Add topic</button>
        <p class="hint">Add your topic, then select it in the table. You can add up to 20 custom topics.</p>
      </div>
    {:else}<p class="hint">You have 20 custom topics. Remove one to add another.</p>{/if}
  </section>
{/if}

{#if part === 'all' || part === 'prompts'}
  <section class="glass answers-section" aria-label={part==='prompts'?'AI generated prompt scope':'Prompt scope'}>
    <h2>{part==='prompts'?'AI generated prompt scope':'Prompt scope'}</h2>{#if part==='prompts'}<p class="hint">The AI will be asked to generate prompts based on your preference for scope.</p>{/if}
    {#each SCOPE_OPTIONS as [value, label, description] (value)}
      <label class="scope" class:active={answers.scope === value}>
        <input type="radio" name={`${field}-scope`} {value} bind:group={answers.scope} {disabled} />
        <span><strong>{label}</strong><span>{description}</span></span>
      </label>
    {/each}
  </section>
  <section class="glass answers-section word-limit" aria-label="Prompt word limit">
    <h2>AI-generated prompt word limit</h2>
    <p class="hint">Choose a limit for the length of the prompts generated by the AI. This limit does not impact the amount you are able to write in your reflections.</p>
    <label for={`${field}-word-limit`}>Prompts under {answers.wordLimit} words</label>
      <input id={`${field}-word-limit`} type="range" min="50" max="200" step="10" bind:value={answers.wordLimit} {disabled} />
      <div class="range-ends hint"><span>50</span><span>200</span></div>
  </section>
{/if}

<dialog bind:this={descriptionDialog} aria-labelledby={`${field}-edit-title`} class="description-sheet">
  <h2 id={`${field}-edit-title`}>Edit {editLabel} description</h2>
  <label class="sr-only" for={`${field}-edit`}>{editLabel} description</label>
  <textarea id={`${field}-edit`} bind:value={editText} maxlength={editLimit * 2} rows="4"></textarea>
  <p class="hint counter">{characterCount(editText)} / {editLimit}</p>
  <p class="hint">Changes here stay in your setup until you confirm.</p>
  <div class="sheet-actions"><button class="outline" type="button" onclick={() => descriptionDialog.close()}>Cancel</button><button class="primary" type="button" onclick={saveDescription} disabled={!editText.trim() || characterCount(editText) > editLimit}>Save description</button></div>
</dialog>

<style>
  .glass{background:linear-gradient(130deg,#55585b52,#191d1fe8 60%,#55514b57);border:1px solid var(--glass-border);border-radius:16px;box-shadow:inset 0 1px 0 #ffffff15,0 8px 24px #00000020;backdrop-filter:blur(18px)}
  .answers-section,.custom-topic{padding:18px;margin:18px 0}h2{font-family:Georgia,serif;font-size:1.25rem;font-weight:500;margin:0 0 14px}.hint{font-size:.85rem;line-height:1.5;color:#b5bcc6}label{display:block;color:#e1e4e9;font-weight:600;line-height:1.5;margin:14px 0 6px}label:first-child{margin-top:0}
  input:not([type=radio]):not([type=range]),textarea{box-sizing:border-box;width:100%;min-height:44px;color:#f3f4f7;border:1px solid var(--glass-border);border-radius:10px;background:#11151ab3;padding:10px 12px;font:inherit}textarea{resize:vertical;line-height:1.6}input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px}button{font:inherit;cursor:pointer;min-height:44px;border-radius:10px}button:disabled{opacity:.5;cursor:default}.outline{background:#bac5ce0a;border:1px solid var(--action-border);color:#edf0f5;padding:9px 13px}.primary{background:var(--accent-pale);color:#1e1d15;border:1px solid var(--accent-text);padding:10px 14px;font-weight:700}
  .topics{border-spacing:0;width:100%;table-layout:fixed;overflow:hidden}.topic-column{width:39%}.edit-column{width:56px}.topics th,.topics td{border-bottom:1px solid #ffffff21;padding:10px 6px;vertical-align:middle;font-size:.82rem;line-height:1.45;overflow-wrap:anywhere;text-align:left}.topics thead th{padding:12px 8px;color:#e2e5e9;font-weight:600}.topics tbody tr:last-child td,.topics tbody tr:last-child th{border-bottom:0}.topics tr.selected{background:color-mix(in srgb,var(--accent) 13%,transparent)}.topic-choice{display:flex;align-items:center;gap:7px;text-align:left;width:100%;border:0;background:transparent;color:#f0f2f6;padding:3px 0;font-size:inherit;font-weight:600}.check{display:grid;place-items:center;flex-shrink:0;width:16px;height:16px;border:1px solid #b9bfc9;border-radius:4px}.topic-choice[aria-pressed=true] .check{background:var(--accent);border-color:var(--accent);color:#141414}.pencil{display:grid;place-items:center;width:44px;min-width:44px;padding:3px;border:1px solid var(--glass-border);background:#bac5ce0a;color:#e1e4e9}.remove{display:block;min-height:30px;padding:2px 0;margin-top:6px;background:transparent;color:#c9ced7;border:0;text-decoration:underline;font-size:.8rem}
  .scope{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid #ffffff21;border-radius:12px;font-weight:400;margin:10px 0}.scope.active{background:color-mix(in srgb,var(--accent) 10%,transparent);border-color:var(--glass-border)}.scope input{appearance:none;box-sizing:border-box;display:grid;place-items:center;width:18px;height:18px;flex-shrink:0;margin:3px;border:1px solid #b9bfc9;border-radius:50%;background:#15191dc0}.scope input:checked{border-color:var(--accent)}.scope input:checked::before{content:"";display:block;width:8px;height:8px;border-radius:50%;background:var(--accent)}.scope strong,.scope span span{display:block}.scope span span{font-size:.85rem;color:#c2c8d2;margin-top:3px}input[type=range]{width:100%;accent-color:var(--accent);min-height:44px}.range-ends{display:flex;justify-content:space-between}.selected-count{margin:10px 0}
  /* Whole-pixel text rows keep form controls and glass surfaces consistently rasterized. */
  .word-limit h2{line-height:28px}.word-limit p.hint,.custom-topic p.hint{line-height:20px;margin:12px 0}.word-limit label{line-height:24px}.word-limit input[type=range]{display:block;height:44px;margin:0}.word-limit .range-ends{line-height:20px}
  /* Explicit field sizing avoids fractional intrinsic textarea borders on glass. */
  textarea{display:block;line-height:1.625}.custom-topic textarea{height:100px}
  .description-sheet{box-sizing:border-box;width:min(440px,calc(100vw - 24px));max-height:85dvh;overflow:auto;border:1px solid var(--glass-border);border-radius:18px;padding:22px;background:#25292ef5;color:#f0f2f6;box-shadow:0 12px 50px #0008}.description-sheet::backdrop{background:#0009;backdrop-filter:blur(4px)}.description-sheet h2{font-size:1.4rem}.counter{text-align:right;margin-top:6px}.sheet-actions{display:flex;gap:12px}.sheet-actions button{flex:1}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
  @media(forced-colors:active){.scope input{forced-color-adjust:none;background:Canvas;border-color:CanvasText}.scope input:checked{border-color:Highlight}.scope input:checked::before{background:Highlight}.scope input:focus-visible{outline-color:Highlight}}
  @media(prefers-reduced-transparency:reduce){.glass{background:#1c2024;backdrop-filter:none}}
</style>
