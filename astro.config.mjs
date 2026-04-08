// @ts-check
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mistahuman.github.io/template-astro-svelte-skeleton',
  base:
    process.env.NODE_ENV === 'production'
      ? '/template-astro-svelte-skeleton/'
      : '/template-astro-svelte-skeleton/',
  output: 'static',
  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      noExternal: ['lucide-svelte', '@skeletonlabs/skeleton-svelte'],
    },
  },
});
