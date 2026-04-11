<script lang="ts">
  import { ExternalLink, GitFork, RefreshCw, Star, Users } from 'lucide-svelte';
  import { onMount } from 'svelte';

  type LoadState = 'loading' | 'ready' | 'error';

  interface GitHubOwner {
    login: string;
    avatar_url: string;
    html_url: string;
  }

  interface GitHubRepo {
    id: number;
    full_name: string;
    name: string;
    html_url: string;
    description: string | null;
    stargazers_count: number;
    forks_count: number;
    language: string | null;
    topics?: string[];
    archived: boolean;
    pushed_at: string;
    owner: GitHubOwner;
    contributors_url: string;
  }

  interface GitHubContributor {
    id: number;
    login: string;
    avatar_url: string;
    html_url: string;
    contributions: number;
  }

  interface RepoPick {
    repo: GitHubRepo;
    score: number;
    label: string;
    freshnessDays: number;
    contributors: GitHubContributor[];
  }

  const PICK_COUNT = 3;

  let loadState = $state<LoadState>('loading');
  let errorMessage = $state('');
  let picks = $state<RepoPick[]>([]);
  let todayLabel = $state('');
  let poolSize = $state(0);

  function isoDaysAgo(days: number): string {
    return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  }

  function todaySeed(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function buildSearchUrl(): string {
    const recentCutoff = isoDaysAgo(45);
    const createdCutoff = isoDaysAgo(180);
    const params = new URLSearchParams({
      q: [
        'is:public',
        'archived:false',
        'fork:false',
        'mirror:false',
        'stars:20..5000',
        `pushed:>=${recentCutoff}`,
        `created:>=${createdCutoff}`,
      ].join(' '),
      sort: 'updated',
      order: 'desc',
      per_page: '80',
    });
    return `https://api.github.com/search/repositories?${params}`;
  }

  function daysSince(date: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86400000));
  }

  function scoreRepo(repo: GitHubRepo): number {
    const freshnessDays = daysSince(repo.pushed_at);
    const starsScore = Math.log10(repo.stargazers_count + 1) * 22;
    const forksScore = Math.log10(repo.forks_count + 1) * 12;
    const freshnessScore = Math.max(0, 35 - freshnessDays) * 1.8;
    const topicScore = Math.min(12, (repo.topics?.length ?? 0) * 2);
    const descriptionScore = repo.description ? 8 : 0;
    const sizePenalty = repo.stargazers_count > 2500 ? 15 : repo.stargazers_count > 1500 ? 8 : 0;
    return starsScore + forksScore + freshnessScore + topicScore + descriptionScore - sizePenalty;
  }

  function labelFor(repo: GitHubRepo, score: number): string {
    if (daysSince(repo.pushed_at) <= 5 && repo.stargazers_count >= 100) return 'Rising fast';
    if (score >= 70) return 'Hidden gem';
    if ((repo.topics?.length ?? 0) >= 3) return 'Curated pick';
    return 'Fresh OSS';
  }

  function hashSeed(value: string): number {
    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    return hash;
  }

  function selectDailyPicks(repos: GitHubRepo[]): RepoPick[] {
    const pool = repos.filter((r) => !r.archived && r.description);
    const scored = pool
      .map((repo) => {
        const score = scoreRepo(repo);
        return {
          repo,
          score,
          label: labelFor(repo, score),
          freshnessDays: daysSince(repo.pushed_at),
          contributors: [],
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    const seed = todaySeed();
    return scored
      .map((pick) => ({
        pick,
        weight: pick.score + (hashSeed(`${seed}-${pick.repo.full_name}`) % 1000) / 1000,
      }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, PICK_COUNT)
      .map((e) => e.pick);
  }

  async function enrichContributors(entries: RepoPick[]): Promise<RepoPick[]> {
    return Promise.all(
      entries.map(async (entry) => {
        try {
          const res = await fetch(`${entry.repo.contributors_url}?per_page=3`, {
            headers: { Accept: 'application/vnd.github+json' },
          });
          if (!res.ok) return entry;
          return { ...entry, contributors: (await res.json()) as GitHubContributor[] };
        } catch {
          return entry;
        }
      }),
    );
  }

  function formatCount(n: number): string {
    return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  }

  function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(new Date(iso));
  }

  async function load(): Promise<void> {
    loadState = 'loading';
    errorMessage = '';
    try {
      const res = await fetch(buildSearchUrl(), {
        headers: { Accept: 'application/vnd.github+json' },
      });
      if (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0') {
        throw new Error('GitHub rate limit reached. Try again in a few minutes.');
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      const payload = (await res.json()) as { items: GitHubRepo[] };
      const repos = payload.items ?? [];
      poolSize = repos.length;
      picks = await enrichContributors(selectDailyPicks(repos));
      todayLabel = formatDate(new Date().toISOString());
      loadState = 'ready';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      loadState = 'error';
    }
  }

  onMount(load);
</script>

<div class="mx-auto w-full max-w-5xl space-y-6">
  <!-- header -->
  <div class="flex flex-wrap items-start justify-between gap-4">
    <div class="space-y-1">
      <div class="flex flex-wrap gap-2">
        <span class="badge preset-tonal-primary">Daily picks</span>
        {#if todayLabel}
          <span class="badge preset-tonal-surface">{todayLabel}</span>
        {/if}
        {#if poolSize > 0}
          <span class="badge preset-tonal-surface">{poolSize} repos scanned</span>
        {/if}
      </div>
      <h2 class="text-2xl font-bold">Three open source picks for today</h2>
      <p class="text-sm text-surface-600-400">
        Surfacing active GitHub repositories with good momentum and metadata — refreshed daily.
      </p>
    </div>

    <button class="btn preset-tonal shrink-0" onclick={load} disabled={loadState === 'loading'}>
      <RefreshCw size={16} class={loadState === 'loading' ? 'animate-spin' : ''} />
      {loadState === 'loading' ? 'Loading…' : 'Refresh'}
    </button>
  </div>

  <!-- skeleton -->
  {#if loadState === 'loading'}
    <div class="grid gap-4 md:grid-cols-3">
      {#each [0, 1, 2] as i (i)}
        <div
          class="card preset-filled-surface-100-900 border-surface-200-800 animate-pulse space-y-4 border p-5"
        >
          <div class="flex items-center gap-3">
            <div class="bg-surface-300-700 size-11 rounded-full"></div>
            <div class="flex-1 space-y-2">
              <div class="bg-surface-300-700 h-4 w-2/3 rounded"></div>
              <div class="bg-surface-200-800 h-3 w-1/2 rounded"></div>
            </div>
          </div>
          <div class="bg-surface-200-800 h-16 rounded"></div>
          <div class="flex gap-2">
            <div class="bg-surface-300-700 h-6 w-20 rounded"></div>
            <div class="bg-surface-300-700 h-6 w-14 rounded"></div>
          </div>
        </div>
      {/each}
    </div>

    <!-- error -->
  {:else if loadState === 'error'}
    <aside class="card preset-tonal-error p-5 space-y-3">
      <p class="font-semibold">Could not load picks</p>
      <p class="text-sm">{errorMessage}</p>
      <button class="btn preset-outlined btn-sm" onclick={load}>Retry</button>
    </aside>

    <!-- cards -->
  {:else if picks.length > 0}
    <section class="grid gap-4 md:grid-cols-3">
      {#each picks as pick (pick.repo.id)}
        <article
          class="card preset-filled-surface-100-900 border-surface-200-800 flex flex-col gap-4 border p-5"
        >
          <!-- owner + label -->
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <img
                class="size-11 rounded-full border border-surface-200-800 object-cover"
                src={pick.repo.owner.avatar_url}
                alt={pick.repo.owner.login}
                loading="lazy"
              />
              <div class="min-w-0 space-y-0.5">
                <h3 class="truncate font-semibold" title={pick.repo.full_name}>{pick.repo.name}</h3>
                <p class="truncate text-xs text-surface-500">{pick.repo.owner.login}</p>
              </div>
            </div>
            <span class="badge preset-filled-primary shrink-0 text-xs">{pick.label}</span>
          </div>

          <!-- description -->
          <p class="text-sm leading-relaxed text-surface-600-400">{pick.repo.description}</p>

          <!-- stats -->
          <div class="flex flex-wrap gap-2 text-xs">
            {#if pick.repo.language}
              <span class="badge preset-tonal-secondary">{pick.repo.language}</span>
            {/if}
            <span class="badge preset-tonal-surface">
              <Star size={11} />
              {formatCount(pick.repo.stargazers_count)}
            </span>
            <span class="badge preset-tonal-surface">
              <GitFork size={11} />
              {formatCount(pick.repo.forks_count)}
            </span>
            <span class="badge preset-tonal-surface">{pick.freshnessDays}d ago</span>
          </div>

          <!-- topics -->
          {#if pick.repo.topics && pick.repo.topics.length > 0}
            <div class="flex flex-wrap gap-1.5 text-xs">
              {#each pick.repo.topics.slice(0, 4) as topic (topic)}
                <span class="badge preset-tonal-surface">{topic}</span>
              {/each}
            </div>
          {/if}

          <!-- contributors -->
          {#if pick.contributors.length > 0}
            <div class="flex items-center justify-between gap-3">
              <span class="flex items-center gap-1 text-xs text-surface-500">
                <Users size={12} />
                Contributors
              </span>
              <div class="flex">
                {#each pick.contributors as c, idx (c.id)}
                  <a
                    href={c.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.login}
                    class="-ml-2 first:ml-0"
                    style="z-index:{10 - idx}"
                  >
                    <img
                      class="size-7 rounded-full border-2 border-surface-50-950 object-cover"
                      src={c.avatar_url}
                      alt={c.login}
                      loading="lazy"
                    />
                  </a>
                {/each}
              </div>
            </div>
          {/if}

          <!-- link -->
          <div class="mt-auto pt-2">
            <a
              class="btn btn-sm preset-tonal w-full"
              href={pick.repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on GitHub
              <ExternalLink size={13} />
            </a>
          </div>
        </article>
      {/each}
    </section>
  {/if}
</div>
