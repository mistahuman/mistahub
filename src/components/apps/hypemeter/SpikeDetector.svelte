<script lang="ts">
  import { onMount } from 'svelte';
  import SpikeRow from './SpikeRow.svelte';

  interface PageItem {
    title: string;
    views: number;
    rank: number;
  }

  let items = $state<PageItem[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let fetchedAt = $state<string | null>(null);

  const NOISE_PATTERNS = ['Main_Page', 'Special:', 'Wikipedia:', 'Portal:', 'File:'];

  function isNoise(title: string): boolean {
    return NOISE_PATTERNS.some((p) => title.includes(p));
  }

  function getYesterday(): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
  }

  onMount(async () => {
    try {
      const date = getYesterday();
      fetchedAt = date.replaceAll('/', '-');

      const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${date}`;

      const res = await fetch(url);
      const data = await res.json();

      const articles: { article: string; views: number }[] = data.items?.[0]?.articles ?? [];

      items = articles
        .filter((a) => !isNoise(a.article))
        .slice(0, 20)
        .map((a, i) => ({ title: a.article, views: a.views, rank: i + 1 }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error = msg;
    } finally {
      loading = false;
    }
  });

  const maxViews = $derived(items[0]?.views ?? 1);
</script>

<div class="mx-auto w-full max-w-2xl">
  {#if fetchedAt}
    <p class="text-surface-400-600 mb-4 text-center text-xs">{fetchedAt}</p>
  {/if}

  {#if loading}
    <div class="space-y-2">
      {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as i (i)}
        <div
          class="card preset-filled-surface-100-900 border-surface-200-800 animate-pulse border-[1px] px-4 py-3"
        >
          <div class="flex items-center gap-3">
            <div class="bg-surface-300-700 h-3 w-5 rounded"></div>
            <div class="bg-surface-300-700 h-3 flex-1 rounded" style="width: {70 - i * 5}%"></div>
            <div class="bg-surface-300-700 h-3 w-12 rounded"></div>
          </div>
          <div class="bg-surface-200-800 mt-2 h-0.5 w-full rounded-full">
            <div class="bg-surface-300-700 h-0.5 rounded-full" style="width: {90 - i * 7}%"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if error}
    <div class="card preset-filled-error-500 p-6 text-center">
      <p class="font-semibold">Failed to load data</p>
      <p class="mt-1 text-sm opacity-80">{error}</p>
    </div>
  {:else}
    <div class="space-y-1.5">
      {#each items as item (item.title)}
        <SpikeRow rank={item.rank} title={item.title} views={item.views} {maxViews} />
      {/each}
    </div>
    <p class="text-surface-400-600 mt-4 text-center text-xs">
      en.wikipedia.org · Refresh to update
    </p>
  {/if}
</div>
