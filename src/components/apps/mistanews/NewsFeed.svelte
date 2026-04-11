<script lang="ts">
  interface Story {
    id: number;
    title: string;
    url: string;
    score: number;
    by: string;
    descendants: number;
    time: number;
  }

  type Feed = 'top' | 'new' | 'best' | 'ask' | 'show' | 'job';
  type AppState = 'loading' | 'ready' | 'error';

  const FEEDS: { id: Feed; label: string }[] = [
    { id: 'top', label: 'Top' },
    { id: 'new', label: 'New' },
    { id: 'best', label: 'Best' },
    { id: 'ask', label: 'Ask' },
    { id: 'show', label: 'Show' },
    { id: 'job', label: 'Jobs' },
  ];

  const FEED_URL = (feed: Feed) => `https://hacker-news.firebaseio.com/v0/${feed}stories.json`;
  const ITEM_URL = (id: number) => `https://hacker-news.firebaseio.com/v0/item/${id}.json`;
  const HN_ITEM_URL = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

  let activeFeed = $state<Feed>('top');
  let stories = $state<Story[]>([]);
  let appState = $state<AppState>('loading');
  let errorMessage = $state<string | null>(null);

  function extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  async function fetchStories(feed: Feed): Promise<void> {
    appState = 'loading';
    errorMessage = null;
    stories = [];

    try {
      const idsRes = await fetch(FEED_URL(feed));
      if (!idsRes.ok) throw new Error(`Failed to fetch ${feed} stories: ${idsRes.status}`);
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

      console.log(`[mistanews] state: ready (feed: ${feed})`, stories);
      appState = 'ready';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`[mistanews] state: error (feed: ${feed})`, errorMessage);
      appState = 'error';
    }
  }

  // Runs on mount and whenever activeFeed changes
  $effect(() => {
    fetchStories(activeFeed);
  });

  export function reload(): void {
    fetchStories(activeFeed);
  }
</script>

<div class="mx-auto w-full max-w-2xl">
  <!-- ── Feed toggle ─────────────────────────────────────────────────────────── -->
  <div
    class="card preset-filled-surface-100-900 border-surface-200-800 mb-4 flex flex-wrap gap-1 border p-1"
  >
    {#each FEEDS as feed (feed.id)}
      <button
        class="btn text-sm {activeFeed === feed.id ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
        disabled={appState === 'loading'}
        onclick={() => {
          if (activeFeed !== feed.id) activeFeed = feed.id;
        }}
      >
        {feed.label}
      </button>
    {/each}
  </div>

  <!-- ── Feed slot: always occupies the same vertical space ─────────────────── -->
  <div class="min-h-[40rem]">
    {#if appState === 'loading'}
      <ol class="flex flex-col gap-2">
        {#each [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as i (i)}
          <li class="card preset-filled-surface-100-900 border-surface-200-800 border px-4 py-3">
            <div class="placeholder mb-2" style="width: {85 - i * 3}%; height: 1rem;"></div>
            <div class="placeholder mb-3" style="width: {35 - i * 1}%; height: 0.75rem;"></div>
            <div class="flex gap-2">
              <div
                class="placeholder"
                style="width: 4rem; height: 1.25rem; border-radius: var(--radius-base);"
              ></div>
              <div
                class="placeholder"
                style="width: 4rem; height: 1.25rem; border-radius: var(--radius-base);"
              ></div>
            </div>
          </li>
        {/each}
      </ol>
    {:else if appState === 'error'}
      <aside class="card preset-tonal-error mn-error-aside">
        <p class="mn-error-title">Could not load stories</p>
        <p class="mn-error-msg">{errorMessage}</p>
        <button class="btn preset-outlined mt-3 text-sm" onclick={reload}>Retry</button>
      </aside>
    {:else}
      <ol class="flex flex-col gap-2">
        {#each stories as story (story.id)}
          <li
            class="card preset-filled-surface-100-900 border-surface-200-800 hover:preset-tonal border px-4 py-3 transition-colors"
          >
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              class="group mb-2 block no-underline"
            >
              <p class="text-sm font-medium leading-snug group-hover:underline">{story.title}</p>
              <p class="mt-1 text-xs opacity-60">{extractDomain(story.url)}</p>
            </a>
            <div class="flex flex-wrap items-center gap-2 opacity-60">
              <span class="badge preset-outlined">▲ {story.score}</span>
              <span class="badge preset-outlined">💬 {story.descendants}</span>
              <span class="text-xs">by {story.by}</span>
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>

  <!-- ── Reload ─────────────────────────────────────────────────────────────── -->
  <button
    class="btn mt-3 min-h-10 w-full preset-outlined"
    disabled={appState === 'loading'}
    onclick={reload}
  >
    {#if appState === 'loading'}
      <svg
        class="animate-spin size-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
        ></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        ></path>
      </svg>
    {:else}
      Reload
    {/if}
  </button>
</div>

<style>
  /* ── Error aside ─────────────────────────────────────────────────────────── */
  .mn-error-aside {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .mn-error-title {
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .mn-error-msg {
    font-size: 0.8125rem;
    opacity: 0.8;
  }
</style>
