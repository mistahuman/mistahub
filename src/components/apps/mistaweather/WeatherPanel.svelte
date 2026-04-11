<script lang="ts">
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import {
    Cloud,
    CloudFog,
    CloudLightning,
    CloudRain,
    CloudSnow,
    CloudSun,
    Sun,
  } from 'lucide-svelte';
  import { onMount } from 'svelte';

  type LoadState = 'idle' | 'loading' | 'ready' | 'error';
  type SearchState = 'idle' | 'loading' | 'ready' | 'error';

  interface Place {
    id: number;
    name: string;
    latitude: number;
    longitude: number;
    country: string;
    country_code: string;
    admin1?: string;
    admin2?: string;
    timezone?: string;
  }

  interface GeocodingResponse {
    results?: Place[];
  }

  interface WeatherResponse {
    current: {
      time: string;
      temperature_2m: number;
      apparent_temperature: number;
      relative_humidity_2m: number;
      precipitation: number;
      weather_code: number;
      wind_speed_10m: number;
    };
    current_units: Record<string, string>;
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_sum: number[];
    };
    daily_units: Record<string, string>;
  }

  const STORAGE_KEY = 'mistaweather-selected-place';
  const DEFAULT_PLACE: Place = {
    id: 3181928,
    name: 'Bologna',
    latitude: 44.49381,
    longitude: 11.33875,
    country: 'Italia',
    country_code: 'IT',
    admin1: 'Emilia-Romagna',
    admin2: 'Bologna',
    timezone: 'Europe/Rome',
  };

  let searchState = $state<SearchState>('idle');
  let weatherState = $state<LoadState>('idle');
  let errorMessage = $state('');
  let searchQuery = $state('');
  let places = $state<Place[]>([DEFAULT_PLACE]);
  let selectedPlace = $state<Place>(DEFAULT_PLACE);
  let weather = $state<WeatherResponse | null>(null);

  const placeItems = $derived(() =>
    places.map((place) => ({
      label: placeLabel(place),
      value: String(place.id),
    })),
  );

  const placeCollection = $derived(collection({ items: placeItems() }));

  const selectedLabel = $derived(placeLabel(selectedPlace));

  const dailyRows = $derived(
    weather
      ? weather.daily.time.map((date, index) => ({
          date,
          code: weather.daily.weather_code[index],
          min: weather.daily.temperature_2m_min[index],
          max: weather.daily.temperature_2m_max[index],
          rain: weather.daily.precipitation_sum[index],
        }))
      : [],
  );

  const todayForecast = $derived(dailyRows[0] ?? null);

  $effect(() => {
    const query = searchQuery.trim();
    if (query.length < 3) return;

    const timeout = window.setTimeout(() => {
      searchPlaces(query);
    }, 300);

    return () => window.clearTimeout(timeout);
  });

  function placeLabel(place: Place): string {
    const area = [place.admin2, place.admin1, place.country_code].filter(Boolean).join(', ');
    return area ? `${place.name} (${area})` : place.name;
  }

  function weatherLabel(code: number): string {
    if (code === 0) return 'Clear';
    if ([1, 2, 3].includes(code)) return 'Clouds';
    if ([45, 48].includes(code)) return 'Fog';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
    if ([95, 96, 99].includes(code)) return 'Storm';
    return 'Variable';
  }

  function weatherPreset(code: number): string {
    if (code === 0) return 'preset-tonal-success';
    if ([1, 2, 3, 45, 48].includes(code)) return 'preset-tonal-surface';
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code))
      return 'preset-tonal-warning';
    if ([95, 96, 99].includes(code)) return 'preset-tonal-error';
    return 'preset-tonal-surface';
  }

  function weatherIcon(code: number) {
    if (code === 0) return Sun;
    if ([1, 2].includes(code)) return CloudSun;
    if (code === 3) return Cloud;
    if ([45, 48].includes(code)) return CloudFog;
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return CloudRain;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow;
    if ([95, 96, 99].includes(code)) return CloudLightning;
    return CloudSun;
  }

  function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(new Date(`${date}T12:00:00`));
  }

  function restorePlace(): Place {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? ({ ...DEFAULT_PLACE, ...JSON.parse(raw) } as Place) : DEFAULT_PLACE;
    } catch {
      return DEFAULT_PLACE;
    }
  }

  function savePlace(place: Place): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }

  async function searchPlaces(query: string): Promise<void> {
    searchState = 'loading';

    try {
      const params = new URLSearchParams({
        name: query,
        count: '10',
        language: 'it',
        format: 'json',
      });
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const payload = (await res.json()) as GeocodingResponse;
      places = payload.results?.length ? payload.results : [selectedPlace];
      searchState = 'ready';
      console.log('mistaweather geocoding results', payload);
    } catch (error) {
      searchState = 'error';
      console.error('mistaweather geocoding error', error);
    }
  }

  async function loadWeather(place = selectedPlace): Promise<void> {
    weatherState = 'loading';
    errorMessage = '';

    try {
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current:
          'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
        forecast_days: '7',
        timezone: place.timezone ?? 'auto',
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const payload = (await res.json()) as WeatherResponse;
      weather = payload;
      weatherState = 'ready';
      console.log('mistaweather forecast payload', payload);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      weatherState = 'error';
      console.error('mistaweather forecast error', error);
    }
  }

  function selectPlace(id: string): void {
    const picked = places.find((place) => String(place.id) === id);
    if (!picked) return;

    selectedPlace = picked;
    searchQuery = '';
    places = [picked, ...places.filter((place) => place.id !== picked.id)];
    savePlace(picked);
    loadWeather(picked);
  }

  function resetSearch(): void {
    searchQuery = '';
    places = [selectedPlace, ...places.filter((place) => place.id !== selectedPlace.id)];
  }

  onMount(() => {
    const saved = restorePlace();
    selectedPlace = saved;
    places = [saved];
    loadWeather(saved);
  });
</script>

<div class="mx-auto w-full max-w-5xl space-y-4">
  <section class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border p-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div class="space-y-2">
        <p class="max-w-2xl text-sm text-surface-600-400">
          Search a place, keep it saved, and read the current weather with a short forecast.
        </p>
      </div>
      <button
        class="btn btn-sm preset-tonal"
        onclick={() => loadWeather()}
        disabled={weatherState === 'loading'}
      >
        {weatherState === 'loading' ? 'Loading...' : 'Reload'}
      </button>
    </div>

    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Place</span>
        {#key selectedPlace.id}
          <Combobox
            collection={placeCollection}
            defaultValue={[String(selectedPlace.id)]}
            defaultInputValue={selectedLabel}
            disabled={weatherState === 'loading'}
            onInputValueChange={(d) => {
              searchQuery = d.inputValue;
            }}
            onValueChange={(d) => {
              const picked = d.value[0];
              if (picked) selectPlace(picked);
            }}
            onOpenChange={(d) => {
              if (d.open) resetSearch();
            }}
            openOnClick
          >
            <Combobox.Control>
              <Combobox.Input
                class="input w-full min-w-0 truncate"
                placeholder="Search city..."
                onclick={resetSearch}
              />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-72 w-full overflow-y-auto border"
              >
                {#each placeCollection.items as item (item.value)}
                  <Combobox.Item
                    {item}
                    class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal {item.value ===
                    String(selectedPlace.id)
                      ? 'preset-tonal-primary'
                      : ''}"
                  >
                    <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  </Combobox.Item>
                {/each}
                {#if searchState === 'loading'}
                  <div class="px-3 py-2 text-sm text-surface-500">Searching...</div>
                {:else if searchState === 'ready' && placeCollection.items.length === 0}
                  <div class="px-3 py-2 text-sm text-surface-500">No places found</div>
                {/if}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}
      </div>

      <div class="flex flex-wrap gap-2 text-xs">
        <span class="badge preset-outlined">{selectedPlace.latitude.toFixed(2)} lat</span>
        <span class="badge preset-outlined">{selectedPlace.longitude.toFixed(2)} lon</span>
      </div>
    </div>
  </section>

  {#if weatherState === 'loading'}
    <div class="card preset-tonal p-5">Loading weather...</div>
  {:else if weatherState === 'error'}
    <aside class="card preset-tonal-error p-5">
      <p class="font-semibold">Could not load weather</p>
      <p class="mt-2 text-sm">{errorMessage}</p>
    </aside>
  {:else if weather}
    <section class="space-y-4">
      <article class="card preset-filled-surface-100-900 border-surface-200-800 border p-5">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="flex items-start gap-4">
            {#if true}
              {@const CurrentIcon = weatherIcon(weather.current.weather_code)}
              <div class="card {weatherPreset(weather.current.weather_code)} p-3">
                <CurrentIcon size={42} strokeWidth={1.8} />
              </div>
            {/if}
            <div>
              <p class="text-sm uppercase tracking-wide text-surface-500">{selectedLabel}</p>
              <div class="mt-2 flex flex-wrap items-end gap-3">
                <h2 class="text-5xl font-bold tabular-nums">
                  {Math.round(weather.current.temperature_2m)}°C
                </h2>
                {#if todayForecast}
                  <div class="mb-1 flex flex-wrap gap-2">
                    <span class="badge preset-outlined">
                      min {Math.round(todayForecast.min)}°
                    </span>
                    <span class="badge preset-outlined">
                      max {Math.round(todayForecast.max)}°
                    </span>
                  </div>
                {/if}
              </div>
              <p class="mt-2 text-lg font-semibold">{weatherLabel(weather.current.weather_code)}</p>
            </div>
          </div>
          <span class="badge preset-outlined w-fit">
            feels {Math.round(weather.current.apparent_temperature)}°C
          </span>
        </div>

        <div class="mt-5 grid gap-3 sm:grid-cols-3">
          <div class="card preset-tonal-surface border-surface-200-800 border p-3">
            <p class="text-xs uppercase tracking-wide text-surface-500">Humidity</p>
            <p class="mt-1 text-lg font-semibold">{weather.current.relative_humidity_2m}%</p>
          </div>
          <div class="card preset-tonal-surface border-surface-200-800 border p-3">
            <p class="text-xs uppercase tracking-wide text-surface-500">Rain</p>
            <p class="mt-1 text-lg font-semibold">{weather.current.precipitation} mm</p>
          </div>
          <div class="card preset-tonal-surface border-surface-200-800 border p-3">
            <p class="text-xs uppercase tracking-wide text-surface-500">Wind</p>
            <p class="mt-1 text-lg font-semibold">{weather.current.wind_speed_10m} km/h</p>
          </div>
        </div>
      </article>

      <section class="card preset-filled-surface-100-900 border-surface-200-800 border p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">Forecast</h2>
          <span class="badge preset-outlined">{dailyRows.length} days</span>
        </div>

        {#if dailyRows.length === 0}
          <div class="card preset-tonal-surface p-4">No forecast data reported.</div>
        {:else}
          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {#each dailyRows as day (day.date)}
              {@const DayIcon = weatherIcon(day.code)}
              <article
                class="card preset-tonal-surface border-surface-200-800 flex items-center justify-between gap-4 border p-4"
              >
                <div class="flex min-w-0 items-center gap-3">
                  <div class="card {weatherPreset(day.code)} shrink-0 p-2">
                    <DayIcon size={24} strokeWidth={1.8} />
                  </div>
                  <div class="min-w-0">
                    <p class="font-semibold">{formatDate(day.date)}</p>
                    <p class="text-sm text-surface-500">{weatherLabel(day.code)}</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-semibold tabular-nums">
                    {Math.round(day.min)}° / {Math.round(day.max)}°
                  </p>
                  <p class="text-sm text-surface-500">{day.rain} mm</p>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </section>
    </section>
  {/if}
</div>
