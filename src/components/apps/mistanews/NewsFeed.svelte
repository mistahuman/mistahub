<script lang="ts">
  import { onMount } from 'svelte';

  interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: number;
  }

  type AppState = 'loading' | 'ready' | 'error';

  let stories = $state<Story[]>([]);
  let appState = $state<AppState>('loading');
  let errorMessage = $state<string | null>(null);

  const TOP_STORIES_URL = 'https://hacker-news.firebaseio.com/v0/topstories.json';
  const ITEM_URL = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
  const HN_ITEM_URL = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

  async function fetchStories(): Promise<void> {
    appState = 'loading';
    errorMessage = null;
    stories = [];

    try {
      const idsRes = await fetch(TOP_STORIES_URL);
      if (!idsRes.ok) throw new Error(`Failed to fetch top stories: ${idsRes.status}`);
      const allIds: number[] = await idsRes.json();
      const topIds = allIds.slice(0, 10);

      const items = await Promise.all(
        topIds.map(async (id) => {
          const res = await fetch(ITEM_URL(id));
          if (!res.ok) throw new Error(`Failed to fetch item ${id}: ${res.status}`);
          return res.json();
        }),
      );

      stories = items.map((item) => ({
        id: item.id,
        title: item.title,
        url: item.url ?? HN_ITEM_URL(item.id),
        score: item.score ?? 0,
        by: item.by ?? '',
        descendants: item.descendants ?? 0,
        time: item.time,
      }));

      console.log('[mistanews] state: ready', stories);
      appState = 'ready';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error('[mistanews] state: error', errorMessage);
      appState = 'error';
    }
  }

  export function reload(): void {
    fetchStories();
  }

  onMount(() => {
    fetchStories();
  });
</script>

<div class="mx-auto w-full max-w-2xl">
  {#if appState === 'loading'}
    <p class="text-surface-400-600 text-center text-sm">Loading stories…</p>
  {:else if appState === 'error'}
    <div class="card preset-filled-error-500 p-6 text-center">
      <p class="font-semibold">Failed to load stories</p>
      <p class="mt-1 text-sm opacity-80">{errorMessage}</p>
      <button class="btn preset-filled mt-4" onclick={reload}>Retry</button>
    </div>
  {:else}
    <ol class="space-y-2">
      {#each stories as story (story.id)}
        <li
          class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] px-4 py-3"
        >
          <a href={story.url} target="_blank" rel="noopener noreferrer" class="block">
            <p class="font-medium">{story.title}</p>
            <p class="text-surface-400-600 mt-0.5 text-xs">
              {story.score} pts · by {story.by} · {story.descendants} comments
            </p>
          </a>
        </li>
      {/each}
    </ol>
    <div class="mt-4 text-center">
      <button class="btn preset-filled-surface-200-800 text-sm" onclick={reload}>Reload</button>
    </div>
  {/if}
</div>
