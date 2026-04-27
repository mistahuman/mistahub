<script lang="ts">
  type AppState = 'idle' | 'ready' | 'copied';

  const OPERATOR_PRESETS = [
    { label: 'OR', value: ' OR ' },
    { label: 'AND', value: ' AND ' },
    { label: ',', value: ', ' },
    { label: '|', value: ' | ' },
    { label: 'Custom', value: '' },
  ] as const;

  let input = $state('');
  let selectedPreset = $state<string>('OR');
  let customOp = $state('');

  let operator = $derived(
    selectedPreset === 'Custom'
      ? customOp
      : (OPERATOR_PRESETS.find((p) => p.label === selectedPreset)?.value ?? ' OR '),
  );

  let tokens = $derived(
    input
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );

  let output = $derived(tokens.length > 0 ? tokens.join(operator) : '');

  let appState = $derived<AppState>(tokens.length === 0 ? 'idle' : 'ready');

  let copyState = $state<'idle' | 'copied'>('idle');

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    copyState = 'copied';
    setTimeout(() => (copyState = 'idle'), 2000);
  }
</script>

<div class="space-y-5">
  <!-- Input -->
  <div class="space-y-2">
    <label for="strings-input" class="text-sm font-medium">Input</label>
    <textarea
      id="strings-input"
      bind:value={input}
      placeholder="Paste or type tokens separated by spaces, commas, semicolons, or newlines…"
      rows="5"
      class="textarea w-full font-mono text-sm"
    ></textarea>
  </div>

  <!-- Operator selector -->
  <div class="space-y-2">
    <p class="text-sm font-medium">Join with</p>
    <div class="flex flex-wrap gap-2">
      {#each OPERATOR_PRESETS as preset (preset.label)}
        <button
          onclick={() => (selectedPreset = preset.label)}
          class="btn btn-sm {selectedPreset === preset.label
            ? 'preset-tonal-primary'
            : 'hover:preset-tonal'} font-mono"
        >
          {preset.label}
        </button>
      {/each}
    </div>

    {#if selectedPreset === 'Custom'}
      <input
        type="text"
        bind:value={customOp}
        placeholder="e.g.  &&  or  UNION "
        class="input font-mono text-sm"
      />
    {/if}
  </div>

  <!-- Output -->
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">Output</span>
        {#if appState === 'ready'}
          <span class="badge preset-outlined text-xs"
            >{tokens.length} token{tokens.length !== 1 ? 's' : ''}</span
          >
        {/if}
      </div>
      {#if appState === 'ready'}
        <button onclick={copyOutput} class="btn btn-sm preset-filled-primary-500">
          {copyState === 'copied' ? 'Copied!' : 'Copy'}
        </button>
      {/if}
    </div>

    <div class="card preset-filled-surface-100-900 border border-surface-200-800 min-h-24 p-4">
      {#if appState === 'idle'}
        <p class="text-sm text-surface-500">Output will appear here.</p>
      {:else}
        <p class="break-all font-mono text-sm leading-relaxed">{output}</p>
      {/if}
    </div>
  </div>
</div>
