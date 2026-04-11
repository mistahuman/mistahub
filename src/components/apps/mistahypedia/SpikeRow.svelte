<script lang="ts">
  interface Props {
    rank: number;
    title: string;
    views: number;
    maxViews: number;
  }

  let { rank, title, views, maxViews }: Props = $props();

  function formatViews(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return n.toString();
  }

  const wikiUrl = $derived(`https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`);
  const displayTitle = $derived(title.replaceAll('_', ' '));
  const pct = $derived(Math.round((views / maxViews) * 100));
</script>

<div
  class="card preset-filled-surface-100-900 border-surface-200-800 hover:preset-tonal border px-4 py-3 transition-colors"
>
  <div class="flex items-center gap-3">
    <!-- Rank -->
    <span class="badge preset-outlined w-9 shrink-0 justify-center font-mono text-xs">#{rank}</span>

    <!-- Title -->
    <a
      href={wikiUrl}
      target="_blank"
      rel="noopener noreferrer"
      class="min-w-0 flex-1 truncate text-sm font-medium text-primary-500 transition-colors hover:text-primary-400 hover:underline"
      title={displayTitle}
    >
      {displayTitle}
    </a>

    <!-- Views -->
    <span class="badge preset-outlined shrink-0 font-mono text-xs">{formatViews(views)}</span>
  </div>

  <!-- Relative bar -->
  <div class="bg-surface-200-800 mt-2 h-0.5 w-full rounded-full">
    <div class="bg-primary-500/60 h-0.5 rounded-full transition-all" style="width: {pct}%"></div>
  </div>
</div>
