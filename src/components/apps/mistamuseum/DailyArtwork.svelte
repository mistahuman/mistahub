<script lang="ts">
  import { onMount } from 'svelte';

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

{#if state.status === 'loading'}
  <p>Loading…</p>
{:else if state.status === 'error'}
  <p>{state.message}</p>
{:else}
  <img src={state.artwork.imageUrl} alt={state.artwork.title} />
  <p>{state.artwork.title}</p>
  <p>{state.artwork.artist_display}</p>
{/if}
