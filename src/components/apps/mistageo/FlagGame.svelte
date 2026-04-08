<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import { feature } from 'topojson-client';
  import type { Topology } from 'topojson-specification';
  import type { Geometry } from 'geojson';
  import { SvelteMap } from 'svelte/reactivity';

  interface Country {
    name: {
      common: string;
      translations?: { ita?: { common?: string } };
    };
    flags: { svg: string; alt?: string };
    capital: string[];
    continents: string[];
    population: number;
    ccn3: string;
  }

  type GameMode = 'flag' | 'border';

  // Module-level caches — survive across rounds
  let worldTopology: Topology | null = null;
  const borderPathCache = new SvelteMap<string, string>();

  let allCountries = $state<Country[]>([]);
  let loadError = $state(false);
  let mode = $state<GameMode>('flag');
  let status = $state<'loading' | 'playing' | 'revealed'>('loading');
  let lastResult = $state<'correct' | 'surrendered' | null>(null);
  let phase = $state(0);
  let current = $state<Country | null>(null);
  let borderPath = $state<string | null>(null);
  let selectedValue = $state('');
  let filterText = $state('');
  let streak = $state(0);
  let bestStreak = $state(0);
  let wrongFeedback = $state(false);
  let wrongTimer: ReturnType<typeof setTimeout> | null = null;
  let roundKey = $state(0);

  const cssFilter = $derived(status === 'revealed' ? 'none' : 'grayscale(1)');

  const allItems = $derived(
    [...allCountries]
      .sort((a, b) => a.name.common.localeCompare(b.name.common))
      .map((c) => ({ label: c.name.common, value: c.name.common })),
  );

  const filteredItems = $derived(
    filterText
      ? allItems.filter((item) => item.label.toLowerCase().includes(filterText.toLowerCase()))
      : allItems,
  );

  const comboCollection = $derived(collection({ items: filteredItems }));

  // Border stroke/fill color based on result
  const borderStroke = $derived(
    status === 'revealed'
      ? lastResult === 'correct'
        ? 'var(--color-success-500)'
        : 'var(--color-error-500)'
      : 'var(--color-surface-600-400)',
  );
  const borderFill = $derived(
    status === 'revealed'
      ? lastResult === 'correct'
        ? 'var(--color-success-200)'
        : 'var(--color-error-200)'
      : 'var(--color-surface-300-700)',
  );

  function normalize(s: string): string {
    return s
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function formatPopulation(n: number): string {
    return n.toLocaleString('en-US');
  }

  function geometryToSvgPath(geometry: Geometry): string {
    const VIEW_W = 600;
    const VIEW_H = 400;
    const PADDING = 24;

    type Ring = number[][];
    let rings: Ring[];

    if (geometry.type === 'Polygon') {
      rings = geometry.coordinates as Ring[];
    } else if (geometry.type === 'MultiPolygon') {
      rings = (geometry.coordinates as Ring[][]).flat();
    } else {
      return '';
    }

    if (rings.length === 0) return '';

    // Bounding box
    let minLon = Infinity,
      maxLon = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;

    for (const ring of rings) {
      for (const pt of ring) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      }
    }

    // Handle antimeridian: if bounding box spans > 180° lon, shift negative longitudes
    if (maxLon - minLon > 180) {
      rings = rings.map((ring) => ring.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]));
      minLon = Infinity;
      maxLon = -Infinity;
      for (const ring of rings) {
        for (const pt of ring) {
          if (pt[0] < minLon) minLon = pt[0];
          if (pt[0] > maxLon) maxLon = pt[0];
        }
      }
    }

    const dLon = maxLon - minLon || 1;
    const dLat = maxLat - minLat || 1;
    const availW = VIEW_W - PADDING * 2;
    const availH = VIEW_H - PADDING * 2;
    const scale = Math.min(availW / dLon, availH / dLat);
    const offX = PADDING + (availW - dLon * scale) / 2;
    const offY = PADDING + (availH - dLat * scale) / 2;

    const project = (pt: number[]) => [
      offX + (pt[0] - minLon) * scale,
      offY + (maxLat - pt[1]) * scale,
    ];

    let d = '';
    for (const ring of rings) {
      if (ring.length === 0) continue;
      const [x0, y0] = project(ring[0]);
      d += `M${x0.toFixed(1)},${y0.toFixed(1)}`;
      for (let i = 1; i < ring.length; i++) {
        const [x, y] = project(ring[i]);
        d += `L${x.toFixed(1)},${y.toFixed(1)}`;
      }
      d += 'Z';
    }
    return d;
  }

  function getCountryPath(ccn3: string): string | null {
    if (!ccn3 || !worldTopology) return null;
    if (borderPathCache.has(ccn3)) return borderPathCache.get(ccn3)!;

    const countries = feature(worldTopology, worldTopology.objects.countries as never);
    const found = countries.features.find((f) => String(f.id) === ccn3);
    if (!found || !found.geometry) return null;

    const path = geometryToSvgPath(found.geometry);
    if (path) borderPathCache.set(ccn3, path);
    return path || null;
  }

  async function loadCountries(): Promise<void> {
    try {
      const [countriesRes, atlasRes] = await Promise.all([
        fetch(
          'https://restcountries.com/v3.1/all?fields=name,flags,capital,continents,population,ccn3',
        ),
        fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
      ]);
      const data: Country[] = await countriesRes.json();
      worldTopology = await atlasRes.json();
      allCountries = data.filter(
        (c) =>
          c.flags?.svg && c.capital?.length >= 1 && c.continents?.length >= 1 && c.population > 0,
      );
      startRound();
    } catch {
      loadError = true;
    }
  }

  function startRound(): void {
    if (allCountries.length === 0) return;

    // In border mode, pick a country that has a valid geometry
    let candidate: Country | null = null;
    let tries = 0;
    while (tries < 20) {
      const pick = allCountries[Math.floor(Math.random() * allCountries.length)];
      if (mode === 'flag' || getCountryPath(pick.ccn3) !== null) {
        candidate = pick;
        break;
      }
      tries++;
    }
    if (!candidate) candidate = allCountries[Math.floor(Math.random() * allCountries.length)];

    current = candidate;
    borderPath = mode === 'border' ? getCountryPath(candidate.ccn3) : null;
    phase = 0;
    status = 'playing';
    lastResult = null;
    selectedValue = '';
    filterText = '';
    wrongFeedback = false;
    roundKey++;
    if (wrongTimer) clearTimeout(wrongTimer);
  }

  function switchMode(next: GameMode): void {
    if (next === mode) return;
    mode = next;
    startRound();
  }

  function revealHint(): void {
    if (phase < 3) phase++;
  }

  function submit(): void {
    if (!current || !selectedValue.trim() || status !== 'playing') return;
    const guess = normalize(selectedValue);
    const common = normalize(current.name.common);
    const ita = current.name.translations?.ita?.common
      ? normalize(current.name.translations.ita.common)
      : null;

    if (guess === common || (ita !== null && guess === ita)) {
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem('mistageo-best-streak', String(bestStreak));
      }
      status = 'revealed';
      lastResult = 'correct';
    } else {
      streak = 0;
      if (wrongTimer) clearTimeout(wrongTimer);
      wrongFeedback = true;
      wrongTimer = setTimeout(() => {
        wrongFeedback = false;
      }, 1500);
    }
  }

  function giveUp(): void {
    if (status !== 'playing') return;
    streak = 0;
    status = 'revealed';
    lastResult = 'surrendered';
  }

  $effect(() => {
    bestStreak = Number(localStorage.getItem('mistageo-best-streak') ?? 0);
    loadCountries();
  });
</script>

<div class="flex flex-col gap-3 w-full max-w-lg mx-auto">
  <!-- Mode switcher -->
  <div
    class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 flex gap-1 p-1"
  >
    <button
      class="btn flex-1 text-sm {mode === 'flag' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
      onclick={() => switchMode('flag')}
    >
      Flag
    </button>
    <button
      class="btn flex-1 text-sm {mode === 'border' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
      onclick={() => switchMode('border')}
    >
      Border
    </button>
  </div>

  <!-- Streak card -->
  <div
    class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 flex justify-between px-5 py-3 text-sm"
  >
    <span>Streak: <strong class="text-primary-500">{streak}</strong></span>
    <span>Best: <strong class="text-secondary-500">{bestStreak}</strong></span>
  </div>

  <!-- Visual card (flag or border) -->
  <div
    class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 overflow-hidden"
  >
    <div
      class="w-full bg-surface-200-800 flex items-center justify-center"
      style="aspect-ratio: 3/2"
    >
      {#if status === 'loading'}
        <p class="opacity-40 text-sm animate-pulse">Loading…</p>
      {:else if loadError}
        <p class="text-error-500 text-sm px-4 text-center">
          Failed to load data. Check your connection.
        </p>
      {:else if current}
        {#if mode === 'flag'}
          <img
            src={current.flags.svg}
            alt={status === 'revealed'
              ? (current.flags.alt ?? current.name.common)
              : 'Mystery flag'}
            class="w-full h-full object-contain"
            style="filter: {cssFilter}; transition: filter 0.5s ease"
          />
        {:else if borderPath}
          <svg viewBox="0 0 600 400" class="w-full h-full" aria-label="Country border">
            <path
              d={borderPath}
              fill={borderFill}
              stroke={borderStroke}
              stroke-width="2"
              stroke-linejoin="round"
              style="transition: fill 0.4s ease, stroke 0.4s ease"
            />
          </svg>
        {:else}
          <p class="opacity-40 text-sm">Border not available for this country.</p>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Hints card -->
  {#if current && status !== 'loading'}
    <div
      class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 px-5 py-4 text-sm space-y-1 min-h-[6rem]"
    >
      {#if phase === 0 && status === 'playing'}
        <p class="opacity-40">No hints revealed yet.</p>
      {/if}
      {#if phase >= 1 || status === 'revealed'}
        <p><span class="opacity-50">Population:</span> {formatPopulation(current.population)}</p>
      {/if}
      {#if phase >= 2 || status === 'revealed'}
        <p><span class="opacity-50">Continent:</span> {current.continents[0]}</p>
      {/if}
      {#if phase >= 3 || status === 'revealed'}
        <p><span class="opacity-50">Capital:</span> {current.capital[0]}</p>
      {/if}
      {#if status === 'revealed' && lastResult !== null}
        <p class="font-semibold pt-1">
          {#if lastResult === 'correct'}
            <span class="text-success-500">Correct! {current.name.common}</span>
          {:else}
            <span class="text-error-500">It was {current.name.common}</span>
          {/if}
        </p>
      {/if}
    </div>
  {/if}

  <!-- Controls card -->
  {#if !loadError}
    <div
      class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 px-5 py-4 space-y-3"
    >
      {#if status === 'playing'}
        {#key roundKey}
          <Combobox
            collection={comboCollection}
            onInputValueChange={(d) => {
              filterText = d.inputValue;
            }}
            onValueChange={(d) => {
              selectedValue = d.value[0] ?? '';
            }}
            allowCustomValue
            openOnClick
          >
            <Combobox.Control class="flex gap-2">
              <Combobox.Input class="input flex-1" placeholder="Search a country…" />
              <button class="btn preset-tonal-primary" onclick={submit}>Submit</button>
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 max-h-60 overflow-y-auto z-50 w-full"
              >
                {#each filteredItems as item (item.value)}
                  <Combobox.Item {item} class="px-3 py-2 text-sm cursor-pointer hover:preset-tonal">
                    <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  </Combobox.Item>
                {/each}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}

        <div class="h-5">
          {#if wrongFeedback}
            <p class="text-sm text-error-500">Wrong guess — streak reset.</p>
          {/if}
        </div>
        <div class="flex gap-2">
          <button
            class="btn preset-tonal flex-1 text-sm"
            onclick={revealHint}
            disabled={phase >= 3}
          >
            {#if phase === 0}
              Show population
            {:else if phase === 1}
              Show continent
            {:else if phase === 2}
              Show capital
            {:else}
              No more hints
            {/if}
          </button>
          <button class="btn preset-tonal-error text-sm" onclick={giveUp}>Give Up</button>
        </div>
      {:else if status === 'revealed'}
        <button class="btn preset-tonal-primary w-full" onclick={startRound}>Next Round</button>
      {/if}
    </div>
  {/if}
</div>
