<script lang="ts">
  import { CalendarDays, ExternalLink, MapPin, RotateCcw, Search, Ticket } from 'lucide-svelte';
  import { onMount } from 'svelte';

  type LoadState = 'loading' | 'ready' | 'error';
  type RangeFilter = 'today' | 'week' | 'all';

  interface BolognaEvent {
    id: string;
    title: string;
    description: string | null;
    url: string;
    address: string | null;
    categories_1: string | null;
    categories_2: string | null;
    categories_3: string | null;
    online: string | null;
    start: string;
    end: string | null;
    date_multiple: string | null;
    quartiere: string | null;
    zona_di_prossimita: string | null;
    area_statistica: string | null;
  }

  interface ApiResponse {
    total_count: number;
    results: BolognaEvent[];
  }

  const API_URL =
    'https://opendata.comune.bologna.it/api/explore/v2.1/catalog/datasets/eventi-bologna-agenda-cultura/records';
  const STORAGE_KEY = 'mistabolo-filters';
  const PAGE_SIZE = 100;
  const MAX_RECORDS = 700;

  let loadState = $state<LoadState>('loading');
  let errorMessage = $state('');
  let events = $state<BolognaEvent[]>([]);
  let totalCount = $state(0);
  let category = $state('all');
  let district = $state('all');
  let range = $state<RangeFilter>('week');
  let query = $state('');
  let filtersRestored = $state(false);

  const today = $derived(todayDate());
  const weekLimit = $derived(addDays(today, 7));

  const categories = $derived(
    [...new Set(events.flatMap(eventCategories))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  );

  const districts = $derived(
    [...new Set(events.map((event) => event.quartiere).filter(Boolean) as string[])].sort((a, b) =>
      a.localeCompare(b),
    ),
  );

  const filteredEvents = $derived(
    events
      .filter((event) => category === 'all' || eventCategories(event).includes(category))
      .filter((event) => district === 'all' || event.quartiere === district)
      .filter((event) => matchesRange(event))
      .filter((event) => matchesQuery(event))
      .sort((a, b) => nextEventTime(a) - nextEventTime(b) || a.title.localeCompare(b.title)),
  );

  $effect(() => {
    if (!filtersRestored) return;
    saveFilters();
  });

  function todayDate(): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDays(date: string, amount: number): string {
    const d = new Date(dateTime(date) + amount * 24 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function dateTime(date: string): number {
    return new Date(`${date}T12:00:00`).getTime();
  }

  function eventCategories(event: BolognaEvent): string[] {
    return [event.categories_1, event.categories_2, event.categories_3].filter(Boolean) as string[];
  }

  function multipleDates(event: BolognaEvent): string[] {
    return (
      event.date_multiple
        ?.split(',')
        .map((date) => date.trim())
        .filter(Boolean) ?? []
    );
  }

  function nextEventDate(event: BolognaEvent): string {
    const upcomingMultiple = multipleDates(event).find((date) => date >= today);
    if (upcomingMultiple) return upcomingMultiple;
    if (event.start >= today) return event.start;
    if (event.end && event.end >= today) return today;
    return event.start;
  }

  function nextEventTime(event: BolognaEvent): number {
    return dateTime(nextEventDate(event));
  }

  function isToday(event: BolognaEvent): boolean {
    if (multipleDates(event).includes(today)) return true;
    const end = event.end ?? event.start;
    return event.start <= today && end >= today;
  }

  function matchesRange(event: BolognaEvent): boolean {
    if (range === 'all') return true;
    const next = nextEventDate(event);
    if (range === 'today') return isToday(event);
    return next >= today && next <= weekLimit;
  }

  function matchesQuery(event: BolognaEvent): boolean {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    return [event.title, event.description, event.address, event.zona_di_prossimita]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(normalized);
  }

  function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    }).format(new Date(`${date}T12:00:00`));
  }

  function dateLabel(event: BolognaEvent): string {
    const next = nextEventDate(event);
    if (isToday(event)) return 'today';
    return formatDate(next);
  }

  function eventSpan(event: BolognaEvent): string {
    if (!event.end || event.end === event.start) return formatDate(event.start);
    return `${formatDate(event.start)} - ${formatDate(event.end)}`;
  }

  function shortDescription(event: BolognaEvent): string {
    const text = event.description?.replace(/\s+/g, ' ').trim() ?? '';
    if (!text) return 'Details are available on the official Cultura Bologna page.';
    return text.length > 170 ? `${text.slice(0, 167)}...` : text;
  }

  function categoryLabel(event: BolognaEvent): string {
    return event.categories_1 ?? event.categories_2 ?? event.categories_3 ?? 'event';
  }

  function loadFilters(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
        category?: string;
        district?: string;
        range?: RangeFilter;
      };
      category = saved.category ?? 'all';
      district = saved.district ?? 'all';
      range = saved.range ?? 'week';
    } catch {
      category = 'all';
      district = 'all';
      range = 'week';
    }
  }

  function saveFilters(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ category, district, range }));
    } catch {
      // localStorage can be unavailable in private contexts.
    }
  }

  function resetFilters(): void {
    category = 'all';
    district = 'all';
    range = 'week';
    query = '';
  }

  function buildUrl(offset: number): string {
    const where = `(start >= date'${today}' OR end >= date'${today}') AND area_statistica != "Fuori Bologna"`;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      order_by: 'start',
      where,
    });
    return `${API_URL}?${params}`;
  }

  async function load(): Promise<void> {
    loadState = 'loading';
    errorMessage = '';

    try {
      const collected: BolognaEvent[] = [];
      let total = 0;

      for (let offset = 0; offset < MAX_RECORDS; offset += PAGE_SIZE) {
        const res = await fetch(buildUrl(offset));
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

        const payload = (await res.json()) as ApiResponse;
        total = payload.total_count;
        collected.push(...payload.results);

        if (collected.length >= total || payload.results.length < PAGE_SIZE) break;
      }

      events = collected;
      totalCount = total;
      loadState = 'ready';

      console.log('mistabolo Bologna events', { total, collected });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
      loadState = 'error';
      console.error('mistabolo load error', error);
    }
  }

  onMount(() => {
    loadFilters();
    filtersRestored = true;
    load();
  });
</script>

<div class="mx-auto w-full max-w-6xl space-y-4">
  <section class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border p-4">
    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <p class="max-w-3xl text-sm text-surface-600-400">
        Browse official public events in Bologna by name, category, district, and date.
      </p>
      <button class="btn btn-sm preset-tonal" onclick={load} disabled={loadState === 'loading'}>
        <RotateCcw size={16} />
        {loadState === 'loading' ? 'Loading...' : 'Reload'}
      </button>
    </div>

    <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Search</span>
        <div class="relative">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-500"
            size={17}
          />
          <input
            class="input w-full min-w-0 pl-9"
            bind:value={query}
            placeholder="Search title, place, area..."
          />
        </div>
      </label>
    </div>

    <div
      class="grid gap-3 md:grid-cols-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400">Period</span>
        <select class="select w-full min-w-0" bind:value={range} disabled={loadState !== 'ready'}>
          <option value="week">This week</option>
          <option value="today">Today</option>
          <option value="all">All upcoming</option>
        </select>
      </label>

      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400"
          >Category</span
        >
        <select
          class="select w-full min-w-0"
          bind:value={category}
          disabled={loadState !== 'ready'}
        >
          <option value="all">All categories</option>
          {#each categories as item (item)}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>

      <label class="min-w-0 space-y-1">
        <span class="text-xs font-semibold uppercase tracking-widest text-surface-400"
          >District</span
        >
        <select
          class="select w-full min-w-0"
          bind:value={district}
          disabled={loadState !== 'ready'}
        >
          <option value="all">All districts</option>
          {#each districts as item (item)}
            <option value={item}>{item}</option>
          {/each}
        </select>
      </label>

      <div class="flex items-end">
        <button class="btn preset-tonal w-full md:w-auto" onclick={resetFilters}>
          Clear filters
        </button>
      </div>
    </div>

    {#if loadState === 'ready'}
      <div class="flex flex-wrap gap-2 text-xs">
        <span class="badge preset-outlined">{filteredEvents.length} shown</span>
        <span class="badge preset-outlined">{events.length} loaded</span>
        <span class="badge preset-outlined">{totalCount} available</span>
      </div>
    {/if}
  </section>

  {#if loadState === 'loading'}
    <div class="grid gap-3 md:grid-cols-2">
      {#each [0, 1, 2, 3] as item (item)}
        <div
          class="card preset-filled-surface-100-900 border-surface-200-800 animate-pulse space-y-3 border p-4"
        >
          <div class="bg-surface-300-700 h-4 w-24 rounded"></div>
          <div class="bg-surface-300-700 h-6 w-3/4 rounded"></div>
          <div class="bg-surface-200-800 h-3 w-full rounded"></div>
          <div class="bg-surface-200-800 h-3 w-2/3 rounded"></div>
        </div>
      {/each}
    </div>
  {:else if loadState === 'error'}
    <aside class="card preset-tonal-error p-5">
      <p class="font-semibold">Could not load Bologna events</p>
      <p class="mt-2 text-sm">{errorMessage}</p>
      <button class="btn preset-outlined mt-4" onclick={load}>Retry</button>
    </aside>
  {:else if filteredEvents.length === 0}
    <div class="card preset-tonal-surface p-5">
      No events found with these filters. Try widening period, category, or district.
    </div>
  {:else}
    <section class="grid gap-4 md:grid-cols-2">
      {#each filteredEvents.slice(0, 60) as event (event.id)}
        <article
          class="card preset-filled-surface-100-900 border-surface-200-800 flex min-h-full flex-col gap-4 border p-4"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <div class="card preset-tonal-primary shrink-0 p-2">
                <CalendarDays size={22} />
              </div>
              <div class="min-w-0">
                <p class="text-xs font-semibold uppercase tracking-wide text-surface-500">
                  {dateLabel(event)}
                </p>
                <h2 class="mt-1 text-lg font-semibold leading-snug">{event.title}</h2>
              </div>
            </div>
            <span class="badge preset-tonal-surface shrink-0">{categoryLabel(event)}</span>
          </div>

          <p class="text-sm leading-relaxed text-surface-600-400">{shortDescription(event)}</p>

          <div class="mt-auto space-y-3">
            <div class="flex flex-wrap gap-2 text-xs">
              <span class="badge preset-outlined">
                <Ticket size={14} />
                {eventSpan(event)}
              </span>
              {#if event.quartiere}
                <span class="badge preset-outlined">{event.quartiere}</span>
              {/if}
              {#if event.online === 'SI'}
                <span class="badge preset-tonal-secondary">online</span>
              {/if}
            </div>

            {#if event.address}
              <p class="flex items-start gap-2 text-sm text-surface-600-400">
                <MapPin class="mt-0.5 shrink-0" size={16} />
                <span>{event.address}</span>
              </p>
            {/if}

            <a
              class="btn btn-sm preset-tonal-primary w-fit"
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open event
              <ExternalLink size={15} />
            </a>
          </div>
        </article>
      {/each}
    </section>

    {#if filteredEvents.length > 60}
      <p class="text-center text-sm text-surface-500">
        Showing the first 60 events. Use filters to narrow the list.
      </p>
    {/if}
  {/if}
</div>
