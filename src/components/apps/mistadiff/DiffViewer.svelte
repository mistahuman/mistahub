<script lang="ts">
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

  function rowClass(kind: DiffLine['kind']): string {
    if (kind === 'added') return 'bg-success-500/10';
    if (kind === 'removed') return 'bg-error-500/10';
    return '';
  }

  function gutter(kind: DiffLine['kind']): string {
    if (kind === 'added') return '+';
    if (kind === 'removed') return '-';
    return ' ';
  }
</script>

<div class="flex flex-col gap-6">
  <!-- ── Inputs ──────────────────────────────────────────────────────────────── -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-surface-500-400">Original</span>
      <textarea
        bind:value={left}
        placeholder="Paste original text here…"
        rows={12}
        spellcheck="false"
        class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
      ></textarea>
    </div>
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-surface-500-400">Modified</span>
      <textarea
        bind:value={right}
        placeholder="Paste modified text here…"
        rows={12}
        spellcheck="false"
        class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
      ></textarea>
    </div>
  </div>

  <!-- ── Toggle ─────────────────────────────────────────────────────────────── -->
  <div class="flex items-center gap-3">
    <span
      class="text-sm font-medium"
      class:text-surface-900-50={!unified}
      class:text-surface-400-600={unified}
    >
      Split
    </span>
    <Switch checked={unified} onCheckedChange={(e) => (unified = e.checked)}>
      <Switch.Control
        class="relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full border-2 border-transparent
               bg-surface-300-700 transition-colors
               data-[state=checked]:bg-primary-500"
      >
        <Switch.Thumb
          class="pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform
                 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0.5"
        />
      </Switch.Control>
      <Switch.HiddenInput />
    </Switch>
    <span
      class="text-sm font-medium"
      class:text-surface-900-50={unified}
      class:text-surface-400-600={!unified}
    >
      Unified
    </span>
  </div>

  <!-- ── Output ─────────────────────────────────────────────────────────────── -->
  <div
    class="card preset-filled-surface-100-900 border border-surface-200-800 min-h-32 overflow-hidden"
  >
    {#if isEmpty}
      <p class="p-6 text-sm text-surface-400-600">
        Paste text into both panels above to see the diff.
      </p>
    {:else if unified}
      <!-- Unified view -->
      <div class="overflow-x-auto">
        <pre class="m-0 font-mono text-sm"><table class="w-full border-collapse">
            <tbody>
              {#each numberedLines as line, i (i)}
                <tr class={rowClass(line.kind)}>
                  <td
                    class="select-none whitespace-nowrap border-r border-surface-200-800 px-3 py-0.5 text-right text-xs text-surface-400-600 w-10">
                    {line.leftN ?? ''}
                  </td>
                  <td
                    class="select-none whitespace-nowrap border-r border-surface-200-800 px-3 py-0.5 text-right text-xs text-surface-400-600 w-10">
                    {line.rightN ?? ''}
                  </td>
                  <td
                    class="select-none whitespace-nowrap border-r border-surface-200-800 px-2 py-0.5 text-xs text-surface-400-600 w-5">
                    {gutter(line.kind)}
                  </td>
                  <td class="whitespace-pre px-3 py-0.5">{line.text}</td>
                </tr>
              {/each}
            </tbody>
          </table></pre>
      </div>
    {:else}
      <!-- Split view -->
      <div class="overflow-x-auto">
        <pre class="m-0 font-mono text-sm"><table class="w-full min-w-[640px] border-collapse">
            <tbody>
              {#each splitRows as row, i (i)}
                <tr>
                  <!-- Left cell -->
                  <td
                    class="w-1/2 border-r border-surface-200-800 p-0 {row.left
                      ? rowClass(row.left.kind)
                      : 'bg-surface-200-800/30'}">
                    <div class="flex">
                      <span
                        class="select-none whitespace-nowrap border-r border-surface-200-800 px-3 py-0.5 text-right text-xs text-surface-400-600 w-10">
                        {row.left?.n ?? ''}
                      </span>
                      <span class="whitespace-pre px-3 py-0.5">{row.left?.text ?? ''}</span>
                    </div>
                  </td>
                  <!-- Right cell -->
                  <td
                    class="w-1/2 p-0 {row.right
                      ? rowClass(row.right.kind)
                      : 'bg-surface-200-800/30'}">
                    <div class="flex">
                      <span
                        class="select-none whitespace-nowrap border-r border-surface-200-800 px-3 py-0.5 text-right text-xs text-surface-400-600 w-10">
                        {row.right?.n ?? ''}
                      </span>
                      <span class="whitespace-pre px-3 py-0.5">{row.right?.text ?? ''}</span>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table></pre>
      </div>
    {/if}
  </div>
</div>
