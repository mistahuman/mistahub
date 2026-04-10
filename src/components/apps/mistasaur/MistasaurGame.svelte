<script lang="ts">
  import { onMount } from 'svelte';
  import TaxonCard from './TaxonCard.svelte';

  // ── Types ──────────────────────────────────────────────────────────────────
  export type Period = 'Triassic' | 'Jurassic' | 'Cretaceous' | 'Paleogene';

  type Taxon = {
    title: string;
    period: Period | null;
    thumbUrl: string | null;
    extract: string;
  };

  type AppState =
    | { status: 'loading' }
    | { status: 'success' }
    | { status: 'error'; message: string };

  // ── State ──────────────────────────────────────────────────────────────────
  let allTaxa = $state<Taxon[]>([]);
  let appState = $state<AppState>({ status: 'loading' });
  let filterPeriod = $state<Period | 'all'>('all');

  // ── Derived ───────────────────────────────────────────────────────────────
  let filtered = $derived.by(() => {
    if (filterPeriod === 'all') return allTaxa;
    return allTaxa.filter((t) => t.period === filterPeriod);
  });

  type ViewStatus = 'loading' | 'results' | 'error' | 'empty';
  let viewStatus = $derived.by((): ViewStatus => {
    if (appState.status === 'loading') return 'loading';
    if (appState.status === 'error') return 'error';
    return filtered.length > 0 ? 'results' : 'empty';
  });

  // ── Period extraction from Wikipedia extract text ─────────────────────────
  function extractPeriod(text: string): Period | null {
    if (/cretaceous/i.test(text)) return 'Cretaceous';
    if (/jurassic/i.test(text)) return 'Jurassic';
    if (/triassic/i.test(text)) return 'Triassic';
    if (/paleogene|paleocene|eocene|oligocene/i.test(text)) return 'Paleogene';
    return null;
  }

  // ── Wikipedia batch fetch ─────────────────────────────────────────────────
  // Single request: category members + thumbnails + extracts in one shot.
  // cmsort=timestamp&cmdir=desc → recently-edited pages = more notable genera
  const WIKI_URL =
    'https://en.wikipedia.org/w/api.php' +
    '?action=query' +
    '&generator=categorymembers' +
    '&gcmtitle=Category:Dinosaur_genera' +
    '&gcmlimit=60' +
    '&gcmnamespace=0' +
    '&gcmsort=timestamp&gcmdir=desc' +
    '&prop=pageimages|extracts' +
    '&exintro=true&exsentences=2&explaintext=true' +
    '&piprop=thumbnail&pithumbsize=400' +
    '&format=json&origin=*';

  interface WikiPage {
    pageid: number;
    title: string;
    thumbnail?: { source: string };
    extract?: string;
  }

  interface WikiResponse {
    query?: { pages?: Record<string, WikiPage> };
  }

  async function load(): Promise<void> {
    appState = { status: 'loading' };
    try {
      const res = await fetch(WIKI_URL);
      if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`);
      const json: WikiResponse = await res.json();

      const pages = Object.values(json.query?.pages ?? {});
      const taxa: Taxon[] = pages
        .filter((p) => p.title && p.pageid > 0)
        .map((p) => ({
          title: p.title,
          period: extractPeriod(p.extract ?? ''),
          thumbUrl: p.thumbnail?.source ?? null,
          extract: p.extract ?? '',
        }));

      allTaxa = taxa;
      appState = { status: 'success' };
    } catch (e) {
      appState = { status: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }

  onMount(load);

  const PERIODS: (Period | 'all')[] = ['all', 'Triassic', 'Jurassic', 'Cretaceous', 'Paleogene'];
</script>

<div class="ms-wrap">
  <!-- Period filter — only shown once data is ready -->
  {#if viewStatus === 'results' || viewStatus === 'empty'}
    <div class="ms-filters">
      {#each PERIODS as p (p)}
        <button
          type="button"
          class="btn btn-sm"
          class:preset-filled={filterPeriod === p}
          class:preset-tonal={filterPeriod !== p}
          onclick={() => (filterPeriod = p)}
        >
          {p === 'all' ? 'All' : p}
        </button>
      {/each}
    </div>
  {/if}

  {#if viewStatus === 'loading'}
    <div class="ms-center">
      <p>Loading taxa…</p>
    </div>
  {:else if viewStatus === 'error'}
    <div class="ms-center">
      {#if appState.status === 'error'}
        <p class="ms-error-msg">{appState.message}</p>
      {/if}
      <button type="button" class="btn preset-filled" onclick={load}>Retry</button>
    </div>
  {:else if viewStatus === 'empty'}
    <div class="ms-center">
      <p>No genera found for the {filterPeriod} period.</p>
      <button type="button" class="btn btn-sm preset-tonal" onclick={() => (filterPeriod = 'all')}>
        Clear filter
      </button>
    </div>
  {:else}
    <p class="ms-count">{filtered.length} genera</p>
    <div class="ms-grid">
      {#each filtered as t (t.title)}
        <TaxonCard title={t.title} period={t.period} thumbUrl={t.thumbUrl} extract={t.extract} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .ms-wrap {
    width: 100%;
    max-width: 960px;
    margin-inline: auto;
  }

  .ms-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }

  .ms-count {
    font-size: 0.8rem;
    color: var(--color-surface-500);
    margin-bottom: 0.75rem;
  }

  .ms-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 3rem 0;
    font-size: 0.875rem;
    color: var(--color-surface-500);
    text-align: center;
  }

  .ms-error-msg {
    color: var(--color-error-500, #e53e3e);
  }

  .ms-grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  }
</style>
