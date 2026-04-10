<script lang="ts">
  import { onMount } from 'svelte';

  type LoadState = 'loading' | 'ready' | 'error';

  interface Station {
    id: string;
    manager: string;
    brand: string;
    type: string;
    name: string;
    address: string;
    city: string;
    province: string;
    lat: string;
    lng: string;
  }

  interface FuelPrice {
    stationId: string;
    fuel: string;
    price: number;
    isSelf: boolean;
    updatedAt: string;
  }

  interface FuelResult {
    station: Station;
    price: FuelPrice;
  }

  interface CachedPayload {
    fetchedAt: string;
    extractionDate: string;
    stations: Station[];
    prices: FuelPrice[];
  }

  const PRICES_URL = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
  const STATIONS_URL = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';
  const CACHE_KEY = 'mistafuel-daily-data';
  const MAX_RESULTS = 12;

  let loadState = $state<LoadState>('loading');
  let errorMessage = $state('');
  let extractionDate = $state('');
  let stations = $state<Station[]>([]);
  let prices = $state<FuelPrice[]>([]);

  let selectedFuel = $state('');
  let selectedProvince = $state('');
  let selectedCity = $state('');
  let selectedMode = $state<'all' | 'self' | 'served'>('self');
  let brandQuery = $state('');

  const stationById = $derived(new Map(stations.map((station) => [station.id, station])));

  const fuels = $derived(
    [...new Set(prices.map((price) => price.fuel))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  );

  const provinces = $derived(
    [...new Set(stations.map((station) => station.province))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  );

  const cities = $derived(
    [
      ...new Set(
        stations
          .filter((station) => !selectedProvince || station.province === selectedProvince)
          .map((station) => station.city),
      ),
    ]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  );

  const results = $derived(() => {
    const brand = brandQuery.trim().toLowerCase();
    const rows: FuelResult[] = [];

    for (const price of prices) {
      if (selectedFuel && price.fuel !== selectedFuel) continue;
      if (selectedMode === 'self' && !price.isSelf) continue;
      if (selectedMode === 'served' && price.isSelf) continue;

      const station = stationById.get(price.stationId);
      if (!station) continue;
      if (selectedProvince && station.province !== selectedProvince) continue;
      if (selectedCity && station.city !== selectedCity) continue;
      if (
        brand &&
        !station.brand.toLowerCase().includes(brand) &&
        !station.name.toLowerCase().includes(brand) &&
        !station.manager.toLowerCase().includes(brand)
      ) {
        continue;
      }

      rows.push({ station, price });
    }

    return rows.sort((a, b) => a.price.price - b.price.price).slice(0, MAX_RESULTS);
  });

  function parseCsv(text: string): string[][] {
    const lines = text
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const rows: string[][] = [];
    for (const line of lines) {
      if (line.startsWith('Estrazione del')) {
        extractionDate = line.replace('Estrazione del', '').trim();
        continue;
      }
      const delimiter = line.includes('|') ? '|' : line.includes(';') ? ';' : ',';
      rows.push(line.split(delimiter).map((cell) => cell.trim()));
    }
    return rows;
  }

  function rowValue(headers: string[], row: string[], name: string): string {
    const index = headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
    return index >= 0 ? (row[index] ?? '') : '';
  }

  function parseStations(text: string): Station[] {
    const rows = parseCsv(text);
    const headers = rows[0] ?? [];
    return rows.slice(1).map((row) => ({
      id: rowValue(headers, row, 'idImpianto'),
      manager: rowValue(headers, row, 'Gestore'),
      brand: rowValue(headers, row, 'Bandiera') || 'Pompa bianca',
      type: rowValue(headers, row, 'Tipo Impianto'),
      name: rowValue(headers, row, 'Nome Impianto'),
      address: rowValue(headers, row, 'Indirizzo'),
      city: rowValue(headers, row, 'Comune'),
      province: rowValue(headers, row, 'Provincia'),
      lat: rowValue(headers, row, 'Latitudine'),
      lng: rowValue(headers, row, 'Longitudine'),
    }));
  }

  function parsePrices(text: string): FuelPrice[] {
    const rows = parseCsv(text);
    const headers = rows[0] ?? [];
    return rows
      .slice(1)
      .map((row) => {
        const rawPrice = rowValue(headers, row, 'prezzo').replace(',', '.');
        return {
          stationId: rowValue(headers, row, 'idImpianto'),
          fuel: rowValue(headers, row, 'descCarburante'),
          price: Number(rawPrice),
          isSelf: rowValue(headers, row, 'isSelf') === '1',
          updatedAt: rowValue(headers, row, 'dtComu'),
        };
      })
      .filter((price) => price.stationId && price.fuel && Number.isFinite(price.price));
  }

  function cacheIsFresh(cached: CachedPayload): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return cached.fetchedAt === today && cached.stations.length > 0 && cached.prices.length > 0;
  }

  function loadCache(): CachedPayload | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as CachedPayload;
      return cacheIsFresh(cached) ? cached : null;
    } catch {
      return null;
    }
  }

  function saveCache(payload: CachedPayload): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore quota/storage errors
    }
  }

  async function fetchText(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.text();
  }

  async function loadData(force = false): Promise<void> {
    loadState = 'loading';
    errorMessage = '';
    extractionDate = '';

    if (!force) {
      const cached = loadCache();
      if (cached) {
        stations = cached.stations;
        prices = cached.prices;
        extractionDate = cached.extractionDate;
        selectedFuel = cached.prices.some((price) => price.fuel === selectedFuel)
          ? selectedFuel
          : (cached.prices.find((price) => price.fuel.toLowerCase().includes('benzina'))?.fuel ??
            cached.prices[0]?.fuel ??
            '');
        loadState = 'ready';
        return;
      }
    }

    try {
      const [pricesCsv, stationsCsv] = await Promise.all([
        fetchText(PRICES_URL),
        fetchText(STATIONS_URL),
      ]);
      const parsedPrices = parsePrices(pricesCsv);
      const parsedStations = parseStations(stationsCsv);
      stations = parsedStations;
      prices = parsedPrices;
      selectedFuel =
        parsedPrices.find((price) => price.fuel.toLowerCase().includes('benzina'))?.fuel ??
        parsedPrices[0]?.fuel ??
        '';
      saveCache({
        fetchedAt: new Date().toISOString().slice(0, 10),
        extractionDate,
        stations: parsedStations,
        prices: parsedPrices,
      });
      loadState = 'ready';
    } catch (e) {
      errorMessage =
        e instanceof TypeError
          ? 'The browser could not load the official CSV files. The MIMIT server may be blocking cross-origin requests.'
          : e instanceof Error
            ? e.message
            : String(e);
      loadState = 'error';
    }
  }

  function resetPlace(): void {
    selectedProvince = '';
    selectedCity = '';
  }

  onMount(() => {
    loadData();
  });
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
  <section
    class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border-[1px] p-4"
  >
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        <div class="flex flex-wrap gap-2">
          <span class="badge preset-tonal-primary">MIMIT open data</span>
          {#if extractionDate}
            <span class="badge preset-tonal-surface">data {extractionDate}</span>
          {/if}
        </div>
        <p class="max-w-2xl text-sm text-surface-600-400">
          Find the cheapest reported fuel prices by province, city, brand, and service mode.
        </p>
      </div>
      <button
        class="btn btn-sm preset-tonal"
        onclick={() => loadData(true)}
        disabled={loadState === 'loading'}
      >
        {loadState === 'loading' ? 'Loading...' : 'Refresh data'}
      </button>
    </div>

    <div class="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Fuel</span>
        <select
          class="select w-full min-w-0 truncate"
          bind:value={selectedFuel}
          disabled={loadState !== 'ready'}
        >
          {#each fuels as fuel (fuel)}
            <option value={fuel}>{fuel}</option>
          {/each}
        </select>
      </label>

      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400"
          >Province</span
        >
        <select
          class="select w-full min-w-0 truncate"
          bind:value={selectedProvince}
          disabled={loadState !== 'ready'}
          onchange={() => (selectedCity = '')}
        >
          <option value="">All provinces</option>
          {#each provinces as province (province)}
            <option value={province}>{province}</option>
          {/each}
        </select>
      </label>

      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">City</span>
        <select
          class="select w-full min-w-0 truncate"
          bind:value={selectedCity}
          disabled={loadState !== 'ready'}
        >
          <option value="">All cities</option>
          {#each cities as city (city)}
            <option value={city}>{city}</option>
          {/each}
        </select>
      </label>

      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Brand</span>
        <input
          class="input w-full min-w-0"
          type="search"
          placeholder="Eni, IP, Q8..."
          bind:value={brandQuery}
          disabled={loadState !== 'ready'}
        />
      </label>
    </div>

    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="btn-group preset-outlined-surface-200-800">
        <button
          class="btn btn-sm {selectedMode === 'self' ? 'preset-filled' : ''}"
          onclick={() => (selectedMode = 'self')}>Self</button
        >
        <button
          class="btn btn-sm {selectedMode === 'served' ? 'preset-filled' : ''}"
          onclick={() => (selectedMode = 'served')}>Served</button
        >
        <button
          class="btn btn-sm {selectedMode === 'all' ? 'preset-filled' : ''}"
          onclick={() => (selectedMode = 'all')}>All</button
        >
      </div>
      <button class="btn btn-sm preset-ghost" onclick={resetPlace} disabled={loadState !== 'ready'}>
        Clear place
      </button>
    </div>
  </section>

  {#if loadState === 'loading'}
    <div class="space-y-2">
      {#each Array.from({ length: 8 }, (_, i) => i) as i (i)}
        <div
          class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] px-4 py-3"
        >
          <div class="placeholder mb-3 h-5" style="width: {70 - i * 4}%"></div>
          <div class="placeholder h-4 w-1/2"></div>
        </div>
      {/each}
    </div>
  {:else if loadState === 'error'}
    <aside class="card preset-tonal-error p-5">
      <p class="font-semibold">Could not load fuel prices</p>
      <p class="mt-2 text-sm">{errorMessage}</p>
      <a
        class="btn preset-outlined mt-4 text-sm"
        href={PRICES_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        Open official CSV
      </a>
    </aside>
  {:else if results().length === 0}
    <div class="card preset-tonal-warning p-5 text-center">
      <p class="font-semibold">No stations found</p>
      <p class="mt-1 text-sm">Try another fuel, province, city, or brand.</p>
    </div>
  {:else}
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <span class="badge preset-tonal-surface">{stations.length.toLocaleString('en')} stations</span
      >
      <span class="badge preset-tonal-surface">{prices.length.toLocaleString('en')} prices</span>
      <span class="badge preset-tonal-success">top {results().length} cheapest</span>
    </div>

    <div class="grid gap-3">
      {#each results() as result (`${result.station.id}-${result.price.fuel}-${result.price.isSelf}`)}
        <article
          class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] p-4 transition-colors hover:preset-tonal"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <span class="badge preset-tonal-primary">{result.station.brand}</span>
                <span class="badge preset-tonal-surface"
                  >{result.price.isSelf ? 'self' : 'served'}</span
                >
                <span class="badge preset-tonal-surface">{result.price.fuel}</span>
              </div>
              <div>
                <p class="truncate font-semibold">
                  {result.station.name || result.station.manager}
                </p>
                <p class="mt-1 text-sm text-surface-600-400">
                  {result.station.address}, {result.station.city} ({result.station.province})
                </p>
              </div>
              <p class="text-xs text-surface-500">Updated {result.price.updatedAt}</p>
            </div>

            <div class="text-left md:text-right">
              <p class="text-3xl font-bold tabular-nums">
                {result.price.price.toFixed(3)}
                <span class="text-base font-normal text-surface-500">€/L</span>
              </p>
            </div>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>
