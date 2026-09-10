import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const base = process.env.BASE_PATH ?? '';
if (base && !/^\/[a-zA-Z0-9_/-]+$/.test(base)) {
  throw new Error('BASE_PATH must be empty or a slash-prefixed URL path');
}
if (base.endsWith('/') || base.includes('//')) {
  throw new Error('BASE_PATH must not contain empty segments or end with a slash');
}

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    paths: { base }
  }
};
