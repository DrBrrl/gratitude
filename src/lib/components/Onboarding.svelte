<script lang="ts">
  import type { Snippet } from 'svelte';
  import Questionnaire from './Questionnaire.svelte';
  import AccentPicker from './AccentPicker.svelte';
  import Icon from './Icon.svelte';
  import { selectedDescriptions, type OnboardingAnswers } from '../onboarding';
  let { answers=$bindable(), step=$bindable(0), colour=$bindable(0), busy=false, message='', stale=false, online=true, onfinish, onskip, ai, friends }:
    {answers:OnboardingAnswers;step?:number;colour?:number;busy?:boolean;message?:string;stale?:boolean;online?:boolean;onfinish:()=>Promise<void>;onskip:()=>Promise<void>;ai:Snippet;friends:Snippet}=$props();
  const titles=['Welcome','About you','Your colour','Your interests','Your prompts','Your AI','Your friends profile','Ready to reflect?'];
  const features=[
    ['Find a starting point','Ask an AI for a gratitude prompt. If you choose to share your topics of interest, past reflections, or feedback, the AI can use them to offer a more personalised prompt. You can also choose a saved backup prompt that you upload in advance without waiting for AI.'],
    ['Make the prompt yours','Edit any prompt, whether AI generated or not, ask for a different one to be generated, or write your own.'],
    ['Choose your AI','You can use your local LM Studio setup or the default Gemini model to generate prompts.'],
    ['Keep a picture with the moment','You can add photos and, if you want, ask AI to generate an image description for them. You can edit the description and use it in search later.'],
    ['Come back to a day','Write more than once a day, or retroactively add a reflection for a previous date. Backfilling a missed day fills that gap in your gratitude streak.'],
    ['See what you’ve noticed','Browse your calendar and colourful journal or search for a specific memory. Export your journal as as Markdown or JSON whenever you like.'],
    ['Share a little encouragement','Find friends and send a hug to remind them to practice gratitude! Your journal entries stay private.']
  ];
  function move(next:number){step=next;window.scrollTo(0,0);}
</script>
<section class="setup" aria-label="Personalise your journal" aria-busy={busy}>
  <header><span class="brand">Gratitude<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0 15 9 24 12 15 15 12 24 9 15 0 12 9 9Z" /></svg></span><span class="progress">{step+1} of 8</span></header>
  <progress value={step+1} max="8" aria-label="Onboarding progress"></progress>
  {#if step>0}<h1>{titles[step]}</h1>{/if}
  {#if step===0}
    <div class="welcome-copy">
      <p>Welcome to Gratitude! This is your own little space to pause and notice something you’re thankful for.</p>
      <p>Some days you’ll have a lot to write. Other days, “sunlight” might be all you’ve got. One word is enough! The whole idea is to take a few seconds to notice something, however small, and intentionally feel grateful for it.</p>
      <p>You can use an AI generated prompt, make up your own, or just start writing. There’s no right or wrong way to fill the page!</p>
    </div>
    <details class="glass"><summary>What can I do here?</summary>{#each features as [label,text]}<p><strong>{label}:</strong> {text}</p>{/each}</details>
    <p>The following questions will personalise your journal.</p><p class="hint">All questions are optional and you can change your answers later!</p>
  {:else if step===1}<Questionnaire bind:answers part="identity" disabled={busy} />
  {:else if step===2}<p>What's your favourite colour? Your choice will be used as your journal's main accent colour.</p><AccentPicker selected={colour} compact preview disabled={busy} onchange={async value=>{colour=value;}} />
  {:else if step===3}<Questionnaire bind:answers part="interests" disabled={busy} />
  {:else if step===4}<Questionnaire bind:answers part="prompts" disabled={busy} />
  {:else if step===5}<p class="hint">AI is optional. Choose your connections here, or set up later in Settings → AI settings.</p><p class="hint">Connection saves take effect separately. Continuing does not turn AI on or start a request.</p>{@render ai()}
  {:else if step===6}<p class="hint">Friends are optional. Your public display name and username are separate from your private answers. You can set up later in the Friends tab.</p><p class="hint">Saving a Friends profile takes effect separately, even if you skip the questionnaire afterwards.</p>{@render friends()}
  {:else}
    <section class="glass review" aria-label="Review your answers">
      <h2>Your private answers</h2><dl><dt>Name</dt><dd>{answers.preferredName.trim()||'Not provided'}</dd><dt>Pronouns</dt><dd>{answers.pronouns.trim()||'Not provided'}</dd><dt>Topics</dt><dd>{#if selectedDescriptions(answers).length}<ul>{#each selectedDescriptions(answers) as description}<li>{description}</li>{/each}</ul>{:else}None selected{/if}</dd><dt>Prompt scope</dt><dd>{answers.scope}</dd><dt>Word limit</dt><dd>Under {answers.wordLimit} words</dd></dl>
      <p class="hint">Your answers stay private unless you choose to share them below. Your colour will be saved when you finish. Separately saved connections and Friends profiles already apply.</p>
    </section>
    <section class="glass"><label class="sharing"><input type="checkbox" bind:checked={answers.useAnswers} disabled={busy} /><span>Use my questionnaire answers for AI prompts</span></label><p class="hint">When AI prompts are enabled, your selected descriptions and any name/pronouns above will be sent to your chosen provider. Journal and feedback sharing remain separate choices in AI settings. No AI request is made during setup.</p></section>
    {#if !online}<p class="hint">Your draft stays on this device. Reconnect to confirm your answers, or skip for now and keep writing.</p>{/if}
  {/if}
  {#if stale}<p role="alert">Your answers changed on another device. Your draft is kept. Open Personalise your journal in Settings to review the latest answers before saving.</p>{/if}
  {#if message}<p role="status">{message}</p>{/if}
  <footer>
    {#if step>0}<button class="outline" onclick={()=>move(step-1)} disabled={busy}><Icon name="back" size={18} />Back</button>{/if}
    {#if step<7}<button class="primary" onclick={()=>move(step+1)} disabled={busy}>{step===0?'Let’s get started':step===5||step===6?'Continue / set up later':'Continue'}<Icon name="next" size={18} /></button>{:else}<button class="primary" onclick={onfinish} disabled={busy||stale||!online}>{busy?'Saving…':'Save and start writing'}</button>{/if}
  </footer>
  <button class="skip" onclick={onskip} disabled={busy}>Skip for now</button>
  <p class="hint draft">Unconfirmed answers stay on this device until you save. Skipping keeps your saved settings.</p>
</section>
<style>
.setup{width:100%;max-width:620px;margin:auto;padding-bottom:24px}header{display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font:400 2.2rem/1.3 Georgia,serif;display:flex;align-items:center;gap:8px}.brand svg{width:19px;height:19px;fill:var(--accent-highlight)}.progress{color:#a9b1bf;font-size:.85rem}progress{width:100%;height:4px;margin:20px 0 16px;accent-color:var(--accent);border:0;border-radius:8px;overflow:hidden}progress::-webkit-progress-bar{background:#ffffff15}progress::-webkit-progress-value{background:var(--accent)}h1{font:400 2rem/1.3 Georgia,serif;margin:16px 0 22px}h2{font:400 1.4rem/1.4 Georgia,serif;margin:0 0 14px}p{line-height:1.65;color:#e0e4eb}.welcome-copy p{margin:14px 0}.hint{font-size:.85rem;line-height:1.55;color:#b9c1ce}.glass{padding:18px;margin:20px 0;background:linear-gradient(130deg,#55585b52,#191d1fe8 60%,#55514b57);border:1px solid var(--glass-border);border-radius:16px;backdrop-filter:blur(18px)}summary{cursor:pointer;color:var(--accent-text);font-weight:600}details p{font-size:.9rem}.review dl{margin:0}.review dt{color:#adb6c5;font-size:.8rem;margin-top:14px}.review dd{margin:5px 0;color:#eef0f4;overflow-wrap:anywhere}.review ul{padding-left:18px;margin:0}.review li+li{margin-top:8px}.sharing{display:flex;align-items:center;gap:12px;line-height:1.5}.sharing input{accent-color:var(--accent);width:20px;height:20px;flex-shrink:0}footer{display:flex;gap:12px;margin-top:26px}button{font:inherit;min-height:44px;border-radius:12px;cursor:pointer;padding:10px 15px;display:flex;align-items:center;justify-content:center;gap:8px}.primary{background:var(--accent-pale);color:#1d1d15;border:1px solid var(--accent-text);font-weight:700;flex:1}.outline{color:#edf0f5;border:1px solid var(--action-border);background:#bac5ce0a}.skip{margin:14px auto 0;background:none;border:0;color:#c2cad7;font-size:.9rem}.draft{text-align:center}button:disabled{opacity:.5;cursor:default}button:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid #bfc5ce;outline-offset:3px}[role=alert]{color:#f6b3bf}[role=status]{color:#d7dce5}
</style>
