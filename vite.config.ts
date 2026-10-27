import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ...(process.env.GRATITUDE_KIT_OUT_DIR ? {server:{watch:{ignored:['**/.svelte-kit/**','**/build/**']}}} : {})
});
