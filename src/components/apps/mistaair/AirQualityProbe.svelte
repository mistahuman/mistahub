<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import { onMount } from 'svelte';

  type LoadState = 'loading' | 'ready' | 'error';
  type QualityLevel = 'good' | 'fair' | 'moderate' | 'poor' | 'very-poor' | 'extremely-poor';

  interface ProvinceBlock {
    version?: number;
    timestamp?: string;
    data?: StationReading[];
  }

  interface StationReading {
    prov: string;
    idstazione: string;
    stazione: string;
    tipostazione: string;
    pm10: string;
    pm25: string;
    no2: string;
    o3mediaorariamax: string;
    o3media8oremax: string;
    benzene: string;
    co: string;
    so2: string;
    pm10supgiorni: string;
    no2supore: string;
    o3supore: string;
    o3supgiorni: string;
  }

  interface LatestBulletin {
    _id: string;
    _updated?: string;
    pc?: ProvinceBlock[];
    pr?: ProvinceBlock[];
    re?: ProvinceBlock[];
    mo?: ProvinceBlock[];
    bo?: ProvinceBlock[];
    fe?: ProvinceBlock[];
    ra?: ProvinceBlock[];
    fc?: ProvinceBlock[];
    rn?: ProvinceBlock[];
  }

  interface ApiResponse {
    _items: LatestBulletin[];
  }

  interface NormalizedReading extends StationReading {
    city: string;
    stationName: string;
    provinceTimestamp: string;
  }

  interface PollutantScore {
    key: keyof Pick<NormalizedReading, 'pm10' | 'pm25' | 'no2' | 'o3mediaorariamax' | 'so2'>;
    label: string;
    value: number | null;
    raw: string;
    unit: string;
    level: QualityLevel | null;
    score: number;
  }

  interface QualitySummary {
    level: QualityLevel;
    label: string;
    preset: string;
    description: string;
    driver: PollutantScore | null;
    pollutants: PollutantScore[];
  }

  const API_URL = 'https://apps.arpae.it/REST/bollettini_qa/?t=json&max_results=1&sort=-_id';
  const STORAGE_KEY = 'mistaair-selected-city';
  const PROVINCES = ['pc', 'pr', 're', 'mo', 'bo', 'fe', 'ra', 'fc', 'rn'] as const;

  const QUALITY_META: Record<QualityLevel, { label: string; preset: string; description: string }> =
    {
      good: {
        label: 'Good',
        preset: 'preset-tonal-success',
        description: 'Air readings are comfortably low across the available pollutants.',
      },
      fair: {
        label: 'Fair',
        preset: 'preset-tonal-success',
        description: 'Air quality is acceptable, with one pollutant slightly more present.',
      },
      moderate: {
        label: 'Moderate',
        preset: 'preset-tonal-warning',
        description: 'Some readings are elevated. Sensitive people may want to pay attention.',
      },
      poor: {
        label: 'Poor',
        preset: 'preset-tonal-error',
        description: 'At least one pollutant is high enough to make the air quality poor.',
      },
      'very-poor': {
        label: 'Very poor',
        preset: 'preset-tonal-error',
        description: 'Pollution levels are high. Outdoor exposure should be reduced.',
      },
      'extremely-poor': {
        label: 'Extremely poor',
        preset: 'preset-filled-error-500',
        description: 'Pollution levels are very high. Avoid unnecessary outdoor exposure.',
      },
    };

  let loadState = $state<LoadState>('loading');
  let errorMessage = $state('');
  let rawPayload = $state<ApiResponse | null>(null);
  let rows = $state<NormalizedReading[]>([]);
  let selectedCity = $state('');
  let cityFilter = $state('');

  const latest = $derived(rawPayload?._items?.[0] ?? null);

  const cities = $derived(
    [...new Set(rows.map((row) => row.city))].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  );

  const cityItems = $derived(() => {
    const lower = cityFilter.toLowerCase();
    const items = cities.map((city) => ({ label: city, value: city }));
    return cityFilter ? items.filter((item) => item.label.toLowerCase().includes(lower)) : items;
  });

  const cityCollection = $derived(collection({ items: cityItems() }));

  const selectedRows = $derived(() => {
    const city = selectedCity || cities[0] || '';
    return rows.filter((row) => row.city === city);
  });

  const quality = $derived(() => summarizeQuality(selectedRows()));

  function latestProvinceBlock(blocks: ProvinceBlock[] | undefined): ProvinceBlock | null {
    if (!blocks?.length) return null;
    return [...blocks].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null;
  }

  function splitStation(raw: string): { city: string; stationName: string } {
    const [city, ...stationParts] = raw.split(' - ');
    return {
      city: city?.trim() || raw.trim(),
      stationName: stationParts.join(' - ').trim() || raw.trim(),
    };
  }

  function normalizeBulletin(item: LatestBulletin): NormalizedReading[] {
    const nextRows: NormalizedReading[] = [];

    for (const province of PROVINCES) {
      const block = latestProvinceBlock(item[province]);
      if (!block?.data) continue;

      for (const reading of block.data) {
        const { city, stationName } = splitStation(reading.stazione);
        nextRows.push({
          ...reading,
          city,
          stationName,
          provinceTimestamp: block.timestamp ?? '',
        });
      }
    }

    return nextRows.sort(
      (a, b) => a.city.localeCompare(b.city) || a.stationName.localeCompare(b.stationName),
    );
  }

  function parseMeasurement(value: string): number | null {
    const cleaned = value.replace('<', '').replace(',', '.').trim();
    if (!cleaned || cleaned.toLowerCase() === 'n.d.') return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function levelFromScore(score: number): QualityLevel {
    if (score <= 1) return 'good';
    if (score === 2) return 'fair';
    if (score === 3) return 'moderate';
    if (score === 4) return 'poor';
    if (score === 5) return 'very-poor';
    return 'extremely-poor';
  }

  function scoreByThreshold(value: number | null, thresholds: number[]): number {
    if (value === null) return 0;
    const index = thresholds.findIndex((threshold) => value <= threshold);
    return index >= 0 ? index + 1 : thresholds.length + 1;
  }

  function pollutantScore(
    rowsForCity: NormalizedReading[],
    key: PollutantScore['key'],
    label: string,
    unit: string,
    thresholds: number[],
  ): PollutantScore {
    const values = rowsForCity
      .map((row) => ({ raw: row[key], value: parseMeasurement(row[key]) }))
      .filter((entry) => entry.value !== null) as Array<{ raw: string; value: number }>;

    const highest = values.sort((a, b) => b.value - a.value)[0];
    const score = scoreByThreshold(highest?.value ?? null, thresholds);

    return {
      key,
      label,
      value: highest?.value ?? null,
      raw: highest?.raw?.trim() ?? '',
      unit,
      level: score > 0 ? levelFromScore(score) : null,
      score,
    };
  }

  function summarizeQuality(rowsForCity: NormalizedReading[]): QualitySummary | null {
    if (rowsForCity.length === 0) return null;

    const pollutants = [
      pollutantScore(rowsForCity, 'pm10', 'PM10', 'ug/m3', [15, 45, 120, 195, 270]),
      pollutantScore(rowsForCity, 'pm25', 'PM2.5', 'ug/m3', [5, 15, 50, 90, 140]),
      pollutantScore(rowsForCity, 'no2', 'NO2', 'ug/m3', [10, 25, 60, 100, 150]),
      pollutantScore(rowsForCity, 'o3mediaorariamax', 'O3', 'ug/m3', [60, 100, 120, 160, 180]),
      pollutantScore(rowsForCity, 'so2', 'SO2', 'ug/m3', [20, 40, 125, 190, 275]),
    ];
    const driver = [...pollutants].sort((a, b) => b.score - a.score)[0] ?? null;
    const level = driver?.level ?? 'good';
    const meta = QUALITY_META[level];

    return {
      level,
      label: meta.label,
      preset: meta.preset,
      description: meta.description,
      driver,
      pollutants,
    };
  }

  function restoreCity(): string {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  }

  function saveCity(city: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, city);
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }

  function resetCityFilter(): void {
    cityFilter = '';
  }

  async function load(): Promise<void> {
    loadState = 'loading';
    errorMessage = '';

    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const payload = (await res.json()) as ApiResponse;
      const item = payload._items?.[0];
      if (!item) throw new Error('ARPAE response did not include a bulletin.');

      const normalizedRows = normalizeBulletin(item);
      const savedCity = restoreCity();

      rawPayload = payload;
      rows = normalizedRows;
      selectedCity = normalizedRows.some((row) => row.city === savedCity)
        ? savedCity
        : (normalizedRows[0]?.city ?? '');

      console.log('mistaair ARPAE raw payload', payload);
      console.log('mistaair normalized rows', normalizedRows);

      loadState = 'ready';
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      loadState = 'error';
      console.error('mistaair load error', error);
    }
  }

  onMount(() => {
    load();
  });
</script>

<div class="mx-auto w-full max-w-6xl space-y-4">
  <section
    class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border-[1px] p-4"
  >
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        {#if latest}
          <span class="badge preset-tonal-success">bulletin {latest._id}</span>
        {/if}
        <p class="max-w-3xl text-sm text-surface-600-400">
          Select a city and read the latest official station measurements for PM10, PM2.5, NO2,
          ozone, and SO2.
        </p>
      </div>
      <button class="btn btn-sm preset-tonal" onclick={load} disabled={loadState === 'loading'}>
        {loadState === 'loading' ? 'Loading...' : 'Reload'}
      </button>
    </div>

    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">City</span>
        {#key `${loadState}-${rows.length}-${selectedCity}`}
          <Combobox
            collection={cityCollection}
            defaultValue={selectedCity ? [selectedCity] : []}
            defaultInputValue={selectedCity}
            disabled={loadState !== 'ready'}
            onInputValueChange={(d) => {
              cityFilter = d.inputValue;
            }}
            onValueChange={(d) => {
              const picked = d.value[0] ?? cities[0] ?? '';
              selectedCity = picked;
              cityFilter = '';
              saveCity(selectedCity);
            }}
            onOpenChange={(d) => {
              if (d.open) resetCityFilter();
            }}
            openOnClick
          >
            <Combobox.Control>
              <Combobox.Input
                class="input w-full min-w-0 truncate"
                placeholder="Select city"
                onclick={resetCityFilter}
              />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-72 w-full overflow-y-auto border-[1px]"
              >
                {#each cityCollection.items as item (item.value)}
                  <Combobox.Item
                    {item}
                    class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal {item.value ===
                    selectedCity
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

      {#if loadState === 'ready'}
        <div class="flex flex-wrap gap-2 text-xs">
          <span class="badge preset-tonal-surface">{rows.length} readings</span>
          <span class="badge preset-tonal-surface">{cities.length} cities</span>
        </div>
      {/if}
    </div>
  </section>

  {#if loadState === 'loading'}
    <div class="card preset-tonal p-5">Loading ARPAE data...</div>
  {:else if loadState === 'error'}
    <aside class="card preset-tonal-error p-5">
      <p class="font-semibold">Could not load ARPAE data</p>
      <p class="mt-2 text-sm">{errorMessage}</p>
    </aside>
  {:else if !quality()}
    <div class="card preset-tonal-surface-500 p-5">No air-quality readings for this city.</div>
  {:else}
    <section class="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <article class="card {quality()?.preset} p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="space-y-2">
            <p class="text-sm uppercase tracking-wide opacity-75">Air quality</p>
            <h2 class="text-4xl font-bold">{quality()?.label}</h2>
            <p class="max-w-xl text-sm">{quality()?.description}</p>
          </div>
          <span class="badge preset-filled-surface-50-950 w-fit">{selectedCity}</span>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <div class="card preset-filled-surface-50-950 p-3">
            <p class="text-xs uppercase tracking-wide text-surface-500">Main driver</p>
            <p class="mt-1 text-lg font-semibold">
              {quality()?.driver?.label ?? 'n/a'}
              {#if quality()?.driver?.value !== null}
                <span class="font-normal text-surface-500">
                  {quality()?.driver?.raw}
                  {quality()?.driver?.unit}
                </span>
              {/if}
            </p>
          </div>
          <div class="card preset-filled-surface-50-950 p-3">
            <p class="text-xs uppercase tracking-wide text-surface-500">Stations</p>
            <p class="mt-1 text-lg font-semibold">{selectedRows().length}</p>
          </div>
        </div>
      </article>

      <section class="grid gap-3 sm:grid-cols-2">
        {#each quality()?.pollutants ?? [] as pollutant (pollutant.key)}
          <article
            class="card {pollutant.level
              ? QUALITY_META[pollutant.level].preset
              : 'preset-tonal-surface-500'} p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">{pollutant.label}</p>
                <p class="mt-1 text-xs opacity-75">
                  {pollutant.level ? QUALITY_META[pollutant.level].label : 'No data reported'}
                </p>
              </div>
              <p class="text-2xl font-bold tabular-nums">
                {pollutant.raw || '-'}
                {#if pollutant.raw}
                  <span class="text-sm font-normal">{pollutant.unit}</span>
                {/if}
              </p>
            </div>
          </article>
        {/each}
      </section>
    </section>

    <section class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">Stations in {selectedCity}</h2>
        <span class="badge preset-tonal-surface"
          >updated {selectedRows()[0]?.provinceTimestamp}</span
        >
      </div>

      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>Station</th>
              <th>Type</th>
              <th>PM10</th>
              <th>PM2.5</th>
              <th>NO2</th>
              <th>O3 hour</th>
              <th>O3 8h</th>
              <th>PM10 exceed.</th>
            </tr>
          </thead>
          <tbody>
            {#each selectedRows() as row (row.idstazione)}
              <tr>
                <td>{row.stationName}</td>
                <td>{row.tipostazione}</td>
                <td>{row.pm10 || '-'}</td>
                <td>{row.pm25 || '-'}</td>
                <td>{row.no2 || '-'}</td>
                <td>{row.o3mediaorariamax || '-'}</td>
                <td>{row.o3media8oremax || '-'}</td>
                <td>{row.pm10supgiorni || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>
