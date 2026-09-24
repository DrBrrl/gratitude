<script lang="ts">
  import { normalized } from '$lib/journal';
  let { text, query = '' }: { text: string; query?: string } = $props();
  const parts = $derived.by(() => {
    const words = normalized(query).trim().split(/\s+/).filter(Boolean);
    const chars = Array.from(text);
    const flags = chars.map(() => false);
    let folded = ''; const map: number[] = [];
    chars.forEach((char, index) => { const value = normalized(char); folded += value; for (let j = 0; j < value.length; j++) map.push(index); });
    for (const word of words) {
      let at = folded.indexOf(word);
      while (at !== -1) { for (let j = at; j < at + word.length; j++) flags[map[j]] = true; at = folded.indexOf(word, at + word.length); }
    }
    return chars.reduce<{ text: string; match: boolean }[]>((result, char, index) => {
      if (result.at(-1)?.match === flags[index]) result[result.length - 1].text += char;
      else result.push({ text: char, match: flags[index] });
      return result;
    }, []);
  });
</script>
{#each parts as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
<style>mark { background: #f4d35e; color: #15130c; text-decoration: underline; border-radius: 2px; }</style>
