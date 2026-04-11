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
  let giveUpConfirm = $state(false);
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
    giveUpConfirm = false;
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
      giveUpConfirm = false;
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem('mistageo-best-streak', String(bestStreak));
      }
      status = 'revealed';
      lastResult = 'correct';
    } else {
      streak = 0;
      giveUpConfirm = false;
      if (wrongTimer) clearTimeout(wrongTimer);
      wrongFeedback = true;
      wrongTimer = setTimeout(() => {
        wrongFeedback = false;
      }, 1500);
    }
  }

  function giveUp(): void {
    if (status !== 'playing') return;
    if (!giveUpConfirm) {
      giveUpConfirm = true;
      return;
    }
    streak = 0;
    giveUpConfirm = false;
    status = 'revealed';
    lastResult = 'surrendered';
  }

  $effect(() => {
    bestStreak = Number(localStorage.getItem('mistageo-best-streak') ?? 0);
    loadCountries();
  });
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-4">
  <!-- Status + mode controls -->
  <div
    class="card preset-filled-surface-100-900 border-surface-200-800 flex flex-col gap-4 border px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex flex-wrap gap-3 text-sm">
      <span>Streak <strong class="text-primary-500">{streak}</strong></span>
      <span>Best <strong class="text-secondary-500">{bestStreak}</strong></span>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-widest text-surface-400">Mode</p>
      <div class="btn-group preset-outlined-surface-200-800" aria-label="Game mode">
        <button
          class="btn btn-sm min-w-24 text-sm {mode === 'flag' ? 'preset-filled' : ''}"
          onclick={() => switchMode('flag')}
          aria-pressed={mode === 'flag'}
        >
          Flag
        </button>
        <button
          class="btn btn-sm min-w-24 text-sm {mode === 'border' ? 'preset-filled' : ''}"
          onclick={() => switchMode('border')}
          aria-pressed={mode === 'border'}
        >
          Border
        </button>
      </div>
    </div>
  </div>

  <!-- Visual card (flag or border) -->
  <div class="card preset-filled-surface-100-900 border border-surface-200-800 overflow-hidden">
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

  <!-- Hints -->
  {#if current && status !== 'loading'}
    <div
      class="card preset-filled-surface-100-900 border-surface-200-800 space-y-3 border px-5 py-4 text-sm"
    >
      <div class="flex min-h-8 flex-wrap items-center gap-2">
        {#if phase === 0 && status === 'playing'}
          <span class="text-surface-500">No hints revealed yet.</span>
        {/if}
        {#if phase >= 1 || status === 'revealed'}
          <span class="badge preset-tonal-surface"
            >Population {formatPopulation(current.population)}</span
          >
        {/if}
        {#if phase >= 2 || status === 'revealed'}
          <span class="badge preset-tonal-surface">Continent {current.continents[0]}</span>
        {/if}
        {#if phase >= 3 || status === 'revealed'}
          <span class="badge preset-tonal-surface">Capital {current.capital[0]}</span>
        {/if}
      </div>
      {#if status === 'revealed' && lastResult !== null}
        <div
          class="rounded-container p-3 {lastResult === 'correct'
            ? 'preset-tonal-success'
            : 'preset-tonal-warning'}"
        >
          {#if lastResult === 'correct'}
            <p class="font-semibold">Correct</p>
          {:else}
            <p class="font-semibold">Answer revealed</p>
          {/if}
          <p class="mt-1 text-lg font-bold">{current.name.common}</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Controls card -->
  {#if !loadError}
    <div
      class="card preset-filled-surface-100-900 border border-surface-200-800 space-y-3 px-5 py-4"
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
            <Combobox.Control class="flex flex-col gap-2 sm:flex-row">
              <Combobox.Input class="input min-w-0 flex-1" placeholder="Search a country…" />
              <button class="btn preset-filled-primary-500" onclick={submit}>Submit</button>
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border border-surface-200-800 max-h-60 overflow-y-auto z-50 w-full"
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
        <div class="flex flex-col gap-2 sm:flex-row">
          <button
            class="btn flex-1 text-sm preset-tonal"
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
        </div>
        <div class="flex flex-col items-end gap-2 border-t border-surface-200-800 pt-3">
          {#if giveUpConfirm}
            <p class="text-right text-xs text-warning-600-400">
              This ends the round and resets the streak.
            </p>
          {/if}
          <button
            class="btn btn-sm {giveUpConfirm ? 'preset-filled-warning-500' : 'preset-ghost'}"
            onclick={giveUp}
          >
            {giveUpConfirm ? 'Confirm give up' : 'Give up'}
          </button>
        </div>
      {:else if status === 'revealed'}
        <button class="btn preset-filled-primary-500 w-full" onclick={startRound}>Next Round</button
        >
      {/if}
    </div>
  {/if}
</div>
