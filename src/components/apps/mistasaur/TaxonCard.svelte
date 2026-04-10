<script lang="ts">
  import type { Period } from './MistasaurGame.svelte';

  type Props = {
    title: string;
    period: Period | null;
    thumbUrl: string | null;
    extract: string;
  };

  let { title, period, thumbUrl, extract }: Props = $props();

  let wikiUrl = $derived(
    `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  );
</script>

<a
  href={wikiUrl}
  target="_blank"
  rel="noopener noreferrer"
  class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] p-3 flex flex-col gap-2 hover:shadow-lg transition-shadow"
>
  {#if thumbUrl}
    <img src={thumbUrl} alt={title} class="tc-thumb" loading="lazy" />
  {:else}
    <div class="tc-thumb-ph placeholder"></div>
  {/if}

  <p class="tc-name">{title}</p>

  {#if period}
    <p class="tc-period">{period}</p>
  {/if}

  {#if extract}
    <p class="tc-extract">{extract}</p>
  {/if}
</a>

<style>
  .tc-thumb {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: var(--radius-base, 0.375rem);
  }

  .tc-thumb-ph {
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: var(--radius-base, 0.375rem);
  }

  .tc-name {
    font-weight: 600;
    font-style: italic;
    font-size: 0.95rem;
    line-height: 1.3;
  }

  .tc-period {
    font-size: 0.72rem;
    color: var(--color-surface-400);
  }

  .tc-extract {
    font-size: 0.78rem;
    color: var(--color-surface-500);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
