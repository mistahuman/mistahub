<script lang="ts">
  import { Copy, Check } from 'lucide-svelte';
  import { computeDiff, type DiffLine } from './diff.ts';

  // ── Types ──────────────────────────────────────────────────────────────────────

  type Mode = 'format' | 'diff';
  type OutputMode = 'pretty' | 'minify';
  type Lang = 'json' | 'xml';
  type FormatResult =
    | { ok: true; output: string; lang: Lang | null }
    | { ok: false; error: string; lang: Lang | null };

  type NumberedLine = DiffLine & { leftN: number | null; rightN: number | null };
  type SplitRow = {
    left: { kind: DiffLine['kind']; text: string; n: number } | null;
    right: { kind: DiffLine['kind']; text: string; n: number } | null;
  };

  // ── Shared state ───────────────────────────────────────────────────────────────

  let mode = $state<Mode>('format');

  // ── Format state ───────────────────────────────────────────────────────────────

  let input = $state('');
  let outputMode = $state<OutputMode>('pretty');
  let copied = $state(false);

  // ── Diff state ─────────────────────────────────────────────────────────────────

  let left = $state('');
  let right = $state('');
  let unified = $state(false);

  // ── XML helpers ────────────────────────────────────────────────────────────────

  function serializeNode(node: Node, depth: number): string {
    const pad = '  '.repeat(depth);

    if (node.nodeType === Node.DOCUMENT_NODE) {
      return Array.from(node.childNodes)
        .map((n) => serializeNode(n, depth))
        .filter(Boolean)
        .join('\n');
    }
    if (node.nodeType === Node.PROCESSING_INSTRUCTION_NODE) {
      const pi = node as ProcessingInstruction;
      return `${pad}<?${pi.target} ${pi.data}?>`;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent?.trim() ?? '';
      return t ? `${pad}${t}` : '';
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const attrs = Array.from(el.attributes)
        .map((a) => ` ${a.name}="${a.value}"`)
        .join('');
      const tag = el.tagName;
      const kids = Array.from(el.childNodes);

      if (kids.length === 0) return `${pad}<${tag}${attrs}/>`;

      if (kids.length === 1 && kids[0].nodeType === Node.TEXT_NODE) {
        const t = kids[0].textContent?.trim() ?? '';
        if (!t) return `${pad}<${tag}${attrs}/>`;
        return `${pad}<${tag}${attrs}>${t}</${tag}>`;
      }

      const inner = kids
        .map((n) => serializeNode(n, depth + 1))
        .filter(Boolean)
        .join('\n');
      return `${pad}<${tag}${attrs}>\n${inner}\n${pad}</${tag}>`;
    }
    return '';
  }

  function parseXML(str: string): Document {
    const doc = new DOMParser().parseFromString(str, 'text/xml');
    const err = doc.querySelector('parsererror');
    if (err) throw new Error(err.textContent?.split('\n')[0] ?? 'Invalid XML');
    return doc;
  }

  // ── Format logic ───────────────────────────────────────────────────────────────

  let formatResult = $derived.by<FormatResult>(() => {
    const s = input.trim();
    if (!s) return { ok: true, output: '', lang: null };

    if (s.startsWith('<')) {
      try {
        const doc = parseXML(s);
        const output =
          outputMode === 'pretty'
            ? serializeNode(doc, 0)
            : new XMLSerializer().serializeToString(doc).replace(/>\s+</g, '><').trim();
        return { ok: true, output, lang: 'xml' };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'Invalid XML', lang: 'xml' };
      }
    }

    try {
      const parsed = JSON.parse(s);
      const output =
        outputMode === 'pretty' ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed);
      return { ok: true, output, lang: 'json' };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON', lang: 'json' };
    }
  });

  async function copyFormatted() {
    if (!formatResult.ok || !formatResult.output) return;
    await navigator.clipboard.writeText(formatResult.output);
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  // ── Diff logic ─────────────────────────────────────────────────────────────────

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

  function flashClass(kind: DiffLine['kind'] | undefined): string {
    if (!kind || kind === 'equal') return '';
    return kind === 'added' ? 'diff-added' : 'diff-removed';
  }

  function gutter(kind: DiffLine['kind']): string {
    return kind === 'added' ? '+' : kind === 'removed' ? '-' : ' ';
  }
</script>

<div class="flex flex-col gap-6">
  <!-- ── Mode tabs ──────────────────────────────────────────────────────────── -->
  <div class="flex gap-1">
    <button
      onclick={() => (mode = 'format')}
      class="btn btn-sm {mode === 'format' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
    >
      Format
    </button>
    <button
      onclick={() => (mode = 'diff')}
      class="btn btn-sm {mode === 'diff' ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
    >
      Diff
    </button>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════════ -->
  <!-- FORMAT MODE                                                               -->
  <!-- ══════════════════════════════════════════════════════════════════════════ -->
  {#if mode === 'format'}
    <!-- Input -->
    <div class="flex flex-col gap-1">
      <span class="text-xs font-medium text-surface-500-400">Input</span>
      <textarea
        bind:value={input}
        placeholder="Paste JSON or XML here…"
        rows="10"
        spellcheck="false"
        class="w-full resize-y rounded border border-surface-200-800 bg-surface-50-950 p-3 font-mono text-sm
               focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-500"
      ></textarea>
    </div>

    <!-- Output -->
    <div class="flex flex-col gap-2">
      <!-- Output header -->
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-medium text-surface-500-400">Output</span>
          {#if formatResult.lang}
            <span class="badge preset-tonal-secondary text-xs uppercase">{formatResult.lang}</span>
          {/if}
        </div>
        <div class="flex items-center gap-1.5">
          <button
            onclick={() => (outputMode = 'pretty')}
            class="btn btn-sm {outputMode === 'pretty'
              ? 'preset-tonal-primary'
              : 'hover:preset-tonal'}"
          >
            Pretty
          </button>
          <button
            onclick={() => (outputMode = 'minify')}
            class="btn btn-sm {outputMode === 'minify'
              ? 'preset-tonal-primary'
              : 'hover:preset-tonal'}"
          >
            Minify
          </button>
          <button
            onclick={copyFormatted}
            disabled={!formatResult.ok || !formatResult.output}
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
      </div>

      <!-- Output body -->
      {#if !input.trim()}
        <div class="card preset-tonal-surface min-h-24 p-4">
          <p class="text-sm text-surface-500-400">Output will appear here.</p>
        </div>
      {:else if !formatResult.ok}
        <div class="card preset-tonal-error p-4">
          <p class="font-mono text-sm">{formatResult.error}</p>
        </div>
      {:else}
        <div
          class="card preset-filled-surface-100-900 border border-surface-200-800 max-h-[60vh] overflow-y-auto p-4"
        >
          <pre class="whitespace-pre-wrap break-all font-mono text-sm">{formatResult.output}</pre>
        </div>
      {/if}
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════════ -->
    <!-- DIFF MODE                                                                 -->
    <!-- ══════════════════════════════════════════════════════════════════════════ -->
  {:else}
    <!-- Inputs -->
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

    <!-- View toggle -->
    <div class="flex gap-1">
      <button
        onclick={() => (unified = false)}
        class="btn btn-sm {!unified ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
      >
        Split
      </button>
      <button
        onclick={() => (unified = true)}
        class="btn btn-sm {unified ? 'preset-tonal-primary' : 'hover:preset-tonal'}"
      >
        Unified
      </button>
    </div>

    <!-- Diff output -->
    <div
      class="card preset-filled-surface-100-900 border border-surface-200-800 min-h-16 max-h-[55vh] overflow-y-auto"
    >
      {#if isEmpty}
        <p class="p-6 text-sm text-surface-400-600">
          Paste text into both panels above to see the diff.
        </p>
      {:else if unified}
        <div class="overflow-x-auto">
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
                      >{row.left?.n ?? ''}</span
                    >
                    <span class="min-w-0 whitespace-pre-wrap break-all px-3 py-0.5"
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
                      >{row.right?.n ?? ''}</span
                    >
                    <span class="min-w-0 whitespace-pre-wrap break-all px-3 py-0.5"
                      >{row.right?.text ?? ''}</span
                    >
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  {/if}
</div>

<style>
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

  .diff-added {
    background-color: color-mix(in oklab, var(--color-success-500) 10%, transparent);
  }
  .diff-removed {
    background-color: color-mix(in oklab, var(--color-error-500) 10%, transparent);
  }
</style>
