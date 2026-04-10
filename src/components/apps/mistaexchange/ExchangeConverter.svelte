<script lang="ts">
  import { ArrowLeftRight } from 'lucide-svelte';
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
</script>

<!-- ── Outer wrapper ─────────────────────────────────────────────────────── -->
<div class="mx-auto w-full max-w-[420px]">
  <div class="card preset-filled-surface-100-900 border-surface-200-800 border-[1px] space-y-4 p-5">
    <!-- ── Amount input ─────────────────────────────────────────────────── -->
    <div class="space-y-1">
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
        class="input w-full"
      />
    </div>

    <!-- ── From combobox ────────────────────────────────────────────────── -->
    <div class="space-y-1">
      <p class="label text-xs font-semibold uppercase tracking-widest text-surface-400">From</p>
      {#key swapKey}
        <Combobox
          collection={fromCollection}
          defaultValue={[fromCurrency]}
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
            <Combobox.Input class="input w-full" placeholder="Search currency…" />
          </Combobox.Control>
          <Combobox.Positioner>
            <Combobox.Content
              class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-52 w-full overflow-y-auto border-[1px]"
            >
              {#each fromCollection.items as item (item.value)}
                <Combobox.Item
                  {item}
                  class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal"
                >
                  <Combobox.ItemText>
                    <span class="font-mono font-medium">{item.value}</span>
                    <span class="ml-2 text-surface-400">{currencies[item.value]}</span>
                  </Combobox.ItemText>
                </Combobox.Item>
              {/each}
            </Combobox.Content>
          </Combobox.Positioner>
        </Combobox>
      {/key}
    </div>

    <!-- ── Swap button ───────────────────────────────────────────────────── -->
    <div class="flex justify-center">
      <button
        type="button"
        class="btn btn-sm preset-tonal"
        onclick={swap}
        aria-label="Swap currencies"
      >
        <ArrowLeftRight size={16} />
      </button>
    </div>

    <!-- ── To combobox ──────────────────────────────────────────────────── -->
    <div class="space-y-1">
      <p class="label text-xs font-semibold uppercase tracking-widest text-surface-400">To</p>
      {#key swapKey}
        <Combobox
          collection={toCollection}
          defaultValue={[toCurrency]}
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
            <Combobox.Input class="input w-full" placeholder="Search currency…" />
          </Combobox.Control>
          <Combobox.Positioner>
            <Combobox.Content
              class="card preset-filled-surface-100-900 border-surface-200-800 z-50 max-h-52 w-full overflow-y-auto border-[1px]"
            >
              {#each toCollection.items as item (item.value)}
                <Combobox.Item
                  {item}
                  class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal"
                >
                  <Combobox.ItemText>
                    <span class="font-mono font-medium">{item.value}</span>
                    <span class="ml-2 text-surface-400">{currencies[item.value]}</span>
                  </Combobox.ItemText>
                </Combobox.Item>
              {/each}
            </Combobox.Content>
          </Combobox.Positioner>
        </Combobox>
      {/key}
    </div>

    <!-- ── Result slot (always rendered, reserved height) ───────────────── -->
    <div class="me-result border-t border-surface-200-800 pt-4">
      {#if appState === 'idle'}
        <p class="text-sm text-surface-400">Enter an amount to convert.</p>
      {:else if appState === 'loading'}
        <div class="flex items-center gap-2 text-sm text-surface-400">
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
        <p class="text-2xl font-semibold tabular-nums">
          {result.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          <span class="text-base font-normal text-surface-400">{toCurrency}</span>
        </p>
        {#if rate !== null}
          <p class="mt-1 text-xs text-surface-400">
            1 {fromCurrency} = {rate}
            {toCurrency}
          </p>
        {/if}
      {:else if appState === 'error'}
        <p class="text-sm text-error-500">{errorMessage}</p>
        <button
          type="button"
          class="btn btn-sm preset-outlined mt-2 text-xs"
          onclick={scheduleConversion}
        >
          Retry
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .me-result {
    min-height: 4.5rem;
  }
</style>
