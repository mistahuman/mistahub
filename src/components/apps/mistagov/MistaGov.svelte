<script lang="ts">
  import { SvelteMap } from 'svelte/reactivity';

  interface Deputy {
    id: string;
    name: string;
    party: string;
    groupSince: string | null; // "DD.MM.YYYY"
    groupUntil: string | null; // "DD.MM.YYYY" | null = still current
    absences: number | null; // null = not yet loaded
  }

  type AppState = 'idle' | 'loading' | 'ready' | 'error';
  type AbsencesState = 'idle' | 'loading' | 'ready' | 'error';
  type SortKey = 'name' | 'absences';

  const SPARQL = 'https://dati.camera.it/sparql';
  const BATCH_SIZE = 25;

  // Filter to XIX legislature only — URIs end in "_19".
  // Without this the endpoint returns all deputies since 1946 (~10 000 rows).
  const DEPUTIES_QUERY = `
PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?persona ?label ?gruppo ?gruppoLabel WHERE {
  ?persona a ocd:deputato ;
           rdfs:label ?label ;
           ocd:aderisce ?gruppo .
  ?gruppo rdfs:label ?gruppoLabel .
  FILTER(STRENDS(STR(?persona), "_19"))
}
ORDER BY ?label
`.trim();

  // gruppoLabel embeds dates: "MISTO (09.01.2023)" or "AVS (27.10.2022-09.01.2023)"
  const DATE_RE = /^(.+?)\s*\((\d{2}\.\d{2}\.\d{4})(?:-(\d{2}\.\d{2}\.\d{4}))?\)$/;

  function parseGroupLabel(raw: string): {
    party: string;
    since: string | null;
    until: string | null;
  } {
    const m = DATE_RE.exec(raw);
    if (!m) return { party: raw.trim(), since: null, until: null };
    return { party: m[1].trim(), since: m[2], until: m[3] ?? null };
  }

  function ddmmyyyyToTs(d: string): number {
    const [dd, mm, yyyy] = d.split('.');
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd));
  }

  function parseDeputies(json: unknown): Deputy[] {
    const data = json as {
      results: { bindings: Array<Record<string, { value: string }>> };
    };

    // A deputy appears multiple times when switching group during the legislature.
    // Keep the entry with the latest groupSince (= current group).
    const byId = new SvelteMap<string, Deputy>();

    for (const row of data.results.bindings) {
      const uri = row.persona.value;
      const { party, since, until } = parseGroupLabel(row.gruppoLabel.value);

      const candidate: Deputy = {
        id: uri,
        name: row.label.value,
        party,
        groupSince: since,
        groupUntil: until,
        absences: null,
      };

      const existing = byId.get(uri);
      if (!existing) {
        byId.set(uri, candidate);
        continue;
      }

      const existingTs = existing.groupSince ? ddmmyyyyToTs(existing.groupSince) : 0;
      const candidateTs = since ? ddmmyyyyToTs(since) : 0;
      if (candidateTs > existingTs) byId.set(uri, candidate);
    }

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async function sparqlGet(query: string): Promise<unknown> {
    const url = new URL(SPARQL);
    url.searchParams.set('query', query);
    url.searchParams.set('format', 'json');
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/sparql-results+json' },
    });
    if (!res.ok) throw new Error(`SPARQL ${res.status} ${res.statusText}`);
    return res.json();
  }

  async function fetchAbsencesBatch(uris: string[]): Promise<SvelteMap<string, number>> {
    const values = uris.map((u) => `<${u}>`).join('\n    ');
    const query = `PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT ?persona (COUNT(?voto) AS ?absences) WHERE {
  VALUES ?persona { ${values} }
  ?voto a ocd:voto ;
        ocd:rif_deputato ?persona ;
        dc:type "Non ha votato" .
}
GROUP BY ?persona`;

    const json = (await sparqlGet(query)) as {
      results: { bindings: Array<Record<string, { value: string }>> };
    };
    const map = new SvelteMap<string, number>();
    for (const row of json.results.bindings) map.set(row.persona.value, Number(row.absences.value));
    return map;
  }

  async function fetchAllAbsences(list: Deputy[]): Promise<void> {
    absencesState = 'loading';
    try {
      const batches: string[][] = [];
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        batches.push(list.slice(i, i + BATCH_SIZE).map((d) => d.id));
      }

      const maps = await Promise.all(batches.map((b) => fetchAbsencesBatch(b)));
      const merged = new SvelteMap<string, number>();
      for (const m of maps) for (const [k, v] of m) merged.set(k, v);

      deputies = deputies.map((d) => ({ ...d, absences: merged.get(d.id) ?? 0 }));
      console.log('[mistagov] absences ready');
      absencesState = 'ready';
    } catch (e) {
      console.error('[mistagov] absences error:', e);
      absencesState = 'error';
    }
  }

  let deputies = $state<Deputy[]>([]);
  let appState = $state<AppState>('idle');
  let absencesState = $state<AbsencesState>('idle');
  let errorMessage = $state<string | null>(null);
  let search = $state('');
  let selectedParty = $state('');
  let sort = $state<SortKey>('name');

  const parties = $derived(
    [...new Set(deputies.map((d) => d.party))].sort((a, b) => a.localeCompare(b)),
  );

  const displayed = $derived(() => {
    const q = search.trim().toLowerCase();
    let list = deputies.filter((d) => {
      return (
        (!q || d.name.toLowerCase().includes(q)) && (!selectedParty || d.party === selectedParty)
      );
    });
    if (sort === 'absences') {
      list = [...list].sort((a, b) => (b.absences ?? -1) - (a.absences ?? -1));
    }
    return list;
  });

  const totalAbsences = $derived(deputies.reduce((sum, d) => sum + (d.absences ?? 0), 0));

  async function load(): Promise<void> {
    appState = 'loading';
    absencesState = 'idle';
    errorMessage = null;
    deputies = [];

    try {
      const json = await sparqlGet(DEPUTIES_QUERY);
      deputies = parseDeputies(json);
      console.log('[mistagov] deputies ready —', deputies.length, $state.snapshot(deputies));
      appState = 'ready';
      fetchAllAbsences(deputies);
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error('[mistagov] error:', errorMessage);
      appState = 'error';
    }
  }

  $effect(() => {
    load();
  });

  export function reload(): void {
    load();
  }
</script>

<div class="mg-wrap">
  <!-- ── Controls ────────────────────────────────────────────────────────────── -->
  {#if appState === 'ready'}
    <div class="mg-controls">
      <input
        class="input mg-search"
        type="search"
        placeholder="Search deputy…"
        bind:value={search}
      />
      <select class="select mg-select" bind:value={selectedParty}>
        <option value="">All groups ({deputies.length})</option>
        {#each parties as p (p)}
          <option value={p}>{p}</option>
        {/each}
      </select>
    </div>

    <div class="mg-toolbar">
      <span class="mg-count">{displayed().length} / {deputies.length} deputies</span>
      <div class="mg-sort">
        <span class="mg-sort-label">Sort:</span>
        <button
          class="btn btn-sm {sort === 'name' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
          onclick={() => (sort = 'name')}
        >
          Name
        </button>
        <button
          class="btn btn-sm {sort === 'absences' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
          disabled={absencesState !== 'ready'}
          onclick={() => (sort = 'absences')}
          title={absencesState !== 'ready' ? 'Loading absences…' : undefined}
        >
          {#if absencesState === 'loading'}
            <svg
              class="animate-spin size-3 mr-1"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              ></path>
            </svg>
          {/if}
          Absences ↓
        </button>
      </div>
    </div>

    {#if absencesState === 'ready' && sort === 'absences'}
      <p class="mg-count mg-absences-total">
        Total absences in dataset: {totalAbsences.toLocaleString('en')}
      </p>
    {/if}
  {/if}

  <!-- ── States ──────────────────────────────────────────────────────────────── -->
  {#if appState === 'idle' || appState === 'loading'}
    <ul class="mg-list">
      {#each Array.from({ length: 14 }, (_unused, i) => i) as i (i)}
        <li class="mg-row card preset-filled-surface-100-900 border-surface-200-800 border-[1px]">
          <div class="placeholder" style="width:{68 - i}%; height:.875rem;"></div>
          <div
            class="placeholder"
            style="width:{28 - (i % 5)}%; height:1.25rem; border-radius:var(--radius-base);"
          ></div>
          <div class="placeholder" style="width:5rem; height:.7rem;"></div>
        </li>
      {/each}
    </ul>
  {:else if appState === 'error'}
    <aside class="card preset-tonal-warning mg-error-aside">
      <p class="font-semibold">Could not load deputies</p>
      <p class="text-sm opacity-80">{errorMessage}</p>
      <button class="btn preset-outlined mt-3 text-sm" onclick={reload}>Retry</button>
    </aside>
  {:else if displayed().length === 0}
    <p class="mg-empty">No deputies found.</p>
  {:else}
    <ul class="mg-list">
      {#each displayed() as dep, i (dep.id)}
        <li class="mg-row card preset-filled-surface-100-900 border-surface-200-800 border-[1px]">
          <!-- rank only when sorted by absences -->
          {#if sort === 'absences'}
            <span class="mg-rank">#{i + 1}</span>
          {/if}

          <span class="mg-name">{dep.name}</span>

          <span class="badge preset-tonal-primary mg-badge" title={dep.party}>{dep.party}</span>

          <!-- date range -->
          <span class="mg-date">
            {#if dep.groupSince && dep.groupUntil}
              {dep.groupSince} – {dep.groupUntil}
            {:else if dep.groupSince}
              since {dep.groupSince}
            {/if}
          </span>

          <!-- absences -->
          <span class="mg-abs" class:mg-abs-loading={dep.absences === null}>
            {#if dep.absences === null}
              {#if absencesState === 'error'}
                —
              {:else}
                ·
              {/if}
            {:else}
              {dep.absences.toLocaleString('en')} missed
            {/if}
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .mg-wrap {
    width: 100%;
    max-width: 56rem;
    margin-inline: auto;
  }

  /* ── Controls ────────────────────────────────────────────────────────────── */
  .mg-controls {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 0.5rem;
  }
  .mg-search {
    flex: 1 1 14rem;
    min-width: 0;
  }
  .mg-select {
    flex: 0 1 22rem;
    min-width: 0;
  }

  .mg-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .mg-sort {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }
  .mg-sort-label {
    font-size: 0.75rem;
    opacity: 0.55;
  }

  .mg-count {
    font-size: 0.75rem;
    opacity: 0.55;
  }
  .mg-absences-total {
    margin-bottom: 0.5rem;
  }

  /* ── List ────────────────────────────────────────────────────────────────── */
  .mg-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    list-style: none;
    padding: 0;
  }

  .mg-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    padding: 0.45rem 0.875rem;
  }

  .mg-rank {
    font-size: 0.7rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.45;
    width: 2rem;
    flex-shrink: 0;
    text-align: right;
  }

  .mg-name {
    flex: 1 1 12rem;
    font-size: 0.875rem;
    font-weight: 500;
    min-width: 0;
  }

  .mg-badge {
    font-size: 0.65rem;
    white-space: nowrap;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 0;
  }

  .mg-date {
    font-size: 0.7rem;
    opacity: 0.5;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .mg-abs {
    margin-left: auto;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    flex-shrink: 0;
    opacity: 0.7;
  }
  .mg-abs-loading {
    opacity: 0.3;
  }

  /* ── States ──────────────────────────────────────────────────────────────── */
  .mg-error-aside {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .mg-empty {
    font-size: 0.875rem;
    opacity: 0.6;
    padding: 2rem 0;
    text-align: center;
  }
</style>
