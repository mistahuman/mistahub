<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { Switch } from '@skeletonlabs/skeleton-svelte';
  import { computeDiff, type DiffLine } from './diff.ts';

  // ── Types ─────────────────────────────────────────────────────────────────────

  type NumberedLine = DiffLine & { leftN: number | null; rightN: number | null };
  type SplitCell = { kind: DiffLine['kind']; text: string; n: number };
  type SplitRow = { left: SplitCell | null; right: SplitCell | null };

  // ── State ─────────────────────────────────────────────────────────────────────

  let left = $state('');
  let right = $state('');
  let unified = $state(false);
  let reducedMotion = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = mq.matches;
    mq.addEventListener('change', (e) => (reducedMotion = e.matches));
  });

  // ── Derived ───────────────────────────────────────────────────────────────────

  const isEmpty = $derived(!left && !right);

  const numberedLines = $derived.by<NumberedLine[]>(() => {
    let ln = 0;
    let rn = 0;
    return computeDiff(left, right).map((line) => {
      if (line.kind === 'equal') {
        ln++;
        rn++;
        return { ...line, leftN: ln, rightN: rn };
      }
      if (line.kind === 'removed') {
        ln++;
        return { ...line, leftN: ln, rightN: null };
      }
      rn++;
      return { ...line, leftN: null, rightN: rn };
    });
  });

  const splitRows = $derived.by<SplitRow[]>(() => {
    const rows: SplitRow[] = [];
    let i = 0;
    while (i < numberedLines.length) {
      const line = numberedLines[i];
      if (line.kind === 'equal') {
        rows.push({
          left: { kind: 'equal', text: line.text, n: line.leftN! },
          right: { kind: 'equal', text: line.text, n: line.rightN! },
        });
        i++;
      } else if (line.kind === 'removed') {
        const next = numberedLines[i + 1];
        if (next?.kind === 'added') {
          rows.push({
            left: { kind: 'removed', text: line.text, n: line.leftN! },
            right: { kind: 'added', text: next.text, n: next.rightN! },
          });
          i += 2;
        } else {
          rows.push({ left: { kind: 'removed', text: line.text, n: line.leftN! }, right: null });
          i++;
        }
      } else {
        rows.push({ left: null, right: { kind: 'added', text: line.text, n: line.rightN! } });
        i++;
      }
    }
    return rows;
  });

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const fadeDur = $derived(reducedMotion ? 0 : 150);
  const modeDur = $derived(reducedMotion ? 0 : 200);

  function flashClass(kind: DiffLine['kind'] | undefined): string {
    if (!kind || kind === 'equal') return '';
    return kind === 'added' ? 'diff-added' : 'diff-removed';
  }

  function gutter(kind: DiffLine['kind']): string {
    return kind === 'added' ? '+' : kind === 'removed' ? '-' : ' ';
  }
</script>

<div class="flex flex-col gap-6">
  <!-- ── Inputs ──────────────────────────────────────────────────────────────── -->
  <div class="card preset-filled-surface-100-900 border border-surface-200-800 p-4">
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-surface-500-400">Original</span>
        <textarea
          bind:value={left}
          placeholder="Paste original text here…"
          rows={isEmpty ? 12 : 6}
          spellcheck="false"
          class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm
                 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        ></textarea>
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-surface-500-400">Modified</span>
        <textarea
          bind:value={right}
          placeholder="Paste modified text here…"
          rows={isEmpty ? 12 : 6}
          spellcheck="false"
          class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm
                 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
        ></textarea>
      </div>
    </div>
  </div>

  <!-- ── Toggle ─────────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3">
    <span
      class="text-sm font-medium transition-colors"
      class:text-surface-900-50={!unified}
      class:text-surface-400-600={unified}
    >
      Split
    </span>
    <Switch checked={unified} onCheckedChange={(e) => (unified = e.checked)}>
      <Switch.Control
        class="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full
               border-2 border-transparent bg-surface-300-700 transition-colors
               data-[state=checked]:bg-primary-500"
      >
        <Switch.Thumb
          class="pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm
                 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
        />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch>
    <span
      class="text-sm font-medium transition-colors"
      class:text-surface-900-50={unified}
      class:text-surface-400-600={!unified}
    >
      Unified
    </span>
  </div>

  <!-- ── Output ─────────────────────────────────────────────────────────────── -->
  <div
    class="card preset-filled-surface-100-900 border border-surface-200-800 min-h-16 max-h-[55vh] overflow-y-auto"
  >
    {#if isEmpty}
      <p class="p-6 text-sm text-surface-400-600" out:fade={{ duration: fadeDur }}>
        Paste text into both panels above to see the diff.
      </p>
    {:else}
      {#key numberedLines}
        <div in:fade={{ duration: fadeDur }} class="overflow-hidden">
          {#if unified}
            <!-- Unified view -->
            <div in:fade={{ duration: modeDur }} class="overflow-x-auto">
              <table class="w-full border-collapse font-mono text-sm">
                <tbody>
                  {#each numberedLines as line, i (i)}
                    <tr class={flashClass(line.kind)}>
                      <td class="num-col border-r border-surface-200-800 text-right"
                        >{line.leftN ?? ''}</td
                      >
                      <td class="num-col border-r border-surface-200-800 text-right"
                        >{line.rightN ?? ''}</td
                      >
                      <td class="gutter-col border-r border-surface-200-800 text-center select-none"
                        >{gutter(line.kind)}</td
                      >
                      <td class="whitespace-pre px-3 py-0.5">{line.text}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {:else}
            <!-- Split view -->
            <div in:fade={{ duration: modeDur }}>
              <table class="w-full border-collapse font-mono text-sm">
                <tbody>
                  {#each splitRows as row, i (i)}
                    <tr>
                      <td
                        class="w-1/2 border-r border-surface-200-800 p-0 {row.left
                          ? flashClass(row.left.kind)
                          : 'bg-surface-200-800/20'}"
                      >
                        <div class="flex">
                          <span
                            class="num-col shrink-0 border-r border-surface-200-800 text-right select-none"
                          >
                            {row.left?.n ?? ''}
                          </span>
                          <span class="whitespace-pre-wrap break-all px-3 py-0.5 min-w-0"
                            >{row.left?.text ?? ''}</span
                          >
                        </div>
                      </td>
                      <td
                        class="w-1/2 p-0 {row.right
                          ? flashClass(row.right.kind)
                          : 'bg-surface-200-800/20'}"
                      >
                        <div class="flex">
                          <span
                            class="num-col shrink-0 border-r border-surface-200-800 text-right select-none"
                          >
                            {row.right?.n ?? ''}
                          </span>
                          <span class="whitespace-pre-wrap break-all px-3 py-0.5 min-w-0"
                            >{row.right?.text ?? ''}</span
                          >
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/key}
    {/if}
  </div>
</div>

<style>
  /* Fixed-width columns shared across both views */
  .num-col {
    width: 2.5rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.7rem;
    color: var(--color-surface-400);
    white-space: nowrap;
  }
  .gutter-col {
    width: 1.5rem;
    padding: 0.125rem 0.25rem;
    font-size: 0.7rem;
    color: var(--color-surface-400);
    white-space: nowrap;
  }

  /* Line flash animations */
  @keyframes flash-added {
    from {
      background-color: color-mix(in oklab, var(--color-success-500) 30%, transparent);
    }
    to {
      background-color: color-mix(in oklab, var(--color-success-500) 10%, transparent);
    }
  }
  @keyframes flash-removed {
    from {
      background-color: color-mix(in oklab, var(--color-error-500) 30%, transparent);
    }
    to {
      background-color: color-mix(in oklab, var(--color-error-500) 10%, transparent);
    }
  }

  .diff-added {
    background-color: color-mix(in oklab, var(--color-success-500) 10%, transparent);
    animation: flash-added 300ms ease-out forwards;
  }
  .diff-removed {
    background-color: color-mix(in oklab, var(--color-error-500) 10%, transparent);
    animation: flash-removed 300ms ease-out forwards;
  }

  @media (prefers-reduced-motion: reduce) {
    .diff-added,
    .diff-removed {
      animation: none;
    }
  }
</style>
