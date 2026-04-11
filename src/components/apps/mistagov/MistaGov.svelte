<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import { SvelteMap } from 'svelte/reactivity';

  interface Deputy {
    id: string;
    name: string;
    party: string;
    groupSince: string | null; // "DD.MM.YYYY"
    groupUntil: string | null; // "DD.MM.YYYY" | null = still current
    absences: number | null; // null = batch not yet arrived
    attendanceRate: number | null; // null = batch not yet arrived
  }

  type AppState = 'idle' | 'loading' | 'ready' | 'error';
  type AbsencesState = 'idle' | 'loading' | 'ready' | 'error';
  type SortKey = 'name' | 'absences-desc' | 'absences-asc';

  const SPARQL = 'https://dati.camera.it/sparql';
  const BATCH_SIZE = 25;
  const LEG_URI = 'http://dati.camera.it/ocd/legislatura.rdf/repubblica_19';
  const ALL_GROUPS_VALUE = '__all__';

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

  // Count of DISTINCT electronic votazioni for the whole legislature.
  // The store has duplicate triples — COUNT(*) returns 2× the real number;
  // COUNT(DISTINCT) returns the correct figure (~17 257 for XIX).
  const TOTAL_VOTAZIONI_QUERY = `
PREFIX ocd: <http://dati.camera.it/ocd/>
SELECT (COUNT(DISTINCT ?vot) AS ?n) WHERE {
  ?vot a ocd:votazione ;
       ocd:rif_leg <${LEG_URI}> .
}
`.trim();

  // Absence batch query — joins through rif_votazione to ocd:votazione to ensure
  // we count only actual electronic votazioni (not generic acts).
  // DISTINCT deduplicates the doubled triples in the store.
  function absencesBatchQuery(uris: string[]): string {
    const values = uris.map((u) => `<${u}>`).join('\n    ');
    return `PREFIX ocd: <http://dati.camera.it/ocd/>
PREFIX dc: <http://purl.org/dc/elements/1.1/>
SELECT ?persona (COUNT(DISTINCT ?votazione) AS ?absences) WHERE {
  VALUES ?persona { ${values} }
  ?voto a ocd:voto ;
        ocd:rif_deputato ?persona ;
        ocd:rif_votazione ?votazione ;
        dc:type "Non ha votato" .
  ?votazione a ocd:votazione .
}
GROUP BY ?persona`;
  }

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
      // label = "MARIO ROSSI, XIX Legislatura della Repubblica" — strip legislature suffix
      const name = row.label.value.split(',')[0].trim();
      const candidate: Deputy = {
        id: uri,
        name,
        party,
        groupSince: since,
        groupUntil: until,
        absences: null,
        attendanceRate: null,
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

  // ── State ──────────────────────────────────────────────────────────────────

  let deputies = $state<Deputy[]>([]);
  let totalVotazioni = $state<number>(0);
  let appState = $state<AppState>('idle');
  let absencesState = $state<AbsencesState>('idle');
  let errorMessage = $state<string | null>(null);
  let firstBatchDone = $state(false); // enables the Absences sort button

  let search = $state('');
  let selectedParty = $state('');
  let partyFilter = $state('');
  let sort = $state<SortKey>('name');

  // ── Derived ────────────────────────────────────────────────────────────────

  const parties = $derived(
    [...new Set(deputies.map((d) => d.party))].sort((a, b) => a.localeCompare(b)),
  );

  const partyItems = $derived(() => {
    const lower = partyFilter.toLowerCase();
    const items = [
      { label: `All groups (${deputies.length})`, value: ALL_GROUPS_VALUE },
      ...parties.map((party) => ({ label: party, value: party })),
    ];
    return partyFilter ? items.filter((item) => item.label.toLowerCase().includes(lower)) : items;
  });

  const partyCollection = $derived(collection({ items: partyItems() }));

  const displayed = $derived(() => {
    const q = search.trim().toLowerCase();
    let list = deputies.filter(
      (d) =>
        (!q || d.name.toLowerCase().includes(q)) && (!selectedParty || d.party === selectedParty),
    );
    if (sort === 'absences-desc')
      list = [...list].sort((a, b) => (b.absences ?? -1) - (a.absences ?? -1));
    if (sort === 'absences-asc')
      list = [...list].sort((a, b) => (a.absences ?? Infinity) - (b.absences ?? Infinity));
    return list;
  });

  const totalAbsencesShown = $derived(displayed().reduce((s, d) => s + (d.absences ?? 0), 0));

  // ── Fetch ──────────────────────────────────────────────────────────────────

  async function fetchTotalVotazioni(): Promise<void> {
    try {
      const json = (await sparqlGet(TOTAL_VOTAZIONI_QUERY)) as {
        results: { bindings: [{ n: { value: string } }] };
      };
      totalVotazioni = Number(json.results.bindings[0].n.value);
    } catch (e) {
      console.warn('[mistagov] could not fetch total votazioni:', e);
    }
  }

  async function fetchAbsencesBatch(uris: string[]): Promise<SvelteMap<string, number>> {
    const json = (await sparqlGet(absencesBatchQuery(uris))) as {
      results: { bindings: Array<Record<string, { value: string }>> };
    };
    const map = new SvelteMap<string, number>();
    for (const row of json.results.bindings) map.set(row.persona.value, Number(row.absences.value));
    return map;
  }

  async function fetchAllAbsences(list: Deputy[]): Promise<void> {
    absencesState = 'loading';
    firstBatchDone = false;
    try {
      const batches: string[][] = [];
      for (let i = 0; i < list.length; i += BATCH_SIZE) {
        batches.push(list.slice(i, i + BATCH_SIZE).map((d) => d.id));
      }

      // Fire all batches in parallel; update deputies as each settles
      const settled = await Promise.allSettled(
        batches.map(async (batch) => {
          const map = await fetchAbsencesBatch(batch);
          // Patch the deputies array in place for this batch
          deputies = deputies.map((d) => {
            if (!map.has(d.id)) return d;
            const absences = map.get(d.id)!;
            const attendanceRate =
              totalVotazioni > 0 ? ((totalVotazioni - absences) / totalVotazioni) * 100 : null;
            return { ...d, absences, attendanceRate };
          });
          // Also zero out deputies in this batch that had no absences record
          deputies = deputies.map((d) => {
            if (!batch.includes(d.id) || d.absences !== null) return d;
            const attendanceRate = totalVotazioni > 0 ? 100 : null;
            return { ...d, absences: 0, attendanceRate };
          });
          firstBatchDone = true;
        }),
      );

      const failed = settled.filter((r) => r.status === 'rejected').length;
      if (failed > 0) console.warn(`[mistagov] ${failed}/${batches.length} absence batches failed`);
      absencesState = 'ready';
    } catch (e) {
      console.error('[mistagov] absences error:', e);
      absencesState = 'error';
    }
  }

  async function load(): Promise<void> {
    appState = 'loading';
    absencesState = 'idle';
    errorMessage = null;
    deputies = [];
    firstBatchDone = false;

    try {
      const [json] = await Promise.all([sparqlGet(DEPUTIES_QUERY), fetchTotalVotazioni()]);
      deputies = parseDeputies(json);
      appState = 'ready';
      fetchAllAbsences(deputies); // fire-and-forget; batches patch state as they arrive
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error('[mistagov] error:', errorMessage);
      appState = 'error';
    }
  }

  $effect(() => {
    load();
  });

  function toggleAbsencesSort(): void {
    sort = sort === 'absences-desc' ? 'absences-asc' : 'absences-desc';
  }

  export function reload(): void {
    load();
  }
</script>

<div class="mx-auto w-full max-w-5xl">
  <!-- ── Toolbar ────────────────────────────────────────────────────────────── -->
  <div class="card preset-filled-surface-100-900 border-surface-200-800 mb-4 space-y-4 border p-4">
    <div class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,20rem)]">
      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Search</span>
        <input
          class="input w-full min-w-0"
          type="search"
          placeholder="Search deputy..."
          bind:value={search}
          disabled={appState !== 'ready'}
        />
      </label>
      <div class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Group</span>
        {#key `${appState}-${deputies.length}-${selectedParty}`}
          <Combobox
            collection={partyCollection}
            defaultValue={[selectedParty || ALL_GROUPS_VALUE]}
            defaultInputValue={selectedParty || `All groups (${deputies.length})`}
            disabled={appState !== 'ready'}
            onInputValueChange={(d) => {
              partyFilter = d.inputValue;
            }}
            onValueChange={(d) => {
              const picked = d.value[0] ?? ALL_GROUPS_VALUE;
              selectedParty = picked === ALL_GROUPS_VALUE ? '' : picked;
              partyFilter = '';
            }}
            openOnClick
          >
            <Combobox.Control>
              <Combobox.Input class="input w-full min-w-0 truncate" placeholder="All groups" />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-64 w-full overflow-y-auto border"
              >
                {#each partyCollection.items as item (item.value)}
                  <Combobox.Item
                    {item}
                    class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal {item.value ===
                    (selectedParty || ALL_GROUPS_VALUE)
                      ? 'preset-tonal-primary'
                      : ''}"
                  >
                    <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  </Combobox.Item>
                {/each}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}
      </div>
    </div>

    <div class="flex flex-wrap gap-2 text-xs">
      {#if appState === 'ready'}
        <span class="badge preset-outlined">
          {displayed().length} / {deputies.length} deputies
        </span>
        <span class="badge preset-outlined">
          {parties.length} groups
        </span>
        {#if totalVotazioni > 0}
          <span class="badge preset-outlined">
            {totalVotazioni.toLocaleString('en')} votes
          </span>
        {/if}
        {#if absencesState === 'loading'}
          <span class="badge preset-tonal-warning">loading absences</span>
        {:else if absencesState === 'ready'}
          <span class="badge preset-tonal-success">absences ready</span>
        {:else if absencesState === 'error'}
          <span class="badge preset-tonal-error">absences partial</span>
        {/if}
        {#if sort !== 'name' && absencesState === 'ready'}
          <span class="badge preset-outlined">
            {totalAbsencesShown.toLocaleString('en')} absences shown
          </span>
        {/if}
      {:else}
        <span class="badge preset-outlined">loading deputies</span>
      {/if}
    </div>
  </div>

  <!-- ── Error ──────────────────────────────────────────────────────────────── -->
  {#if appState === 'error'}
    <aside class="card preset-tonal-error flex flex-col gap-1 p-5">
      <p class="font-semibold">Could not load deputies</p>
      <p class="text-sm opacity-80">{errorMessage}</p>
      <button class="btn preset-outlined mt-3 text-sm" onclick={reload}>Retry</button>
    </aside>

    <!-- ── Table ──────────────────────────────────────────────────────────────── -->
  {:else}
    <div
      class="card preset-filled-surface-100-900 border-surface-200-800 w-full overflow-x-auto border"
    >
      <table class="w-full border-collapse whitespace-nowrap text-sm">
        <thead class="sticky top-0 z-10">
          <tr class="bg-surface-100-900 border-surface-200-800 border-b">
            <!-- Name — sortable -->
            <th class="min-w-56 px-3 py-2 text-left">
              <button
                class="flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase tracking-wide"
                onclick={() => (sort = 'name')}
                aria-sort={sort === 'name' ? 'ascending' : 'none'}
              >
                Name / Group
                <span class={sort === 'name' ? 'opacity-100' : 'opacity-30'}>↑</span>
              </button>
            </th>
            <th class="w-28 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
              >Since</th
            >
            <th class="w-28 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide"
              >Until</th
            >

            <!-- Missed — sortable -->
            <th class="w-24 px-3 py-2 text-right">
              <button
                class="flex w-full cursor-pointer items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide disabled:cursor-default disabled:opacity-40"
                onclick={toggleAbsencesSort}
                disabled={!firstBatchDone}
                title={!firstBatchDone ? 'Loading absences…' : undefined}
                aria-sort={sort === 'absences-desc'
                  ? 'descending'
                  : sort === 'absences-asc'
                    ? 'ascending'
                    : 'none'}
              >
                {#if absencesState === 'loading' && !firstBatchDone}
                  <svg
                    class="animate-spin size-3"
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
                {:else}
                  <span class={sort !== 'name' ? 'opacity-100' : 'opacity-30'}>
                    {sort === 'absences-asc' ? '↑' : '↓'}
                  </span>
                {/if}
                Missed
              </button>
            </th>

            <th class="w-20 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide"
              >Att.%</th
            >
          </tr>
        </thead>

        <tbody>
          <!-- Loading skeleton -->
          {#if appState === 'idle' || appState === 'loading'}
            {#each Array.from({ length: 18 }, (_, i) => i) as i (i)}
              <tr class="border-surface-200-800 border-b last:border-b-0">
                <td class="px-3 py-2">
                  <div class="placeholder mb-1.5 h-3" style="width:{58 - i * 2}%"></div>
                  <div class="placeholder h-4 w-2/3 rounded-base"></div>
                </td>
                <td class="px-3 py-2"><div class="placeholder h-2.5 w-20"></div></td>
                <td class="px-3 py-2"><div class="placeholder h-2.5 w-16"></div></td>
                <td class="px-3 py-2"><div class="placeholder ml-auto h-2.5 w-10"></div></td>
                <td class="px-3 py-2"><div class="placeholder ml-auto h-2.5 w-8"></div></td>
              </tr>
            {/each}

            <!-- Empty state -->
          {:else if displayed().length === 0}
            <tr>
              <td colspan="5" class="px-3 py-12 text-center text-sm opacity-50"
                >No deputies found.</td
              >
            </tr>

            <!-- Data rows -->
          {:else}
            {#each displayed() as dep (dep.id)}
              <tr
                class="border-surface-200-800 hover:bg-surface-200-800/30 border-b last:border-b-0"
              >
                <td class="px-3 py-2 whitespace-normal">
                  <p class="font-medium">{dep.name}</p>
                  <span class="badge preset-tonal-surface mt-1 text-[0.62rem]">{dep.party}</span>
                </td>
                <td class="px-3 py-2 text-xs tabular-nums opacity-50">{dep.groupSince ?? '—'}</td>
                <td class="px-3 py-2 text-xs tabular-nums opacity-50"
                  >{dep.groupUntil ?? 'present'}</td
                >
                <td
                  class="px-3 py-2 text-right tabular-nums {dep.absences === null
                    ? 'opacity-20'
                    : 'opacity-75'}"
                >
                  {dep.absences === null ? '·' : dep.absences.toLocaleString('en')}
                </td>
                <td
                  class="px-3 py-2 text-right tabular-nums {dep.attendanceRate === null
                    ? 'opacity-20'
                    : 'opacity-75'}"
                >
                  {dep.attendanceRate === null ? '·' : dep.attendanceRate.toFixed(1) + '%'}
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  {/if}
</div>
