<script lang="ts">
  import { ExternalLink, Pause, Play, Radio, Search, Shuffle } from 'lucide-svelte';
  import { onMount, tick } from 'svelte';

  type LoadState = 'loading' | 'ready' | 'error';

  interface Station {
    stationuuid: string;
    name: string;
    url_resolved: string;
    homepage: string;
    favicon: string;
    tags: string;
    country: string;
    countrycode: string;
    state: string;
    language: string;
    codec: string;
    bitrate: number;
    hls: number;
    votes: number;
    clickcount: number;
    lastcheckok: number;
  }

  interface Country {
    name: string;
    iso_3166_1: string;
    stationcount: number;
  }

  const API_BASE = 'https://de1.api.radio-browser.info/json';
  const STORAGE_KEY = 'mistaradio-filters';
  const STATION_STORAGE_KEY = 'mistaradio-last-station';
  const LIMIT = 80;
  const BAR_COUNT = 36;

  let loadState = $state<LoadState>('loading');
  let metaState = $state<LoadState>('loading');
  let errorMessage = $state('');
  let playError = $state('');
  let query = $state('');
  let country = $state('all');
  let volume = $state(0.85);
  let stations = $state<Station[]>([]);
  let countries = $state<Country[]>([]);
  let selectedStation = $state<Station | null>(null);
  let filtersRestored = $state(false);
  let isPlaying = $state(false);
  let visualizerBars = $state<number[]>(
    Array.from({ length: BAR_COUNT }, (_, index) => 18 + (index % 7) * 6),
  );
  let audioEl: HTMLAudioElement | null = null;
  let animationFrame = 0;

  const playableStations = $derived(stations.filter(isLikelyPlayable));
  const visibleStations = $derived.by(() => {
    if (!selectedStation || !isLikelyPlayable(selectedStation)) return playableStations;
    if (playableStations.some((station) => station.stationuuid === selectedStation.stationuuid)) {
      return playableStations;
    }

    return [selectedStation, ...playableStations];
  });
  const stationCountLabel = $derived(
    loadState === 'ready' ? `${visibleStations.length} tuned` : 'Scanning',
  );
  const visualizerStatus = $derived(isPlaying ? 'Signal' : 'Standby');

  $effect(() => {
    if (!filtersRestored) return;
    saveFilters();
  });

  $effect(() => {
    if (!filtersRestored) return;
    saveSelectedStation();
  });

  $effect(() => {
    query;
    country;

    if (!filtersRestored) return;

    const timeout = window.setTimeout(() => {
      loadStations();
    }, 350);

    return () => window.clearTimeout(timeout);
  });

  function isLikelyPlayable(station: Station): boolean {
    const stream = station.url_resolved || '';
    return stream.startsWith('https://') && station.hls === 0 && station.lastcheckok === 1;
  }

  function stationTags(station: Station): string[] {
    return station.tags
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  function stationSubtitle(station: Station): string {
    return [station.country, station.state, station.language].filter(Boolean).join(' · ');
  }

  function formatCount(count: number): string {
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
  }

  function streamLabel(station: Station): string {
    const codec = station.codec && station.codec !== 'UNKNOWN' ? station.codec : 'stream';
    return station.bitrate > 0 ? `${codec} ${station.bitrate}kbps` : codec;
  }

  function signalLevel(station: Station | null): string {
    if (!station) return 'No signal';
    if (isLikelyPlayable(station)) return 'Strong signal';
    if (station.lastcheckok === 1) return 'Open signal';
    return 'Weak signal';
  }

  function frequencyLabel(station: Station | null): string {
    if (!station) return '---.- FM';

    const seed = [...station.stationuuid].reduce((total, char) => total + char.charCodeAt(0), 0);
    return `${(87.5 + (seed % 200) / 10).toFixed(1)} FM`;
  }

  function restoreFilters(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        country?: string;
      };
      country = saved.country ?? 'all';
    } catch {
      country = 'all';
    }
  }

  function saveFilters(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ country }));
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }

  function restoreSelectedStation(): Station | null {
    try {
      const saved = localStorage.getItem(STATION_STORAGE_KEY);
      if (!saved) return null;

      return JSON.parse(saved) as Station;
    } catch {
      return null;
    }
  }

  function saveSelectedStation(): void {
    try {
      if (selectedStation) {
        localStorage.setItem(STATION_STORAGE_KEY, JSON.stringify(selectedStation));
      } else {
        localStorage.removeItem(STATION_STORAGE_KEY);
      }
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }

  function buildStationsUrl(): string {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const params = new URLSearchParams({
      limit: String(LIMIT),
      hidebroken: 'true',
      order: 'clickcount',
      reverse: 'true',
    });

    const trimmed = query.trim();
    if (trimmed) params.set('name', trimmed);
    if (country !== 'all') params.set('countrycode', country);

    return `${API_BASE}/stations/search?${params}`;
  }

  async function loadMetadata(): Promise<void> {
    metaState = 'loading';

    try {
      const countriesRes = await fetch(
        `${API_BASE}/countries?limit=40&order=stationcount&reverse=true`,
      );

      if (!countriesRes.ok) {
        throw new Error('Could not load radio filters.');
      }

      countries = (await countriesRes.json()) as Country[];
      metaState = 'ready';
    } catch (error) {
      metaState = 'error';
      console.error('mistaradio metadata error', error);
    }
  }

  async function loadStations(): Promise<void> {
    loadState = 'loading';
    errorMessage = '';
    playError = '';

    try {
      const res = await fetch(buildStationsUrl());
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const payload = (await res.json()) as Station[];
      const storedStation = restoreSelectedStation();
      stations = payload.filter(
        (station) => station.name?.trim() && station.url_resolved && isLikelyPlayable(station),
      );
      selectedStation =
        stations.find((station) => station.stationuuid === selectedStation?.stationuuid) ??
        stations.find((station) => station.stationuuid === storedStation?.stationuuid) ??
        (storedStation && isLikelyPlayable(storedStation) ? storedStation : null) ??
        selectedStation;
      loadState = 'ready';

      console.log('mistaradio stations', { filters: { query, country }, stations });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      loadState = 'error';
      console.error('mistaradio stations error', error);
    }
  }

  function startVisualizer(): void {
    window.cancelAnimationFrame(animationFrame);

    const draw = () => {
      if (!isPlaying) return;

      visualizerBars = fallbackBars();
      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
  }

  function fallbackBars(): number[] {
    const now = Date.now() / 210;

    return Array.from({ length: BAR_COUNT }, (_, index) => {
      const wave = Math.sin(now + index * 0.58) * 22;
      const pulse = Math.sin(now * 0.82 + index * 0.21) * 12;
      const bounce = Math.sin(now * 1.4 + index * 0.13) * 6;
      return Math.max(12, Math.min(88, 38 + wave + pulse + bounce));
    });
  }

  async function playStation(station: Station): Promise<void> {
    selectedStation = station;
    playError = '';

    await tick();

    try {
      if (audioEl) audioEl.volume = volume;
      await audioEl?.play();
    } catch (error) {
      playError = error instanceof Error ? error.message : 'Could not start playback.';
      console.error('mistaradio playback error', error);
    }
  }

  async function togglePlayback(): Promise<void> {
    if (!selectedStation) {
      surpriseMe();
      return;
    }

    if (isPlaying) {
      audioEl?.pause();
      window.cancelAnimationFrame(animationFrame);
      return;
    }

    await playStation(selectedStation);
  }

  function surpriseMe(): void {
    const pool = playableStations.length > 0 ? playableStations : visibleStations;
    if (pool.length === 0) return;

    const station = pool[Math.floor(Math.random() * pool.length)];
    playStation(station);
  }

  function resetFilters(): void {
    query = '';
    country = 'all';
  }

  function changeVolume(event: Event): void {
    volume = Number((event.currentTarget as HTMLInputElement).value);
    if (audioEl) audioEl.volume = volume;
  }

  onMount(() => {
    restoreFilters();
    selectedStation = restoreSelectedStation();
    filtersRestored = true;
    loadMetadata();
    loadStations();

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  });
</script>

<div class="mx-auto w-full max-w-screen-xl space-y-4">
  <article
    class="relative min-h-[26rem] overflow-hidden rounded-base border border-surface-200-800 bg-surface-50-950 md:min-h-[31rem]"
  >
    <div
      class="absolute inset-0 flex items-end gap-1 px-4 pb-16 pt-8 md:gap-2 md:px-8 md:pb-20"
      aria-hidden="true"
    >
      {#each visualizerBars as height, index (index)}
        <span
          class="min-h-4 flex-1 rounded-t-sm transition-[height] duration-75"
          style={`height: ${isPlaying ? height : Math.max(10, height * 0.3)}%; background: linear-gradient(to top, var(--color-primary-500), var(--color-success-500)); opacity: ${0.2 + (index % 6) * 0.075};`}
        ></span>
      {/each}
    </div>

    <div class="absolute inset-0 bg-surface-50/80 dark:bg-surface-950/72"></div>

    <div
      class="relative z-10 flex min-h-[26rem] flex-col justify-between gap-4 p-5 md:min-h-[31rem] md:p-6"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-wrap gap-2">
          <span class="badge {isPlaying ? 'preset-filled-primary' : 'preset-tonal-primary'}">
            {isPlaying ? 'On air' : 'Ready'}
          </span>
          <span class="badge {isPlaying ? 'preset-filled-success' : 'preset-tonal-surface'}">
            {visualizerStatus}
          </span>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <span class="badge preset-tonal-surface font-mono">{frequencyLabel(selectedStation)}</span
          >
          <span class="badge preset-tonal-surface">{stationCountLabel}</span>
        </div>
      </div>

      <div class="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 text-center">
        <div
          class="border-primary-500/25 bg-surface-50-950 flex size-32 items-center justify-center overflow-hidden rounded-base border p-4 text-primary-600-400 shadow-xl md:size-40"
        >
          {#if selectedStation?.favicon}
            <img
              class="max-h-full max-w-full rounded-base object-contain"
              src={selectedStation.favicon}
              alt=""
              loading="lazy"
            />
          {:else}
            <Radio size={76} strokeWidth={1.2} />
          {/if}
        </div>

        <div class="space-y-3">
          <h2 class="text-3xl font-bold leading-tight md:text-4xl">
            {selectedStation?.name ?? 'Tune the dial'}
          </h2>
          <p class="mx-auto max-w-2xl text-sm text-surface-600-400 md:text-base">
            {selectedStation
              ? stationSubtitle(selectedStation)
              : 'Pick a station below or start with a random stream.'}
          </p>
          <div class="flex flex-wrap justify-center gap-2 text-xs">
            {#if selectedStation}
              <span class="badge preset-tonal-surface">{signalLevel(selectedStation)}</span>
              <span class="badge preset-tonal-surface">{streamLabel(selectedStation)}</span>
              {#if selectedStation.votes > 0}
                <span class="badge preset-tonal-surface"
                  >{formatCount(selectedStation.votes)} votes</span
                >
              {/if}
              {#if selectedStation.homepage}
                <a
                  class="badge preset-tonal-surface hover:preset-tonal"
                  href={selectedStation.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Site
                  <ExternalLink size={13} />
                </a>
              {/if}
            {:else}
              <span class="badge preset-tonal-surface">Radio Browser</span>
              <span class="badge preset-tonal-surface">animated signal</span>
            {/if}
          </div>
        </div>
      </div>

      <div class="mx-auto w-full max-w-3xl space-y-3">
        <div class="grid gap-3 md:grid-cols-[auto_minmax(10rem,1fr)_auto] md:items-center">
          <button
            class="btn preset-filled-primary min-h-14 justify-center px-8 text-base"
            onclick={togglePlayback}
          >
            {#if isPlaying}
              <Pause size={24} />
              Pause
            {:else}
              <Play size={24} />
              Play
            {/if}
          </button>
          <label class="flex items-center gap-3">
            <span class="text-xs font-semibold uppercase tracking-widest text-surface-500"
              >Volume</span
            >
            <input
              class="input w-full"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              oninput={changeVolume}
              aria-label="Volume"
            />
          </label>
          <audio
            class="hidden"
            bind:this={audioEl}
            src={selectedStation?.url_resolved ?? undefined}
            onplay={() => {
              isPlaying = true;
              startVisualizer();
            }}
            onpause={() => {
              isPlaying = false;
              window.cancelAnimationFrame(animationFrame);
            }}
            onended={() => {
              isPlaying = false;
              window.cancelAnimationFrame(animationFrame);
            }}
            onerror={() => {
              isPlaying = false;
              window.cancelAnimationFrame(animationFrame);
              playError = 'This stream could not be played by the browser.';
            }}
          >
            <track kind="captions" />
          </audio>
          <button
            class="btn preset-tonal min-h-14 justify-center px-6"
            onclick={surpriseMe}
            disabled={visibleStations.length === 0}
          >
            <Shuffle size={20} />
            Surprise me
          </button>
        </div>
        {#if playError}
          <p class="text-sm text-error-500">{playError}</p>
        {/if}
      </div>
    </div>
  </article>

  {#if loadState === 'loading'}
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {#each [0, 1, 2, 3, 4, 5] as item (item)}
        <div
          class="card preset-filled-surface-100-900 border-surface-200-800 animate-pulse space-y-3 border-[1px] p-4"
        >
          <div class="bg-surface-300-700 h-10 w-10 rounded-base"></div>
          <div class="bg-surface-300-700 h-5 w-3/4 rounded"></div>
          <div class="bg-surface-200-800 h-3 w-full rounded"></div>
          <div class="bg-surface-200-800 h-3 w-2/3 rounded"></div>
        </div>
      {/each}
    </div>
  {:else if loadState === 'error'}
    <aside class="card preset-tonal-error p-5">
      <p class="font-semibold">Could not load radio stations</p>
      <p class="mt-2 text-sm">{errorMessage}</p>
      <button class="btn preset-outlined mt-4" onclick={loadStations}>Retry</button>
    </aside>
  {:else if visibleStations.length === 0}
    <div class="card preset-tonal-surface-500 p-5">
      No stations found. Try clearing one filter or searching a broader name.
    </div>
  {:else}
    <section
      class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border-[1px] p-4"
    >
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_auto] lg:items-end">
        <div class="space-y-1">
          <label
            class="text-xs font-semibold uppercase tracking-widest text-surface-400"
            for="radio-search"
          >
            Search stations
          </label>
          <div class="relative">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
              size={17}
            />
            <input
              id="radio-search"
              class="input input-sm w-full min-w-0 pl-9"
              bind:value={query}
              placeholder="Search by station name..."
            />
          </div>
        </div>

        <label class="min-w-0 space-y-1">
          <span class="text-xs font-semibold uppercase tracking-widest text-surface-400"
            >Country</span
          >
          <select
            class="select select-sm w-full min-w-0"
            bind:value={country}
            disabled={metaState === 'loading'}
          >
            <option value="all">All countries</option>
            {#each countries as item (item.iso_3166_1)}
              <option value={item.iso_3166_1}>
                {item.name} ({formatCount(item.stationcount)})
              </option>
            {/each}
          </select>
        </label>

        <div class="flex flex-wrap gap-2">
          <button
            class="btn btn-sm preset-tonal"
            onclick={surpriseMe}
            disabled={visibleStations.length === 0}
          >
            <Shuffle size={16} />
            Random
          </button>
          <button class="btn btn-sm preset-tonal" onclick={resetFilters}>Clear</button>
          <button
            class="btn btn-sm preset-tonal"
            onclick={loadStations}
            disabled={loadState === 'loading'}
          >
            Reload
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 text-xs">
        <span class="badge preset-tonal-surface">{visibleStations.length} stations</span>
      </div>

      <div class="space-y-2">
        {#each visibleStations as station (station.stationuuid)}
          <div
            class="border-surface-200-800 bg-surface-50-950 rounded-base border transition {selectedStation?.stationuuid ===
            station.stationuuid
              ? 'ring-primary-500/35 bg-primary-500/8 ring-1'
              : ''}"
          >
            <div class="flex items-center gap-3 p-3">
              <button
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                onclick={() => playStation(station)}
                aria-label={`Play ${station.name}`}
              >
                <div
                  class="preset-tonal-surface flex size-11 shrink-0 items-center justify-center rounded-base p-2"
                >
                  {#if station.favicon}
                    <img
                      class="max-h-full max-w-full rounded-base object-contain"
                      src={station.favicon}
                      alt=""
                      loading="lazy"
                    />
                  {:else}
                    <Radio size={24} />
                  {/if}
                </div>

                <div class="min-w-0 flex-1 space-y-1.5">
                  <div class="flex items-center gap-2">
                    <h2 class="truncate font-semibold" title={station.name}>
                      {station.name.trim()}
                    </h2>
                    {#if selectedStation?.stationuuid === station.stationuuid && isPlaying}
                      <span class="badge preset-filled-primary shrink-0 text-[0.65rem]">Live</span>
                    {/if}
                  </div>
                  <p class="truncate text-sm text-surface-500">{stationSubtitle(station)}</p>
                  <div class="flex flex-wrap gap-2 text-xs">
                    <span class="badge preset-outlined-primary">{streamLabel(station)}</span>
                    {#if station.votes > 0}
                      <span class="badge preset-outlined-primary"
                        >{formatCount(station.votes)} votes</span
                      >
                    {/if}
                    {#if stationTags(station)[0]}
                      <span class="badge preset-outlined-primary">{stationTags(station)[0]}</span>
                    {/if}
                  </div>
                </div>
              </button>

              <div class="flex shrink-0 items-center gap-2">
                {#if station.homepage}
                  <a
                    class="btn btn-sm preset-tonal"
                    href={station.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Site
                    <ExternalLink size={14} />
                  </a>
                {/if}

                <button
                  class="btn btn-sm {selectedStation?.stationuuid === station.stationuuid &&
                  isPlaying
                    ? 'preset-filled-primary'
                    : 'preset-tonal'}"
                  onclick={() => playStation(station)}
                >
                  {selectedStation?.stationuuid === station.stationuuid && isPlaying
                    ? 'Live'
                    : 'Play'}
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>
