<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { FirebaseClient } from '$lib/firebase/client';
  import type { JournalStore, JournalView } from '$lib/firebase/repository';
  import { parseImportArchive, sha256, IMPORT_LIMITS, type ImportArchive, type ImportSelection } from '$lib/import-archive';
  import { importCounts, importJournal } from '$lib/firebase/import-journal';
  import { preparePhoto } from '$lib/photos';
  import type { Projection } from '$lib/domain';
  import { dateLabel } from '$lib/journal';
  let { client, repository, view, uid, email }: {client:FirebaseClient; repository:JournalStore; view:JournalView; uid:string; email:string}=$props();
  let archive=$state.raw<ImportArchive|null>(null);
  let selection=$state.raw<ImportSelection|null>(null);
  let checking=$state(true), running=$state(false), pauseRequested=$state(false), confirmed=$state(false);
  let message=$state(''), error=$state(''), completed=$state(0), online=$state(true);
  let previewState=$state.raw<Projection|null>(null);
  let fileInput:HTMLInputElement;
  let mounted=true;
  const current=$derived(previewState && previewState.cursor>view.state.cursor ? previewState : view.state);
  const counts=$derived(archive ? importCounts(archive,current) : null);
  const remaining=$derived(counts ? counts.fresh+counts.pending : 0);
  onDestroy(()=>{mounted=false;pauseRequested=true;});
  onMount(()=>{
    const update=()=>online=navigator.onLine;
    update(); window.addEventListener('online',update);window.addEventListener('offline',update);
    void repository.readImportArchive().then(async saved=>{if(saved) await validate(saved);else if(mounted) checking=false;}).catch(()=>{checking=false;error='Could not reopen the selected ZIP. Choose it again.';});
    return ()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};
  });
  async function validate(saved:ImportSelection) {
    checking=true;error='';message='';confirmed=false;archive=null;selection=null;
    try {
      const parsed=await parseImportArchive(saved.file);
      const prepared:ImportSelection['prepared']={};let total=0;
      for (const [id,file] of parsed.files) {
        const cached=saved.prepared[id];
        const blob=cached && await sha256(new Uint8Array(await cached.blob.arrayBuffer()))===cached.digest ? cached.blob : await preparePhoto(file);
        total+=blob.size;
        if(total>IMPORT_LIMITS.expanded) throw new Error('Prepared photos exceed the import memory limit.');
        prepared[id]={blob,digest:await sha256(new Uint8Array(await blob.arrayBuffer()))};
      }
      // Read a verified server prefix before confirmation; validation itself never writes cloud data.
      const snapshot=await repository.exportSnapshot();
      if (!mounted) return;
      const next={file:saved.file,prepared};
      await repository.storeImportArchive(next);
      if (!mounted) return;
      archive=parsed;selection=next;previewState=snapshot;
      const result=importCounts(parsed,snapshot);
      completed=result.identical;
      message=result.pending ? 'An unfinished import is ready to resume.' : result.identical===parsed.records.length ? 'All entries in this ZIP are already imported.' : 'ZIP checked. No entries have been imported from this preview.';
      if(result.conflicts) error='Some source records changed since an earlier import. Nothing will be overwritten. Choose the original export or resolve the differences before importing.';
    } catch(cause) { if(mounted) error=cause instanceof Error ? cause.message : 'This ZIP could not be checked. No new entries were imported.'; }
    finally {if(mounted) checking=false;}
  }
  async function pick(event:Event) {
    const file=(event.currentTarget as HTMLInputElement).files?.[0];
    if(file) await validate({file,prepared:{}});
  }
  async function run() {
    if(!archive || !selection || !confirmed || running || counts?.conflicts || !online) return;
    running=true;pauseRequested=false;error='';message='Importing your journal…';
    try {
      const result=await importJournal(archive,selection,client,uid,repository,{paused:()=>pauseRequested || !mounted,state:()=>current,progress:done=>{if(mounted)completed=done;}});
      if(mounted) message=result.paused ? 'Import paused. Saved entries stay in your journal. Resume when you are ready.' : 'Import complete. Your entries and photos are saved.';
    } catch(cause) {if(mounted){message='Import paused. Saved entries stay in your journal.';error=cause instanceof Error ? cause.message : 'Reconnect and resume the import.';}}
    finally {if(mounted){running=false;confirmed=false;}}
  }
  async function forget() {await repository.storeImportArchive(null);archive=null;selection=null;message='';error='';confirmed=false;fileInput.value='';}
</script>
<p class="intro">Bring your entries and photos from an alternate gratitude export. Your ZIP is checked on this device before you confirm.</p>
<label class="file-button">Choose journal ZIP<input bind:this={fileInput} aria-label="Choose journal ZIP" type="file" accept=".zip,application/zip" onchange={pick} disabled={checking || running} /></label>
<p class="hint">Up to 20 MB · 5,000 entries · JPEG photos</p>
{#if checking}<p role="status">Checking the selected ZIP…</p>{/if}
{#if archive && counts}
  <p class="hint selected-file">Selected ZIP: {selection?.file.name}</p>
  <section class="glass" aria-label="Import preview">
    <h2>Ready to bring across</h2>
    <dl>
      <div><dt>Entries</dt><dd>{archive.records.length}</dd></div>
      <div><dt>Photos</dt><dd>{archive.photos}</dd></div>
      <div><dt>Photo-only entries</dt><dd>{archive.photoOnly}</dd></div>
      <div><dt>Missing prompts → [No prompt]</dt><dd>{archive.missingPrompts}</dd></div>
      <div><dt>New entries</dt><dd>{counts.fresh}</dd></div>
      <div><dt>Ready to resume</dt><dd>{counts.pending}</dd></div>
      <div><dt>Already imported</dt><dd>{counts.identical}</dd></div>
      <div><dt>Conflicts</dt><dd>{counts.conflicts}</dd></div>
    </dl>
    <p class="hint">{dateLabel(archive.firstDate)} – {dateLabel(archive.lastDate)}</p>
  </section>
  <p>Original writing, prompts and dates are kept. Photos use the journal’s usual private, metadata-free format. No AI requests are made.</p>
  <p class="hint">Identical entries are skipped, including entries you have since edited. Changed source records block import. Pausing keeps completed entries and photos; it does not undo them.</p>
  {#if running}<p role="status">{completed} of {archive.records.length} entries checked</p><button class="outline" onclick={()=>pauseRequested=true} disabled={pauseRequested}>{pauseRequested ? 'Pausing after this operation…' : 'Pause import'}</button>
  {:else if remaining && !counts.conflicts}
    <label class="confirm"><input type="checkbox" bind:checked={confirmed} />Import into {email}</label>
    <button class="primary" onclick={run} disabled={!confirmed || !online || !view.ready || !!view.pending}>{counts.pending ? 'Resume import' : 'Confirm import'}</button>
  {/if}
  {#if !running}<button class="forget" onclick={forget}>Forget selected ZIP on this device</button>{/if}
{/if}
{#if !online}<p role="status">Connect to check your saved history and continue importing.</p>{/if}
{#if message}<p class="message" role="status">{message}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}
<style>
  p {line-height:1.55;} .intro,.hint{color:#bfc5ce;} .hint{font-size:.85rem;line-height:1.5;}
  .glass{padding:20px;margin:20px 0;background:linear-gradient(130deg,#55585b52,#191d1fc9 60%,#55514b57);border:1px solid #c2c7ca65;border-radius:16px;backdrop-filter:blur(18px);}
  h2{font-size:1.2rem;margin:0 0 16px;} dl{margin:0;} dl div{display:flex;justify-content:space-between;gap:12px;margin:10px 0;} dt{color:#c5cad2;} dd{margin:0;font-weight:700;}
  input,button{font:inherit;} button{cursor:pointer;color:inherit;} button:disabled{opacity:.5;cursor:default;}
  .file-button{display:block;padding:12px;border:1px solid #bda74688;border-radius:12px;background:#d5d7dc14;color:var(--yellow);}
  .file-button input{display:block;width:100%;max-width:100%;margin-top:10px;font-size:.85rem;color:#c5cad2;}
  .confirm{display:flex;align-items:flex-start;gap:10px;margin:20px 0;overflow-wrap:anywhere;} input[type=checkbox]{accent-color:var(--yellow);margin-top:4px;flex-shrink:0;}
  .primary,.outline{width:100%;min-height:58px;padding:13px 18px;border:1px solid #e8d478;border-radius:13px;font-size:1.08rem;}
  .primary{background:linear-gradient(115deg,#ffe76b,#ffdc43 75%,#ffe773);color:#14140d;font-weight:600;} .outline{background:#10141850;}
  .forget{display:block;border:0;background:none;color:#bfc5ce;text-decoration:underline;margin:20px 0;padding:8px 0;min-height:44px;font-size:.85rem;}
  .message{color:#d5d9e1;} .error{color:#f6b3bf;} :focus-visible{outline:2px solid #bfc5ce;outline-offset:3px;}
</style>
