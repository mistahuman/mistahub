<script lang="ts">
  import { Flame } from 'lucide-svelte';
  import { Combobox } from '@skeletonlabs/skeleton-svelte';
  import { collection } from '@zag-js/combobox';
  import { SvelteSet } from 'svelte/reactivity';

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
  let selectedGens = new SvelteSet([1, 2, 3]);
  let allNames = $state<{ id: number; name: string }[]>([]);

  // Streak
  let streak = $state(0);
  let bestStreak = $state(0);

  // Combobox state
  let selectedValue = $state('');
  let filterText = $state('');
  let wrongFeedback = $state(false);
  let wrongTimer: ReturnType<typeof setTimeout> | null = null;
  let roundKey = $state(0);

  const activeNames = $derived(
    allNames.filter(({ id }) =>
      GEN_RANGES.some((r) => selectedGens.has(r.gen) && id >= r.min && id <= r.max),
    ),
  );

  const allItems = $derived(activeNames.map((n) => ({ label: n.name, value: n.name })));

  const filteredItems = $derived(
    filterText
      ? allItems.filter((item) => item.label.toLowerCase().includes(filterText.toLowerCase()))
      : allItems,
  );

  const comboCollection = $derived(collection({ items: filteredItems }));

  $effect(() => {
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

  function toggleGen(gen: number): void {
    if (selectedGens.has(gen)) {
      if (selectedGens.size === 1) return;
      selectedGens.delete(gen);
    } else {
      selectedGens.add(gen);
    }
  }

  function randomId(): number {
    const active = GEN_RANGES.filter((r) => selectedGens.has(r.gen));
    const range = active[Math.floor(Math.random() * active.length)];
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  async function fetchPokemon(): Promise<void> {
    phase = 'loading';
    selectedValue = '';
    filterText = '';
    wrongFeedback = false;
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
      streak++;
      if (streak > bestStreak) {
        bestStreak = streak;
        localStorage.setItem('mistadex-best-streak', String(bestStreak));
      }
      phase = 'correct';
    } else {
      if (wrongTimer) clearTimeout(wrongTimer);
      wrongFeedback = true;
      wrongTimer = setTimeout(() => {
        wrongFeedback = false;
      }, 1500);
    }
  }

  function reveal(): void {
    streak = 0;
    phase = 'revealed';
  }

  const isDone = () => phase === 'correct' || phase === 'revealed';
</script>

<div class="flex flex-col gap-3 w-full max-w-lg mx-auto">
  <!-- Streak card -->
  <div
    class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 flex justify-between items-center px-5 py-3 text-sm"
  >
    <span class="flex items-center gap-1.5">
      <Flame size={15} class="text-warning-500" />
      Streak: <strong class="text-primary-500">{streak}</strong>
    </span>
    <span>Best: <strong class="text-secondary-500">{bestStreak}</strong></span>
  </div>

  <!-- Generation filter card -->
  <div class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 px-5 py-4">
    <p class="text-xs font-semibold text-surface-400 uppercase tracking-widest mb-3">Generations</p>
    <div class="flex flex-wrap gap-2">
      {#each GEN_RANGES as { gen, label } (gen)}
        <button
          class="btn btn-sm text-xs px-3 py-1"
          class:preset-filled-primary={selectedGens.has(gen)}
          class:preset-outlined={!selectedGens.has(gen)}
          onclick={() => toggleGen(gen)}
          aria-pressed={selectedGens.has(gen)}
        >
          {label}
        </button>
      {/each}
    </div>
  </div>

  <!-- Image card -->
  <div
    class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 overflow-hidden"
  >
    <div
      class="w-full bg-surface-200-800 flex items-center justify-center"
      style="aspect-ratio: 1/1; max-height: 280px;"
    >
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
      class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 px-5 py-4 text-sm"
    >
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="flex flex-col items-center gap-1">
          <span class="text-xs text-surface-400">Type</span>
          {#each pokemon.types as type (type)}
            <span class="px-2 py-0.5 rounded-sm text-xs font-medium preset-tonal capitalize"
              >{type}</span
            >
          {/each}
        </div>
        <div>
          <span class="text-xs text-surface-400">Height</span>
          <p class="font-semibold mt-1">{pokemon.height} m</p>
        </div>
        <div>
          <span class="text-xs text-surface-400">Weight</span>
          <p class="font-semibold mt-1">{pokemon.weight} kg</p>
        </div>
      </div>
      {#if isDone()}
        <p class="font-semibold pt-3 text-center">
          {#if phase === 'correct'}
            <span class="text-success-500">Correct! {pokemon.name}</span>
          {:else}
            <span class="text-error-500">It was {pokemon.name}</span>
          {/if}
        </p>
      {/if}
    </div>
  {/if}

  <!-- Controls card -->
  {#if phase !== 'error'}
    <div
      class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 px-5 py-4 space-y-3"
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
            <Combobox.Control class="flex gap-2">
              <Combobox.Input class="input flex-1" placeholder="Search a Pokémon…" />
              <button class="btn preset-tonal-primary" onclick={submit}>Submit</button>
            </Combobox.Control>
            <Combobox.Positioner>
              <Combobox.Content
                class="card preset-filled-surface-100-900 border-[1px] border-surface-200-800 max-h-60 overflow-y-auto z-50 w-full"
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

        <button class="btn preset-outlined w-full text-sm" onclick={reveal}>Reveal</button>
      {:else if isDone()}
        <button class="btn preset-tonal-primary w-full" onclick={fetchPokemon}>Next Round</button>
      {:else if phase === 'error'}
        <button class="btn preset-outlined w-full" onclick={fetchPokemon}>Retry</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* No custom CSS needed — filter is inline for transition support */
</style>
