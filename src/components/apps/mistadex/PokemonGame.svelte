<script lang="ts">
  import { onMount } from 'svelte';
  import { Flame } from 'lucide-svelte';
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';

  interface Pokemon {
    name: string;
    image: string;
    types: string[];
    height: string;
    weight: string;
  }

  const GEN_RANGES = [
    { gen: 1, label: 'I', min: 1, max: 151 },
    { gen: 2, label: 'II', min: 152, max: 251 },
    { gen: 3, label: 'III', min: 252, max: 386 },
    // { gen: 4, label: 'IV',   min: 387, max: 493  },
    // { gen: 5, label: 'V',    min: 494, max: 649  },
    // { gen: 6, label: 'VI',   min: 650, max: 721  },
    // { gen: 7, label: 'VII',  min: 722, max: 809  },
    // { gen: 8, label: 'VIII', min: 810, max: 905  },
    // { gen: 9, label: 'IX',   min: 906, max: 1025 },
  ];

  // Phase: 'loading' | 'playing' | 'correct' | 'revealed' | 'error'
  let pokemon = $state<Pokemon | null>(null);
  let phase = $state<'loading' | 'playing' | 'correct' | 'revealed' | 'error'>('loading');
  let selectedGens = $state<number[]>([1, 2, 3]);
  let allNames = $state<{ id: number; name: string }[]>([]);

  // Streak
  let streak = $state(0);
  let bestStreak = $state(0);

  // Combobox state
  let selectedValue = $state('');
  let filterText = $state('');
  let wrongFeedback = $state(false);
  let revealConfirm = $state(false);
  let wrongTimer: ReturnType<typeof setTimeout> | null = null;
  let roundKey = $state(0);

  const activeNames = $derived(
    allNames.filter(({ id }) =>
      GEN_RANGES.some((r) => selectedGens.includes(r.gen) && id >= r.min && id <= r.max),
    ),
  );

  const allItems = $derived(activeNames.map((n) => ({ label: n.name, value: n.name })));

  const filteredItems = $derived(
    filterText
      ? allItems.filter((item) => item.label.toLowerCase().includes(filterText.toLowerCase()))
      : allItems,
  );

  const comboCollection = $derived(collection({ items: filteredItems }));

  onMount(() => {
    bestStreak = Number(localStorage.getItem('mistadex-best-streak') ?? 0);
    loadNames();
    fetchPokemon();
  });

  async function loadNames(): Promise<void> {
    try {
      const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=386');
      const data = await res.json();
      allNames = data.results.map((p: { name: string }, i: number) => ({
        id: i + 1,
        name: p.name,
      }));
    } catch {
      // free-text submit still works without suggestions
    }
  }

  async function toggleGen(gen: number): Promise<void> {
    if (selectedGens.includes(gen)) {
      if (selectedGens.length === 1) return;
      selectedGens = selectedGens.filter((g) => g !== gen);
    } else {
      selectedGens = [...selectedGens, gen];
    }
    await fetchPokemon();
  }

  function randomId(): number {
    const active = GEN_RANGES.filter((r) => selectedGens.includes(r.gen));
    const range = active[Math.floor(Math.random() * active.length)];
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  async function fetchPokemon(): Promise<void> {
    phase = 'loading';
    selectedValue = '';
    filterText = '';
    wrongFeedback = false;
    revealConfirm = false;
    pokemon = null;
    if (wrongTimer) clearTimeout(wrongTimer);

    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      // roundKey++ is after the first await: outside the $effect's synchronous
      // tracking window, so it won't cause the effect to re-trigger
      roundKey++;

      const image =
        data.sprites?.other?.['official-artwork']?.front_default ?? data.sprites?.front_default;

      if (!image) {
        await fetchPokemon();
        return;
      }

      pokemon = {
        name: data.name,
        image,
        types: data.types.map((t: { type: { name: string } }) => t.type.name),
        height: (data.height / 10).toFixed(1),
        weight: (data.weight / 10).toFixed(1),
      };
      phase = 'playing';
    } catch {
      phase = 'error';
    }
  }

  function normalize(s: string): string {
    return s.toLowerCase().replace(/[-\s]/g, '');
  }

  function submit(): void {
    const val = (selectedValue || filterText).trim();
    if (!val || phase !== 'playing' || !pokemon) return;

    if (normalize(val) === normalize(pokemon.name)) {
      revealConfirm = false;
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem('mistadex-best-streak', String(bestStreak));
      }
      phase = 'correct';
    } else {
      revealConfirm = false;
      if (wrongTimer) clearTimeout(wrongTimer);
      wrongFeedback = true;
      wrongTimer = setTimeout(() => {
        wrongFeedback = false;
      }, 1500);
    }
  }

  function reveal(): void {
    if (!revealConfirm) {
      revealConfirm = true;
      return;
    }
    streak = 0;
    revealConfirm = false;
    phase = 'revealed';
  }

  const isDone = () => phase === 'correct' || phase === 'revealed';
</script>

<div class="mx-auto flex w-full max-w-lg flex-col gap-4">
  <!-- Status + generation controls -->
  <div class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border px-5 py-4">
    <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span class="flex items-center gap-1.5">
        <Flame size={15} class="text-warning-500" />
        Streak <strong class="text-primary-500">{streak}</strong>
      </span>
      <span>Best <strong class="text-secondary-500">{bestStreak}</strong></span>
    </div>

    <div class="space-y-2">
      <p class="text-xs font-semibold uppercase tracking-widest text-surface-400">Generations</p>
      <div class="flex flex-wrap gap-2" aria-label="Generations">
        {#each GEN_RANGES as { gen, label } (gen)}
          {@const selected = selectedGens.includes(gen)}
          {#if selected}
            <button
              class="chip preset-filled-primary-500"
              onclick={() => toggleGen(gen)}
              aria-pressed="true"
              title={`Generation ${label} active`}
            >
              Gen {label}
            </button>
          {:else}
            <button
              class="chip preset-tonal-surface opacity-70"
              onclick={() => toggleGen(gen)}
              aria-pressed="false"
              title={`Generation ${label} inactive`}
            >
              Gen {label}
            </button>
          {/if}
        {/each}
      </div>
    </div>
  </div>

  <!-- Image card -->
  <div class="card preset-filled-surface-100-900 border border-surface-200-800 overflow-hidden">
    <div class="bg-surface-200-800 flex aspect-square w-full items-center justify-center">
      {#if phase === 'loading'}
        <p class="text-surface-400 text-sm animate-pulse">Loading…</p>
      {:else if phase === 'error'}
        <p class="text-error-500 text-sm px-4 text-center">Failed to load creature.</p>
      {:else if pokemon}
        <img
          src={pokemon.image}
          alt={isDone() ? pokemon.name : 'mystery creature'}
          class="w-full h-full object-contain"
          style="filter: {isDone() ? 'none' : 'brightness(0)'}; transition: filter 0.6s ease"
        />
      {/if}
    </div>
  </div>

  <!-- Hints card -->
  {#if pokemon && !['loading', 'error'].includes(phase)}
    <div
      class="card preset-filled-surface-100-900 border-surface-200-800 space-y-4 border px-5 py-4 text-sm"
    >
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs text-surface-400">Type</span>
          {#each pokemon.types as type (type)}
            <span class="rounded-base px-2 py-0.5 text-xs font-medium preset-tonal capitalize"
              >{type}</span
            >
          {/each}
        </div>
        <div>
          <span class="text-xs text-surface-400">Height</span>
          <p class="mt-1 font-semibold">{pokemon.height} m</p>
        </div>
        <div>
          <span class="text-xs text-surface-400">Weight</span>
          <p class="mt-1 font-semibold">{pokemon.weight} kg</p>
        </div>
      </div>
      {#if isDone()}
        <div
          class="rounded-container p-3 text-center {phase === 'correct'
            ? 'preset-tonal-success'
            : 'preset-tonal-warning'}"
        >
          {#if phase === 'correct'}
            <p class="font-semibold">Correct</p>
          {:else}
            <p class="font-semibold">Answer revealed</p>
          {/if}
          <p class="mt-1 text-lg font-bold capitalize">{pokemon.name}</p>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Controls card -->
  {#if phase !== 'error'}
    <div
      class="card preset-filled-surface-100-900 border border-surface-200-800 space-y-3 px-5 py-4"
    >
      {#if phase === 'playing'}
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
              <Combobox.Input class="input min-w-0 flex-1" placeholder="Search a Pokémon…" />
              <button class="btn preset-filled-primary-500" onclick={submit}>Submit</button>
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border border-surface-200-800 max-h-60 overflow-y-auto z-50 w-full"
              >
                {#each filteredItems as item (item.value)}
                  <Combobox.Item
                    {item}
                    class="px-3 py-2 text-sm cursor-pointer hover:preset-tonal capitalize"
                  >
                    <Combobox.ItemText>{item.label}</Combobox.ItemText>
                  </Combobox.Item>
                {/each}
              </Combobox.Content>
            </Combobox.Positioner>
          </Combobox>
        {/key}

        <div class="h-5">
          {#if wrongFeedback}
            <p class="text-sm text-error-500">Not quite — try again.</p>
          {/if}
        </div>

        <div class="flex flex-col items-end gap-2 border-t border-surface-200-800 pt-3">
          {#if revealConfirm}
            <p class="text-right text-xs text-warning-600-400">
              This ends the round and resets the streak.
            </p>
          {/if}
          <button
            class="btn btn-sm {revealConfirm ? 'preset-filled-warning-500' : 'preset-ghost'}"
            onclick={reveal}
          >
            {revealConfirm ? 'Confirm reveal' : 'Reveal answer'}
          </button>
        </div>
      {:else if isDone()}
        <button class="btn preset-filled-primary-500 w-full" onclick={fetchPokemon}
          >Next Round</button
        >
      {:else if phase === 'error'}
        <button class="btn preset-outlined w-full" onclick={fetchPokemon}>Retry</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* No custom CSS needed — filter is inline for transition support */
</style>
