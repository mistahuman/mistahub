<script lang="ts">
  import { fade, slide } from 'svelte/transition';

  type KVPair = { key: string; value: string };
  type AppState = 'idle' | 'loading' | 'success' | 'error';
  type Example = {
    label: string;
    description: string;
    url: string;
    params?: KVPair[];
    paramDocs?: { key: string; hint: string }[];
    flow?: string;
    tip?: string;
  };

  const EXAMPLES: Example[] = [
    {
      label: 'GitHub — search repositories',
      description: 'Search public GitHub repositories by keyword, language, or user.',
      url: 'https://api.github.com/search/repositories',
      params: [
        { key: 'q', value: 'svelte' },
        { key: 'sort', value: 'stars' },
        { key: 'per_page', value: '5' },
      ],
      paramDocs: [
        {
          key: 'q',
          hint: 'Search query. Supports filters: language:typescript, user:sveltejs, stars:>1000',
        },
        { key: 'sort', hint: 'Sort field — stars · forks · updated · help-wanted-issues' },
        { key: 'per_page', hint: 'Results per page, max 100' },
      ],
      tip: 'Unauthenticated requests are limited to 10/min. Add an Authorization: Bearer <token> header to raise the limit to 30/min.',
    },
    {
      label: 'Wikipedia — article summary',
      description: 'Fetch a plain-text summary and metadata for any Wikipedia article.',
      url: 'https://en.wikipedia.org/api/rest_v1/page/summary/Svelte',
      tip: 'Replace Svelte at the end of the URL with any article title. Spaces become underscores — e.g. New_York_City. The response includes extract (plain text), thumbnail, and coordinates when available.',
    },
    {
      label: 'Hacker News — story item',
      description: 'Fetch a single story with full metadata from the HN Firebase REST API.',
      url: 'https://hacker-news.firebaseio.com/v0/item/1.json',
      flow: 'This is a two-step API. First call /v0/topstories.json (or beststories / newstories) to get a ranked list of up to 500 IDs. Then fetch each story individually with /v0/item/{id}.json — exactly the pattern mistanews uses to build its feed.',
      tip: 'A story item includes: id, title, url, score, by (author username), time (Unix timestamp), descendants (total comment count), and kids (top-level comment IDs). Comments are also items — fetch them recursively via the same endpoint.',
    },
    {
      label: 'Open-Meteo — weather forecast',
      description: 'Current weather and hourly forecast for any location. No API key required.',
      url: 'https://api.open-meteo.com/v1/forecast',
      params: [
        { key: 'latitude', value: '44.49' },
        { key: 'longitude', value: '11.34' },
        { key: 'current_weather', value: 'true' },
        { key: 'hourly', value: 'temperature_2m,precipitation' },
      ],
      paramDocs: [
        { key: 'latitude', hint: 'Decimal degrees. 44.49 = Bologna, 41.89 = Rome, 45.46 = Milan' },
        { key: 'longitude', hint: 'Decimal degrees — pair with latitude' },
        {
          key: 'current_weather',
          hint: 'Set to true to include a current_weather object with temperature, windspeed, and WMO weather code',
        },
        {
          key: 'hourly',
          hint: 'Comma-separated variables: temperature_2m, precipitation, windspeed_10m, weathercode',
        },
      ],
      flow: 'mistaweather uses a two-step flow: first geocode a city name via api.geocoding.open-meteo.com/v1/search?name={city}&count=1 to get latitude and longitude, then call this forecast endpoint with those coordinates.',
      tip: 'WMO weather codes: 0 = clear sky, 61–67 = rain, 71–77 = snow, 95 = thunderstorm. All hourly arrays share the same index with hourly.time.',
    },
  ];

  let showExamples = $state(false);

  function loadExample(ex: Example) {
    url = ex.url;
    params = ex.params ? [...ex.params, { key: '', value: '' }] : [{ key: '', value: '' }];
    headers = [{ key: '', value: '' }];
    status = 'idle';
    responseStatus = null;
    responseText = '';
    responseJson = null;
    errorMessage = '';
    showExamples = false;
    activeSection = 'params';
  }

  let url = $state('');
  let params = $state<KVPair[]>([{ key: '', value: '' }]);
  let headers = $state<KVPair[]>([{ key: '', value: '' }]);
  let activeSection = $state<'params' | 'headers'>('params');

  let status = $state<AppState>('idle');
  let responseStatus = $state<number | null>(null);
  let responseText = $state<string>('');
  let responseJson = $state<unknown>(null);
  let errorMessage = $state<string>('');
  let activeTab = $state<'pretty' | 'raw'>('pretty');
  let copied = $state(false);

  let filledParamCount = $derived(params.filter((p) => p.key.trim()).length);
  let filledHeaderCount = $derived(headers.filter((h) => h.key.trim()).length);

  function addParam() {
    params = [...params, { key: '', value: '' }];
  }

  function removeParam(i: number) {
    params = params.filter((_, idx) => idx !== i);
  }

  function addHeader() {
    headers = [...headers, { key: '', value: '' }];
  }

  function removeHeader(i: number) {
    headers = headers.filter((_, idx) => idx !== i);
  }

  function buildUrl(): string {
    const filled = params.filter((p) => p.key.trim());
    if (filled.length === 0) return url.trim();
    const qs = new URLSearchParams(filled.map((p) => [p.key.trim(), p.value])).toString();
    const base = url.trim().split('?')[0];
    return `${base}?${qs}`;
  }

  function buildHeaders(): Record<string, string> {
    return Object.fromEntries(
      headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]),
    );
  }

  async function sendRequest() {
    const finalUrl = buildUrl();
    if (!finalUrl) return;

    status = 'loading';
    responseStatus = null;
    responseText = '';
    responseJson = null;
    errorMessage = '';
    activeTab = 'pretty';

    try {
      const res = await fetch(finalUrl, { method: 'GET', headers: buildHeaders() });
      responseStatus = res.status;
      const text = await res.text();
      responseText = text;

      if (!res.ok) {
        errorMessage = `HTTP ${res.status} ${res.statusText}`;
        status = 'error';
        return;
      }

      try {
        responseJson = JSON.parse(text);
        status = 'success';
      } catch {
        errorMessage = 'Response is not valid JSON.';
        status = 'error';
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      status = 'error';
    }
  }

  async function copyToClipboard() {
    if (!responseText) return;
    await navigator.clipboard.writeText(responseText);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }

  function statusBadgeClass(code: number): string {
    if (code >= 200 && code < 300) return 'badge preset-tonal-success';
    if (code >= 400) return 'badge preset-tonal-error';
    return 'badge preset-outlined';
  }
</script>

<div class="space-y-4">
  <!-- Examples toggle -->
  <div class="space-y-3">
    <div class="flex justify-end">
      <button
        onclick={() => (showExamples = !showExamples)}
        class="btn btn-sm {showExamples ? 'preset-tonal-primary' : 'preset-tonal'} gap-1.5"
      >
        Examples
        <span class="text-[10px] leading-none">{showExamples ? '▴' : '▾'}</span>
      </button>
    </div>

    {#if showExamples}
      <div class="space-y-3">
        {#each EXAMPLES as ex (ex.label)}
          <div
            class="card preset-filled-surface-100-900 border border-surface-200-800 p-4 space-y-3"
          >
            <!-- Header -->
            <div class="flex items-start justify-between gap-4">
              <div class="space-y-0.5">
                <p class="text-sm font-semibold">{ex.label}</p>
                <p class="text-xs text-surface-500">{ex.description}</p>
              </div>
              <button
                onclick={() => loadExample(ex)}
                class="btn btn-sm preset-filled-primary-500 shrink-0"
              >
                Load
              </button>
            </div>

            <!-- URL preview -->
            <code class="block truncate rounded bg-surface-200-800 px-2.5 py-1.5 text-xs">
              {ex.url}
            </code>

            <!-- Param docs -->
            {#if ex.paramDocs}
              <div class="space-y-1.5">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                  Parameters
                </p>
                {#each ex.paramDocs as pd (pd.key)}
                  <div class="flex items-baseline gap-3 text-xs">
                    <span class="badge preset-tonal-surface shrink-0 font-mono">{pd.key}</span>
                    <span class="text-surface-500">{pd.hint}</span>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Flow -->
            {#if ex.flow}
              <div class="space-y-1">
                <p class="text-[10px] font-semibold uppercase tracking-widest text-surface-500">
                  How it works
                </p>
                <p class="text-xs leading-relaxed text-surface-500">{ex.flow}</p>
              </div>
            {/if}

            <!-- Tip -->
            {#if ex.tip}
              <p
                class="border-l-2 border-surface-200-800 pl-3 text-xs leading-relaxed text-surface-500"
              >
                {ex.tip}
              </p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Request bar -->
  <div class="flex gap-2 items-stretch">
    <div
      class="flex items-center rounded bg-surface-200-800 px-3 text-xs font-mono font-semibold shrink-0 select-none"
    >
      GET
    </div>
    <input
      id="curl-url"
      type="url"
      placeholder="https://api.example.com/endpoint"
      bind:value={url}
      class="input flex-1 min-w-0"
    />
    <button
      onclick={sendRequest}
      disabled={!url.trim() || status === 'loading'}
      class="btn preset-filled-primary-500 shrink-0 transition-opacity disabled:opacity-50"
    >
      {status === 'loading' ? 'Sending…' : 'Send'}
    </button>
  </div>

  <!-- Params / Headers tabs -->
  <div class="card preset-filled-surface-100-900 border border-surface-200-800 overflow-hidden">
    <div class="flex gap-1 border-b border-surface-200-800 px-2 pt-2">
      <button
        onclick={() => (activeSection = 'params')}
        class="btn btn-sm rounded-b-none {activeSection === 'params'
          ? 'preset-tonal-primary'
          : 'hover:preset-tonal'}"
      >
        Params{filledParamCount > 0 ? ` (${filledParamCount})` : ''}
      </button>
      <button
        onclick={() => (activeSection = 'headers')}
        class="btn btn-sm rounded-b-none {activeSection === 'headers'
          ? 'preset-tonal-primary'
          : 'hover:preset-tonal'}"
      >
        Headers{filledHeaderCount > 0 ? ` (${filledHeaderCount})` : ''}
      </button>
    </div>

    <div class="space-y-2 p-3">
      {#if activeSection === 'params'}
        {#each params as pair, i (i)}
          <div in:slide={{ duration: 180 }} out:fade={{ duration: 150 }} class="flex gap-2">
            <input
              type="text"
              placeholder="key"
              bind:value={pair.key}
              class="input w-1/3 min-w-0"
            />
            <input
              type="text"
              placeholder="value"
              bind:value={pair.value}
              class="input min-w-0 flex-1"
            />
            <button
              onclick={() => removeParam(i)}
              class="btn-icon preset-tonal shrink-0"
              aria-label="Remove">×</button
            >
          </div>
        {/each}
        <button onclick={addParam} class="btn preset-tonal btn-sm">+ Add param</button>
      {:else}
        {#each headers as pair, i (i)}
          <div in:slide={{ duration: 180 }} out:fade={{ duration: 150 }} class="flex gap-2">
            <input
              type="text"
              placeholder="key"
              bind:value={pair.key}
              class="input w-1/3 min-w-0"
            />
            <input
              type="text"
              placeholder="value"
              bind:value={pair.value}
              class="input min-w-0 flex-1"
            />
            <button
              onclick={() => removeHeader(i)}
              class="btn-icon preset-tonal shrink-0"
              aria-label="Remove">×</button
            >
          </div>
        {/each}
        <button onclick={addHeader} class="btn preset-tonal btn-sm">+ Add header</button>
      {/if}
    </div>
  </div>

  <!-- Response panel -->
  <div class="card preset-filled-surface-100-900 border border-surface-200-800 min-h-48 p-5">
    {#key status}
      <div transition:fade={{ duration: 150 }}>
        {#if status === 'idle'}
          <p class="text-sm text-surface-500">Response will appear here.</p>
        {:else if status === 'loading'}
          <div class="animate-pulse space-y-3">
            <div class="bg-surface-300-700 h-3 w-3/4 rounded"></div>
            <div class="bg-surface-200-800 h-3 w-1/2 rounded"></div>
            <div class="bg-surface-200-800 h-3 w-2/3 rounded"></div>
          </div>
        {:else if status === 'error'}
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              {#if responseStatus}
                <span class={statusBadgeClass(responseStatus)}>{responseStatus}</span>
              {/if}
              <span class="text-sm font-medium">{errorMessage}</span>
            </div>
            {#if responseText}
              <pre
                class="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{responseText}</pre>
            {/if}
          </div>
        {:else if status === 'success'}
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                {#if responseStatus}
                  <span class={statusBadgeClass(responseStatus)}>{responseStatus}</span>
                {/if}
                <div class="flex gap-1">
                  <button
                    onclick={() => (activeTab = 'pretty')}
                    class="btn btn-sm {activeTab === 'pretty'
                      ? 'preset-tonal-primary'
                      : 'hover:preset-tonal'}"
                  >
                    Pretty
                  </button>
                  <button
                    onclick={() => (activeTab = 'raw')}
                    class="btn btn-sm {activeTab === 'raw'
                      ? 'preset-tonal-primary'
                      : 'hover:preset-tonal'}"
                  >
                    Raw
                  </button>
                </div>
              </div>
              <button onclick={copyToClipboard} class="btn preset-tonal btn-sm shrink-0">
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            {#if activeTab === 'pretty'}
              <pre class="overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(
                  responseJson,
                  null,
                  2,
                )}</pre>
            {:else}
              <pre
                class="overflow-x-auto whitespace-pre-wrap break-all text-xs">{responseText}</pre>
            {/if}
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>
