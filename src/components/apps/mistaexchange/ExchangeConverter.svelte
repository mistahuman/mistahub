<script lang="ts">
  import { ArrowLeftRight, Check } from 'lucide-svelte';
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import { onMount } from 'svelte';

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

  let currencies = $state<Record<string, string>>({});
  let fromCurrency = $state<string>(DEFAULT_FROM);
  let toCurrency = $state<string>(DEFAULT_TO);
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
  // Guard: prevent $effect from saving/converting before onMount restores the stored pair
  let pairRestored = $state(false);

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

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  onMount(() => {
    const saved = loadPair();
    fromCurrency = saved.from;
    toCurrency = saved.to;
    pairRestored = true;
    swapKey++; // remount comboboxes with correct defaultValue
  });

  // ── Reactive effects ─────────────────────────────────────────────────────────

  $effect(() => {
    fetchCurrencies();
  });

  $effect(() => {
    if (!pairRestored) return;
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
    class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border p-5 md:space-y-5 md:p-6"
  >
    <div
      class="me-result card preset-filled-primary-500 border border-primary-400/40 p-5 shadow-xl"
    >
      <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span class="badge bg-white/15 font-mono text-white">{fromCurrency}</span>
        <ArrowLeftRight size={14} class="text-white/70" />
        <span class="badge bg-white/15 font-mono text-white">{toCurrency}</span>
      </div>
      <div class="space-y-1">
        <p class="text-xs font-semibold uppercase tracking-widest text-white/70">Result</p>
        <p class="text-4xl font-bold tabular-nums text-white md:text-5xl">
          {formatNumber(result ?? 0)}
          <span class="ml-2 text-base font-normal text-white/80 md:text-lg">{toCurrency}</span>
        </p>
      </div>
      <div class="me-result-meta mt-3">
        {#if appState === 'idle'}
          <p class="text-sm text-white/80">Enter an amount to convert.</p>
        {:else if appState === 'loading'}
          <div class="flex items-center gap-2 text-sm text-white/80">
            <svg
              class="size-4 animate-spin"
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
            Converting…
          </div>
        {:else if appState === 'result' && rate !== null}
          <p class="text-xs text-white/75">
            1 {fromCurrency} = {formatNumber(rate, 0, 6)}
            {toCurrency}
          </p>
        {:else if appState === 'error'}
          <p class="text-sm font-medium text-white">Could not convert this pair.</p>
          <p class="mt-1 text-xs text-white/75">{errorMessage}</p>
          <button
            type="button"
            class="btn btn-sm mt-2 border-white/30 bg-white/10 text-xs text-white hover:bg-white/15"
            onclick={scheduleConversion}
          >
            Retry
          </button>
        {/if}
      </div>
    </div>

    <div class="space-y-6">
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
                  class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-56 w-full overflow-y-auto border"
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
                  class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-56 w-full overflow-y-auto border"
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

      <p class="text-center text-xs text-surface-500">
        {#if currencyCount > 0}
          {currencyCount} currencies
        {:else}
          Loading currencies...
        {/if}
      </p>
    </div>
  </div>
</div>

<style>
  .me-result {
    min-height: 7rem;
  }

  .me-result-meta {
    min-height: 2.5rem;
  }
</style>
