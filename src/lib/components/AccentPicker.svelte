<script lang="ts">
  import { accentChoices } from '../appearance';
  let { selected, disabled = false, onchange }: { selected: number; disabled?: boolean; onchange: (index: number) => Promise<void> } = $props();
  let saving = $state(false), error = $state('');
  async function choose(index: number) {
    if (index === selected) return;
    saving = true; error = '';
    try { await onchange(index); }
    catch (cause) { error = cause instanceof Error ? cause.message : 'Could not save your colour. Please try again.'; }
    finally { saving = false; }
  }
</script>
<section class="accent-picker" aria-label="Accent colour">
  <h2>Your favourite colour</h2>
  <p>Choose the colour of your accents and smoke. Your journal keeps its date colours.</p>
  <div class="swatches" role="group" aria-label="Choose your accent colour">
    {#each accentChoices as choice}
      <button type="button" aria-label={choice.name} aria-pressed={selected === choice.colourIndex} disabled={disabled || saving} style:--swatch={choice.colour} onclick={() => choose(choice.colourIndex)}><span aria-hidden="true">{selected === choice.colourIndex ? '✓' : ''}</span></button>
    {/each}
  </div>
  <p class="hint" aria-live="polite">{saving ? 'Saving your colour…' : `${accentChoices.find(choice => choice.colourIndex === selected)?.name ?? 'Yellow'} · saved with your account`}</p>
  {#if error}<p role="alert">{error}</p>{/if}
</section>
<style>
  .accent-picker { margin:24px 0; padding:22px; border:1px solid var(--glass-border); border-radius:16px; background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57); backdrop-filter:blur(18px); }
  h2 { margin:0 0 12px; font:400 1.5rem/1.35 Georgia,serif; }
  p { margin:0 0 18px; color:#bfc5ce; font-size:.9rem; line-height:1.55; }
  .swatches { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px 6px; }
  button { display:grid; place-items:center; min-width:0; min-height:44px; padding:2px; border:2px solid transparent; border-radius:50%; background:none; cursor:pointer; }
  button[aria-pressed=true] { border-color:var(--swatch); }
  button span { display:grid; place-items:center; width:28px; height:28px; border-radius:50%; background:var(--swatch); color:#101318; font:700 1rem Arial,sans-serif; box-shadow:0 0 10px color-mix(in srgb,var(--swatch) 20%,transparent); }
  button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  button:disabled { cursor:default; opacity:.6; }
  .hint { margin:14px 0 0; font-size:.78rem; }
  [role=alert] { color:#f6b3bf; margin:14px 0 0; }
  @media(max-width:350px) { .accent-picker { padding:16px; } .swatches { gap:8px 0; } }
</style>
