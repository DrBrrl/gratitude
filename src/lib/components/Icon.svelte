<script lang="ts">
  let { name, size = 24, filled = false }: { name: string; size?: number; filled?: boolean } = $props();
</script>
<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'today'}<path d="m3 10 9-8 9 8v11h-6v-7H9v7H3Z" fill={filled ? 'currentColor' : 'none'} />
  {:else if name === 'journal'}
    {#if filled}<path d="M11 5C8 2 4 3 2 4v16c3-2 6-2 9 0ZM13 5c3-3 7-2 9-1v16c-3-2-6-2-9 0Z" fill="currentColor" stroke="none" />
    {:else}<path d="M12 5C9 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-2-1-7-2-10 1Zm0 0v15" />{/if}
  {:else if name === 'settings'}
    {#if filled}<path d="m9 3 1-2h4l1 2 2 1 2-.3 2 3-1 2v3l1 2-2 3-2-.3-2 1-1 2h-4l-1-2-2-1-2 .3-2-3 1-2V9L3 7l2-3 2 .3Z M15 10.5a3 3 0 1 0-6 0 3 3 0 1 0 6 0Z" transform="translate(0 1)" fill="currentColor" fill-rule="evenodd" stroke="none" />
    {:else}<path d="m9 3 1-2h4l1 2 2 1 2-.3 2 3-1 2v3l1 2-2 3-2-.3-2 1-1 2h-4l-1-2-2-1-2 .3-2-3 1-2V9L3 7l2-3 2 .3Z" transform="translate(0 1)"/><circle cx="12" cy="11.5" r="3"/>{/if}
  {:else if name === 'back'}<path d="m15 4-8 8 8 8" />
  {:else if name === 'next'}<path d="m9 5 7 7-7 7" />
  {:else if name === 'search'}<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>
  {:else if name === 'close'}<path d="m5 5 14 14M19 5 5 19"/>
  {:else if name === 'file'}<path d="M5 2h9l5 5v15H5Zm9 0v6h5M9 12h6M9 16h6"/>
  {:else if name === 'shield'}<path d="m12 2 9 4v6c0 5-5 9-9 10-4-1-9-5-9-10V6Z"/><path d="M12 7v7"/>
  {:else if name === 'sparkles'}<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM3 2v4M1 4h4M20 2v4M18 4h4"/>
  {:else if name === 'edit'}<path d="m15 3 6 6-11 11-7 1 1-7Zm-2 2 6 6"/>
  {:else if name === 'download'}<path d="M12 2v14m-5-5 5 5 5-5M3 16v5h18v-5"/>
  {:else if name === 'check'}<path d="m4 12 5 5L20 6"/>
  {:else if name === 'braces'}<path d="M8 2H6v7l-3 3 3 3v7h2M16 2h2v7l3 3-3 3v7h-2"/>
  {:else if name === 'account'}<circle cx="12" cy="7" r="4"/><path d="M3 22v-3a9 9 0 0 1 18 0v3"/>
  {/if}
</svg>
