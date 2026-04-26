<script lang="ts">
  import { computeDiff, type DiffLine } from './diff.ts';

  type ViewMode = 'split' | 'unified';

  let left = $state('');
  let right = $state('');
  let mode = $state<ViewMode>('split');

  type AppState = 'empty' | 'ready' | 'diffed';

  const appState = $derived<AppState>(() => {
    if (!left && !right) return 'empty';
    const lines = computeDiff(left, right);
    const hasDiff = lines.some((l) => l.kind !== 'equal');
    return hasDiff ? 'diffed' : 'ready';
  });

  const diffLines = $derived(computeDiff(left, right));

  // Split view: pair up left (equal/removed) and right (equal/added) lines
  type SplitRow = { left: DiffLine | null; right: DiffLine | null };

  const splitRows = $derived<SplitRow[]>(() => {
    const rows: SplitRow[] = [];
    let i = 0;
    while (i < diffLines.length) {
      const line = diffLines[i];
      if (line.kind === 'equal') {
        rows.push({ left: line, right: line });
        i++;
      } else if (line.kind === 'removed') {
        // Pair with the next added line if present
        const next = diffLines[i + 1];
        if (next?.kind === 'added') {
          rows.push({ left: line, right: next });
          i += 2;
        } else {
          rows.push({ left: line, right: null });
          i++;
        }
      } else {
        rows.push({ left: null, right: line });
        i++;
      }
    }
    return rows;
  });
</script>

<div class="space-y-4">
  <!-- Inputs -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <textarea
      bind:value={left}
      placeholder="Paste original text here…"
      rows={10}
      class="w-full resize-y rounded border border-surface-300-700 bg-surface-50-950 p-3 font-mono text-sm focus:outline-none"
    ></textarea>
    <textarea
      bind:value={right}
      placeholder="Paste modified text here…"
      rows={10}
      class="w-full resize-y rounded border border-surface-300-700 bg-surface-50-950 p-3 font-mono text-sm focus:outline-none"
    ></textarea>
  </div>

  <!-- Mode toggle -->
  <div class="flex items-center gap-3">
    <span class="text-sm">Split</span>
    <label class="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        class="peer sr-only"
        checked={mode === 'unified'}
        onchange={(e) => (mode = e.currentTarget.checked ? 'unified' : 'split')}
      />
      <div
        class="peer h-5 w-9 rounded-full bg-surface-300-700 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full"
      ></div>
    </label>
    <span class="text-sm">Unified</span>
  </div>

  <!-- Output -->
  {#if appState() === 'empty'}
    <p class="text-sm text-surface-500">Paste text into both fields to see the diff.</p>
  {:else if mode === 'unified'}
    <!-- Unified view -->
    <div class="overflow-x-auto rounded border border-surface-200-800">
      <table class="w-full font-mono text-sm">
        <tbody>
          {#each diffLines as line, i (i)}
            <tr
              class={line.kind === 'added'
                ? 'bg-success-50 dark:bg-success-950'
                : line.kind === 'removed'
                  ? 'bg-error-50 dark:bg-error-950'
                  : ''}
            >
              <td class="select-none px-2 py-0.5 text-surface-400 w-6">
                {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
              </td>
              <td class="whitespace-pre px-2 py-0.5">{line.text}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <!-- Split view -->
    <div class="overflow-x-auto rounded border border-surface-200-800">
      <table class="w-full font-mono text-sm">
        <tbody>
          {#each splitRows() as row, i (i)}
            <tr>
              <td
                class="whitespace-pre px-2 py-0.5 w-1/2 {row.left?.kind === 'removed'
                  ? 'bg-error-50 dark:bg-error-950'
                  : ''}">{row.left?.text ?? ''}</td
              >
              <td class="w-px bg-surface-200-800"></td>
              <td
                class="whitespace-pre px-2 py-0.5 w-1/2 {row.right?.kind === 'added'
                  ? 'bg-success-50 dark:bg-success-950'
                  : ''}">{row.right?.text ?? ''}</td
              >
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
