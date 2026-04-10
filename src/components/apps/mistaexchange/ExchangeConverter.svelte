<script lang="ts">
  import { ArrowLeftRight, Check } from 'lucide-svelte';
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';

  // ── Types ───────────────────────────────────────────────────────────────────

  type AppState = 'idle' | 'loading' | 'result' | 'error';

  // ── Constants ───────────────────────────────────────────────────────────────

  const STORAGE_KEY = 'mistaexchange';
  const DEFAULT_FROM = 'EUR';
  const DEFAULT_TO = 'USD';
  const DEBOUNCE_MS = 300;

  const CURRENCIES_URL = 'https://api.frankfurter.dev/v1/currencies';
  const RATE_URL = (from: string, to: string) =>
    `https://api.frankfurter.dev/v1/latest?from=${from}&to=${to}`;

  // ── Persistence helpers ──────────────────────────────────────────────────────

  function loadPair(): { from: string; to: string } {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.from === 'string' && typeof parsed.to === 'string') {
          return { from: parsed.from, to: parsed.to };
        }
      }
    } catch {
      // ignore malformed storage
    }
    return { from: DEFAULT_FROM, to: DEFAULT_TO };
  }

  function savePair(from: string, to: string): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ from, to }));
    } catch {
      // ignore storage errors (e.g. private browsing quota)
    }
  }

  // ── State ────────────────────────────────────────────────────────────────────

  const saved = loadPair();

  let currencies = $state<Record<string, string>>({});
  let fromCurrency = $state<string>(saved.from);
  let toCurrency = $state<string>(saved.to);
  let amount = $state<string>('');
  let result = $state<number | null>(null);
  let rate = $state<number | null>(null);
  let appState = $state<AppState>('idle');
  let errorMessage = $state<string | null>(null);

  // Combobox filter text (each selector tracks its own)
  let fromFilter = $state('');
  let toFilter = $state('');
  // Incremented on swap so {#key} re-mounts both comboboxes with updated defaults
  let swapKey = $state(0);

  // ── Currency list fetch ──────────────────────────────────────────────────────

  async function fetchCurrencies(): Promise<void> {
    try {
      const res = await fetch(CURRENCIES_URL);
      if (!res.ok) throw new Error(`Failed to fetch currencies: ${res.status}`);
      currencies = await res.json();
    } catch (e) {
      console.error('[mistaexchange] currency list fetch failed', e);
    }
  }

  // ── Conversion fetch ─────────────────────────────────────────────────────────

  async function fetchConversion(from: string, to: string, amountValue: number): Promise<void> {
    appState = 'loading';
    errorMessage = null;
    result = null;
    rate = null;

    try {
      const res = await fetch(RATE_URL(from, to));
      if (!res.ok) throw new Error(`Rate fetch failed: ${res.status}`);
      const data: { rates: Record<string, number> } = await res.json();
      const fetchedRate = data.rates[to];
      if (fetchedRate === undefined) throw new Error(`No rate returned for ${to}`);

      rate = fetchedRate;
      result = amountValue * fetchedRate;
      appState = 'result';
    } catch (e) {
      errorMessage = e instanceof Error ? e.message : String(e);
      console.error('[mistaexchange] conversion error', errorMessage);
      appState = 'error';
    }
  }

  // ── Debounced conversion trigger ─────────────────────────────────────────────

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleConversion(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer);

    const numericAmount = parseFloat(amount);
    if (!amount || isNaN(numericAmount) || numericAmount <= 0) {
      appState = 'idle';
      result = null;
      rate = null;
      return;
    }

    debounceTimer = setTimeout(() => {
      if (fromCurrency === toCurrency) {
        rate = 1;
        result = numericAmount;
        errorMessage = null;
        appState = 'result';
        return;
      }
      fetchConversion(fromCurrency, toCurrency, numericAmount);
    }, DEBOUNCE_MS);
  }

  // ── Swap ──────────────────────────────────────────────────────────────────────

  function swap(): void {
    [fromCurrency, toCurrency] = [toCurrency, fromCurrency];
    savePair(fromCurrency, toCurrency);
    fromFilter = '';
    toFilter = '';
    swapKey++;
    scheduleConversion();
  }

  // ── Reactive effects ─────────────────────────────────────────────────────────

  $effect(() => {
    fetchCurrencies();
  });

  $effect(() => {
    const _from = fromCurrency;
    const _to = toCurrency;
    savePair(_from, _to);
    scheduleConversion();
  });

  // ── Combobox collections ──────────────────────────────────────────────────────

  function makeItems(filter: string) {
    const lower = filter.toLowerCase();
    return Object.entries(currencies)
      .filter(
        ([code, name]) =>
          !filter || code.toLowerCase().includes(lower) || name.toLowerCase().includes(lower),
      )
      .map(([code]) => ({ label: code, value: code }));
  }

  const fromCollection = $derived(collection({ items: makeItems(fromFilter) }));
  const toCollection = $derived(collection({ items: makeItems(toFilter) }));
  const fromName = $derived(currencies[fromCurrency] ?? 'Selected currency');
  const toName = $derived(currencies[toCurrency] ?? 'Selected currency');
  const currencyCount = $derived(Object.keys(currencies).length);

  function formatNumber(value: number, min = 2, max = 4): string {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: min,
      maximumFractionDigits: max,
    });
  }
</script>

<!-- ── Outer wrapper ─────────────────────────────────────────────────────── -->
<div class="mx-auto w-full max-w-2xl">
  <div
    class="card preset-filled-surface-100-900 border-surface-200-800 space-y-6 border-[1px] p-5 md:p-6"
  >
    <!-- ── Amount input ─────────────────────────────────────────────────── -->
    <div class="space-y-2">
      <label
        class="label text-xs font-semibold uppercase tracking-widest text-surface-400"
        for="me-amount"
      >
        Amount
      </label>
      <input
        id="me-amount"
        type="number"
        min="0"
        step="any"
        bind:value={amount}
        oninput={scheduleConversion}
        placeholder="0"
        class="input h-14 w-full text-2xl font-semibold tabular-nums"
      />
    </div>

    <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
      <!-- ── From combobox ──────────────────────────────────────────────── -->
      <div class="space-y-2">
        <p class="label text-xs font-semibold uppercase tracking-widest text-surface-400">From</p>
        {#key swapKey}
          <Combobox
            collection={fromCollection}
            defaultValue={[fromCurrency]}
            defaultInputValue={fromCurrency}
            onInputValueChange={(d) => {
              fromFilter = d.inputValue;
            }}
            onValueChange={(d) => {
              const picked = d.value[0];
              if (picked && picked !== fromCurrency) {
                fromCurrency = picked;
                savePair(fromCurrency, toCurrency);
                scheduleConversion();
              }
            }}
            openOnClick
          >
            <Combobox.Control>
              <Combobox.Input
                class="input h-12 w-full font-mono font-semibold"
                placeholder="Search currency..."
                aria-label={`From currency, selected ${fromCurrency} ${fromName}`}
              />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-56 w-full overflow-y-auto border-[1px]"
              >
                {#if currencyCount === 0}
                  <div class="px-3 py-2 text-sm text-surface-500">Loading currencies...</div>
                {:else}
                  {#each fromCollection.items as item (item.value)}
                    <Combobox.Item
                      {item}
                      class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal {item.value ===
                      fromCurrency
                        ? 'preset-tonal-primary'
                        : ''}"
                    >
                      <Combobox.ItemText>
                        <span class="font-mono font-medium">{item.value}</span>
                        <span class="ml-2 text-surface-400">{currencies[item.value]}</span>
                      </Combobox.ItemText>
                      {#if item.value === fromCurrency}
                        <Check size={14} />
                      {/if}
                    </Combobox.Item>
                  {/each}
                {/if}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}
      </div>

      <!-- ── Swap button ─────────────────────────────────────────────────── -->
      <div class="flex justify-center md:pb-0.5">
        <button
          type="button"
          class="btn-icon preset-tonal"
          onclick={swap}
          aria-label="Swap currencies"
          title="Swap currencies"
        >
          <ArrowLeftRight size={18} />
        </button>
      </div>

      <!-- ── To combobox ────────────────────────────────────────────────── -->
      <div class="space-y-2">
        <p class="label text-xs font-semibold uppercase tracking-widest text-surface-400">To</p>
        {#key swapKey}
          <Combobox
            collection={toCollection}
            defaultValue={[toCurrency]}
            defaultInputValue={toCurrency}
            onInputValueChange={(d) => {
              toFilter = d.inputValue;
            }}
            onValueChange={(d) => {
              const picked = d.value[0];
              if (picked && picked !== toCurrency) {
                toCurrency = picked;
                savePair(fromCurrency, toCurrency);
                scheduleConversion();
              }
            }}
            openOnClick
          >
            <Combobox.Control>
              <Combobox.Input
                class="input h-12 w-full font-mono font-semibold"
                placeholder="Search currency..."
                aria-label={`To currency, selected ${toCurrency} ${toName}`}
              />
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-56 w-full overflow-y-auto border-[1px]"
              >
                {#if currencyCount === 0}
                  <div class="px-3 py-2 text-sm text-surface-500">Loading currencies...</div>
                {:else}
                  {#each toCollection.items as item (item.value)}
                    <Combobox.Item
                      {item}
                      class="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal {item.value ===
                      toCurrency
                        ? 'preset-tonal-primary'
                        : ''}"
                    >
                      <Combobox.ItemText>
                        <span class="font-mono font-medium">{item.value}</span>
                        <span class="ml-2 text-surface-400">{currencies[item.value]}</span>
                      </Combobox.ItemText>
                      {#if item.value === toCurrency}
                        <Check size={14} />
                      {/if}
                    </Combobox.Item>
                  {/each}
                {/if}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}
      </div>
    </div>

    <!-- ── Result slot (always rendered, reserved height) ───────────────── -->
    <div class="me-result preset-tonal-surface rounded-container p-4">
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span class="badge preset-tonal-primary font-mono">{fromCurrency}</span>
        <ArrowLeftRight size={14} class="text-surface-500" />
        <span class="badge preset-tonal-primary font-mono">{toCurrency}</span>
      </div>
      {#if appState === 'idle'}
        <p class="text-sm text-surface-500">Enter an amount to convert.</p>
      {:else if appState === 'loading'}
        <div class="flex items-center gap-2 text-sm text-surface-500">
          <svg
            class="size-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            ></path>
          </svg>
          Converting…
        </div>
      {:else if appState === 'result' && result !== null}
        <div class="space-y-1">
          <p class="text-xs font-semibold uppercase tracking-widest text-surface-500">Result</p>
          <p class="text-3xl font-bold tabular-nums">
            {formatNumber(result)}
            <span class="text-base font-normal text-surface-500">{toCurrency}</span>
          </p>
        </div>
        {#if rate !== null}
          <p class="mt-3 text-xs text-surface-500">
            1 {fromCurrency} = {formatNumber(rate, 0, 6)}
            {toCurrency}
          </p>
        {/if}
      {:else if appState === 'error'}
        <p class="text-sm font-medium text-error-500">Could not convert this pair.</p>
        <p class="mt-1 text-xs text-surface-500">{errorMessage}</p>
        <button
          type="button"
          class="btn btn-sm preset-outlined mt-2 text-xs"
          onclick={scheduleConversion}
        >
          Retry
        </button>
      {/if}
    </div>

    <p class="text-center text-xs text-surface-500">
      {#if currencyCount > 0}
        {currencyCount} currencies · live rates by Frankfurter
      {:else}
        Loading currencies...
      {/if}
    </p>
  </div>
</div>

<style>
  .me-result {
    min-height: 7rem;
  }
</style>
