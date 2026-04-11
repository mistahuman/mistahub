<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  // ── Types ────────────────────────────────────────────────────────────────────
  type Artwork = {
    title: string;
    artist_display: string;
    imageUrl: string;
  };

  type CachedArtwork = {
    date: string;
    artwork: Artwork;
  };

  type State =
    | { status: 'loading' }
    | { status: 'success'; artwork: Artwork }
    | { status: 'error'; message: string };

  // ── Constants ────────────────────────────────────────────────────────────────
  const AIC_LIST = 'https://api.artic.edu/api/v1/artworks';
  const IIIF_BASE = 'https://www.artic.edu/iiif/2';
  const STORAGE_KEY = 'mistamuseum-daily-artwork';
  const MAX_ATTEMPTS = 3;
  // ~1316 pages at limit=100 (131k artworks). Stay in lower half for safety.
  const PAGE_RANGE = 600;

  // ── State ────────────────────────────────────────────────────────────────────
  let state = $state<State>({ status: 'loading' });
  let todayLabel = $state('');
  // Separate from `state` — tracks whether the <img> `load` event has fired.
  // Shimmer stays until this is true, regardless of API state.
  let imageLoaded = $state(false);

  // ── Seed helpers ─────────────────────────────────────────────────────────────
  function dateString(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function formatDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function loadCachedArtwork(date: string): Artwork | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as CachedArtwork;
      if (
        cached.date === date &&
        typeof cached.artwork?.title === 'string' &&
        typeof cached.artwork?.artist_display === 'string' &&
        typeof cached.artwork?.imageUrl === 'string'
      ) {
        return cached.artwork;
      }
    } catch {
      // ignore malformed storage
    }
    return null;
  }

  function saveCachedArtwork(date: string, artwork: Artwork): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ date, artwork }));
    } catch {
      // ignore storage errors
    }
  }

  /** djb2-style hash → non-negative integer */
  function hashString(s: string): number {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return h >>> 0; // unsigned 32-bit
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  interface AICWork {
    id: number;
    title: string;
    artist_display: string;
    image_id: string | null;
    is_public_domain: boolean;
  }

  interface AICResponse {
    data: AICWork[];
  }

  async function fetchPage(page: number): Promise<AICWork[]> {
    const url =
      `${AIC_LIST}?fields=id,title,artist_display,image_id,is_public_domain` +
      `&limit=100&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`AIC API error: ${res.status}`);
    const json: AICResponse = await res.json();
    return json.data.filter((w) => w.is_public_domain && w.image_id);
  }

  // ── Resolution ───────────────────────────────────────────────────────────────
  async function resolve(): Promise<void> {
    const today = dateString();
    todayLabel = formatDate(today);
    const cached = loadCachedArtwork(today);
    if (cached) {
      state = { status: 'success', artwork: cached };
      return;
    }

    const seed = hashString(today);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const page = (seed % PAGE_RANGE) + 1 + attempt;
        const works = await fetchPage(page);

        if (works.length === 0) continue;

        const pick = works[(seed + attempt) % works.length];
        const artwork = {
          title: pick.title,
          artist_display: pick.artist_display,
          imageUrl: `${IIIF_BASE}/${pick.image_id}/full/843,/0/default.jpg`,
        };
        saveCachedArtwork(today, artwork);
        state = { status: 'success', artwork };
        return;
      } catch {
        // silent — try next offset
      }
    }

    state = { status: 'error', message: 'Could not load today\u2019s artwork.' };
  }

  onMount(resolve);
</script>

<div class="mx-auto w-full max-w-2xl">
  <article
    class="card preset-filled-surface-100-900 border-surface-200-800 overflow-hidden border-[1px]"
  >
    <header class="flex flex-wrap items-center justify-end gap-3 px-5 py-4">
      {#if todayLabel}
        <span class="text-xs text-surface-500">{todayLabel}</span>
      {:else}
        <span class="placeholder h-4 w-28"></span>
      {/if}
    </header>

    <!-- Image frame: 4:3 during loading (shimmer needs height), natural size after -->
    <div
      class="mm-frame bg-surface-200-800"
      class:mm-frame-loading={!imageLoaded && state.status !== 'error'}
    >
      {#if state.status === 'loading' || (state.status === 'success' && !imageLoaded)}
        <div class="mm-shimmer placeholder" out:fade={{ duration: 400 }}></div>
      {/if}

      {#if state.status === 'error'}
        <div class="mm-error placeholder" in:fade={{ duration: 300 }}>
          <p>{state.message}</p>
        </div>
      {/if}

      {#if state.status === 'success'}
        <img
          src={state.artwork.imageUrl}
          alt={`${state.artwork.title} — ${state.artwork.artist_display}`}
          class="mm-img"
          class:mm-img-loaded={imageLoaded}
          onload={() => (imageLoaded = true)}
        />
      {/if}
    </div>

    <footer class="border-surface-200-800 min-h-28 border-t px-5 py-4">
      {#if state.status === 'loading' || (state.status === 'success' && !imageLoaded)}
        <div class="space-y-3">
          <div class="placeholder h-6 w-3/4"></div>
          <div class="placeholder h-4 w-1/2"></div>
        </div>
      {/if}

      {#if imageLoaded && state.status === 'success'}
        <div in:fade={{ delay: 100, duration: 300 }}>
          <p class="text-xl font-semibold leading-snug">{state.artwork.title}</p>
          <p class="mt-2 text-sm leading-relaxed text-surface-500">
            {state.artwork.artist_display}
          </p>
        </div>
      {/if}
    </footer>
  </article>
</div>

<style>
  /* ── Image frame ─────────────────────────────────────────────────────────── */
  .mm-frame {
    position: relative;
    width: 100%;
    overflow: hidden;
    border-radius: var(--radius-container);
  }

  /* 4:3 only while loading — gives the shimmer a height to fill */
  .mm-frame-loading {
    aspect-ratio: 4 / 3;
  }

  /* ── Shimmer ─────────────────────────────────────────────────────────────── */
  .mm-shimmer {
    position: absolute;
    inset: 0;
    border-radius: 0; /* frame clips corners, no need to repeat */
    overflow: hidden;
  }

  .mm-shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.22) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: mm-shimmer 1.6s ease-in-out infinite;
  }

  :global([data-mode='dark']) .mm-shimmer::after {
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.07) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
  }

  @keyframes mm-shimmer {
    0% {
      background-position: 150% 0;
    }
    100% {
      background-position: -150% 0;
    }
  }

  /* ── Image — normal flow so frame adopts natural dimensions ─────────────── */
  .mm-img {
    display: block;
    width: 100%;
    height: auto;
    /* opacity 0 reserves natural space immediately; shimmer sits on top via absolute */
    opacity: 0;
    transition: opacity 400ms ease;
  }

  .mm-img-loaded {
    opacity: 1;
  }

  /* ── Error ───────────────────────────────────────────────────────────────── */
  .mm-error {
    position: absolute;
    inset: 0;
    border-radius: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mm-error p {
    font-size: 0.85rem;
    color: var(--color-surface-500);
  }
</style>
