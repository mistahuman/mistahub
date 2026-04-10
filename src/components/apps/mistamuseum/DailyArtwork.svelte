<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  // ── Types ────────────────────────────────────────────────────────────────────
  type Artwork = {
    title: string;
    artist_display: string;
    imageUrl: string;
  };

  type State =
    | { status: 'loading' }
    | { status: 'success'; artwork: Artwork }
    | { status: 'error'; message: string };

  // ── Constants ────────────────────────────────────────────────────────────────
  const AIC_LIST = 'https://api.artic.edu/api/v1/artworks';
  const IIIF_BASE = 'https://www.artic.edu/iiif/2';
  const MAX_ATTEMPTS = 3;
  // ~1316 pages at limit=100 (131k artworks). Stay in lower half for safety.
  const PAGE_RANGE = 600;

  // ── State ────────────────────────────────────────────────────────────────────
  let state = $state<State>({ status: 'loading' });
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
    const seed = hashString(dateString());

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const page = (seed % PAGE_RANGE) + 1 + attempt;
        const works = await fetchPage(page);

        if (works.length === 0) continue;

        const pick = works[(seed + attempt) % works.length];
        state = {
          status: 'success',
          artwork: {
            title: pick.title,
            artist_display: pick.artist_display,
            imageUrl: `${IIIF_BASE}/${pick.image_id}/full/843,/0/default.jpg`,
          },
        };
        return;
      } catch {
        // silent — try next offset
      }
    }

    state = { status: 'error', message: 'Could not load today\u2019s artwork.' };
  }

  onMount(resolve);
</script>

<div class="mm-wrap">
  <!-- Image frame: 4:3 during loading (shimmer needs height), natural size after -->
  <div class="mm-frame" class:mm-frame-loading={!imageLoaded && state.status !== 'error'}>
    <!--
      Shimmer: shown during API fetch AND while the image hasn't loaded yet.
      out:fade keeps it visible while the image CSS-transitions in — no blank gap.
    -->
    {#if state.status === 'loading' || (state.status === 'success' && !imageLoaded)}
      <div class="mm-shimmer placeholder" out:fade={{ duration: 400 }}></div>
    {/if}

    <!-- Error fills the same slot -->
    {#if state.status === 'error'}
      <div class="mm-error placeholder" in:fade={{ duration: 300 }}>
        <p>{state.message}</p>
      </div>
    {/if}

    <!--
      Image is inserted into the DOM as soon as we have a URL (opacity 0),
      so the browser starts fetching it immediately. The CSS transition fires
      when mm-img-loaded is set on the load event.
    -->
    {#if state.status === 'success'}
      <!--
        In normal flow (not absolute) so the frame adopts the image's natural
        height once loaded. Opacity starts at 0 so dimensions are reserved
        before the image is visible — shimmer sits on top via absolute.
      -->
      <img
        src={state.artwork.imageUrl}
        alt={`${state.artwork.title} — ${state.artwork.artist_display}`}
        class="mm-img"
        class:mm-img-loaded={imageLoaded}
        onload={() => (imageLoaded = true)}
      />
    {/if}
  </div>

  <!--
    Metadata area: fixed height via min-height + absolute children so
    neither the placeholder→text swap nor the fade-in shifts the page.
  -->
  <div class="mm-meta">
    {#if state.status === 'loading' || (state.status === 'success' && !imageLoaded)}
      <div class="mm-meta-content">
        <div class="placeholder mm-line-title"></div>
        <div class="placeholder mm-line-artist"></div>
      </div>
    {/if}

    {#if imageLoaded && state.status === 'success'}
      <!-- delay: 100ms → starts after image fade has had a moment to reveal -->
      <div class="mm-meta-content" in:fade={{ delay: 100, duration: 300 }}>
        <p class="mm-title">{state.artwork.title}</p>
        <p class="mm-artist">{state.artwork.artist_display}</p>
      </div>
    {/if}
  </div>
</div>

<style>
  /* ── Wrapper ─────────────────────────────────────────────────────────────── */
  .mm-wrap {
    width: 100%;
    max-width: 640px;
    margin-inline: auto;
  }

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

  /* ── Metadata area — fixed height prevents layout shift during swap ───────── */
  .mm-meta {
    position: relative;
    /* Enough for title (~1.625rem) + gap (0.5rem) + artist (~1.3rem) + breathing room */
    min-height: 4.5rem;
    margin-top: 1.25rem;
    padding-inline: 0.25rem;
  }

  /* Both placeholder block and real text are absolutely stacked — zero shift */
  .mm-meta-content {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* ── Text ────────────────────────────────────────────────────────────────── */
  .mm-title {
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .mm-artist {
    font-size: 0.875rem;
    color: var(--color-surface-500);
    line-height: 1.5;
  }

  /* ── Placeholder lines ───────────────────────────────────────────────────── */
  .mm-line-title {
    height: 1.5rem;
    width: 70%;
  }

  .mm-line-artist {
    height: 1rem;
    width: 45%;
  }
</style>
