<script lang="ts">
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import { Copy, Check } from 'lucide-svelte';

  const PRESETS = ['OR', 'AND', ',', '|', 'Custom'] as const;
  type Preset = (typeof PRESETS)[number];

  const OP_MAP: Record<Preset, string> = {
    OR: ' OR ',
    AND: ' AND ',
    ',': ', ',
    '|': ' | ',
    Custom: '',
  };

  let input = $state('');
  let preset = $state<Preset>('OR');
  let customOp = $state('');

  let operator = $derived(preset === 'Custom' ? customOp : OP_MAP[preset]);

  let tokens = $derived(
    input
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  );

  let output = $derived(tokens.length > 0 ? tokens.join(operator) : '');

  let copied = $state(false);

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }
</script>

<div class="space-y-6">
  <!-- Section 1 — Input -->
  <div class="space-y-2">
    <label for="strings-input" class="text-sm font-medium">Input</label>
    <textarea
      id="strings-input"
      bind:value={input}
      placeholder="Paste or type tokens — spaces, commas, semicolons, and newlines all work as separators…"
      rows="6"
      spellcheck="false"
      class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm
             focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
    ></textarea>
  </div>

  <!-- Section 2 — Operator selector -->
  <div class="space-y-3">
    <p class="text-sm font-medium">Join with</p>

    <SegmentedControl
      value={preset}
      onValueChange={(e) => {
        if (e.value) preset = e.value as Preset;
      }}
    >
      <SegmentedControl.Control
        class="relative flex w-full items-center gap-0.5 rounded-xl bg-surface-200-800 p-1"
      >
        <SegmentedControl.Indicator
          class="rounded-lg bg-surface-50-950 shadow-sm"
          style="width: var(--width); height: var(--height);"
        />
        {#each PRESETS as p (p)}
          <SegmentedControl.Item
            value={p}
            class="relative z-10 flex-1 cursor-pointer select-none rounded-lg px-3 py-1.5 text-center text-sm font-medium
                   text-surface-500-400 data-[state=checked]:text-surface-900-50"
          >
            <SegmentedControl.ItemText class="font-mono">{p}</SegmentedControl.ItemText>
            <SegmentedControl.ItemHiddenInput />
          </SegmentedControl.Item>
        {/each}
      </SegmentedControl.Control>
    </SegmentedControl>

    <!-- Custom operator input — always rendered to avoid layout jump -->
    <div class="h-10">
      {#if preset === 'Custom'}
        <input
          type="text"
          bind:value={customOp}
          placeholder="Type a custom separator, e.g.  &&  or  UNION"
          class="h-full w-full rounded border border-surface-200-800 bg-surface-50-950 px-3 font-mono text-sm
                 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        />
      {/if}
    </div>
  </div>

  <!-- Section 3 — Output -->
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium">Output</span>
        {#if tokens.length > 0}
          <span class="badge preset-outlined text-xs">
            {tokens.length} token{tokens.length !== 1 ? 's' : ''}
          </span>
        {/if}
      </div>
      <button
        onclick={copyOutput}
        disabled={!output}
        class="btn btn-sm preset-filled-primary-500 gap-1.5 transition-opacity disabled:opacity-40"
      >
        {#if copied}
          <Check size={14} />
          Copied!
        {:else}
          <Copy size={14} />
          Copy
        {/if}
      </button>
    </div>

    <textarea
      readonly
      rows="4"
      value={output}
      placeholder="Output will appear here as you type…"
      spellcheck="false"
      class="w-full resize-none rounded border border-surface-200-800 bg-surface-100-900 p-3 font-mono text-sm
             text-surface-900-50 placeholder:text-surface-400-600 focus-visible:outline-none"
    ></textarea>
  </div>
</div>
