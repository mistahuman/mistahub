# mistahub — context for Claude

## What this is

Personal hub that aggregates small Svelte single-page apps under one GitHub Pages deployment. Each app lives in its own Astro route. Everything lives in this single repository.

## Base URL rule

Always `/mistahub/` in both dev and production. Never hardcode `/` — always use `import.meta.env.BASE_URL`.

## Project structure

```
src/
├── components/
│   ├── AppHub.astro              # hub card grid (homepage) — also owns the slug→icon map
│   ├── AppPage.astro             # shared wrapper for every app page (back btn, title, tagline, slot)
│   ├── apps/
│   │   ├── mistageo/FlagGame.svelte
│   │   ├── mistadex/PokemonGame.svelte
│   │   ├── mistahypedia/SpikeDetector.svelte + SpikeRow.svelte
│   │   ├── mistaword/WordleGame.svelte
│   │   ├── mistajack/BlackjackGame.svelte
│   │   ├── mistamuseum/DailyArtwork.svelte
│   │   ├── mistanews/NewsFeed.svelte
│   │   ├── mistagov/MistaGov.svelte
│   │   ├── mistaexchange/ExchangeConverter.svelte
│   │   ├── mistaair/AirQualityProbe.svelte
│   │   ├── mistaweather/WeatherPanel.svelte
│   │   ├── mistabolo/BolognaEvents.svelte
│   │   ├── mistaradio/RadioBrowser.svelte
│   │   ├── mistaoss/MistaOss.svelte
│   │   └── mistacurl/CurlClient.svelte
│   └── generic/                  # Header, Footer, Drawer, Logo, Lightswitch
├── data/
│   └── apps.ts                   # pure data — no UI imports
├── pages/
│   ├── index.astro
│   └── apps/
│       ├── [slug].astro          # auto "coming soon" for planned apps
│       ├── mistageo/index.astro
│       ├── mistadex/index.astro
│       ├── mistahypedia/index.astro
│       ├── mistaword/index.astro
│       ├── mistajack/index.astro
│       ├── mistamuseum/index.astro
│       ├── mistanews/index.astro
│       ├── mistagov/index.astro
│       ├── mistaexchange/index.astro
│       ├── mistaair/index.astro
│       ├── mistaweather/index.astro
│       ├── mistabolo/index.astro
│       ├── mistaradio/index.astro
│       ├── mistaoss/index.astro
│       └── mistacurl/index.astro
└── styles/
```

## Current app state

| Slug            | Status | Extra deps                                                                |
| --------------- | ------ | ------------------------------------------------------------------------- |
| `mistageo`      | ready  | `topojson-client`, `@types/topojson-client`                               |
| `mistadex`      | ready  | none                                                                      |
| `mistahypedia`  | ready  | none                                                                      |
| `mistaword`     | ready  | none                                                                      |
| `mistajack`     | ready  | none (uses Deck of Cards API)                                             |
| `mistamuseum`   | ready  | none (uses AIC public API)                                                |
| `mistanews`     | ready  | none (uses HN Firebase REST API)                                          |
| `mistagov`      | ready  | none (uses Camera dei Deputati SPARQL — two queries: deputies + absences) |
| `mistaexchange` | ready  | none (uses Frankfurter public API — `api.frankfurter.dev/v1/`)            |
| `mistaair`      | ready  | none (uses ARPAE Emilia-Romagna `REST/bollettini_qa` JSON endpoint)       |
| `mistaweather`  | ready  | none (uses Open-Meteo forecast + geocoding APIs)                          |
| `mistabolo`     | ready  | none (uses Comune di Bologna Agenda Cultura OpenDataSoft API)             |
| `mistaradio`    | ready  | none (uses Radio Browser API on `de1.api.radio-browser.info`)             |
| `mistaoss`      | ready  | none (uses GitHub Search API on `api.github.com`)                         |
| `mistacurl`     | ready  | none (in-browser GET client — no external API dependency)                 |

## Key conventions

**`apps.ts`** — pure data only, no UI imports:

```ts
type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: 'game' | 'news' | 'tool' | 'data' | 'art';
  status: 'ready' | 'planned';
};
```

**Icons** live only in `AppHub.astro` as a plain `slug → lucide component` map. Do not add icon types to `AppEntry` — it causes TypeScript issues with Svelte component types.

**`AppPage.astro`** handles back button + title + tagline for all app pages. Do not repeat these inside the game component itself. (Note: `mistahypedia/SpikeDetector.svelte` had its internal header stripped for this reason.)

**Static routes** (`pages/apps/<slug>/index.astro`) take priority over `[slug].astro`. The dynamic route only fires for slugs without a dedicated page.

## How to integrate a new app

1. Add entry to `src/data/apps.ts` with `status: 'planned'`
2. Add `slug: IconComponent` to the `icons` map in `AppHub.astro`
3. Check source repo `package.json` for extra deps → `npm install <pkg>`
4. Copy component(s) to `src/components/apps/<slug>/`
5. Create `src/pages/apps/<slug>/index.astro`:

```astro
---
import Layout from '@layouts/Layout.astro';
import AppPage from '@components/AppPage.astro';
import MyGame from '@components/apps/<slug>/MyGame.svelte';
---

<Layout>
  <AppPage title="<slug>" tagline="...">
    <MyGame client:load />
  </AppPage>
</Layout>
```

6. Set `status: 'ready'` in `apps.ts` and update the README apps table.

## Skeleton UI preset strategy

### Available preset variants

```
preset-filled[-<color>-<shade>]   # solid background + contrasting text
preset-tonal[-<color>]            # muted tint of the color (most used)
preset-outlined[-<color>-<shade>] # transparent + colored border
```

**Named color tokens** (for tonal/outlined): `primary` `secondary` `tertiary` `success` `warning` `error` `surface`
**Shade tokens** (for filled/outlined): `-500` (single), `-950-50` / `-900-100` / … / `-50-950` (light-dark pairs)

Cards, buttons, badges and chip all accept the same `preset-*` classes.

### Cards

| Use case                          | Class                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Standard surface container        | `card preset-filled-surface-100-900 border border-surface-200-800` |
| Nested sub-panel                  | `card preset-tonal-surface`                                        |
| Forecast / data row               | `card preset-tonal-surface border border-surface-200-800`          |
| Error state                       | `card preset-tonal-error`                                          |
| Warning state (partial data)      | `card preset-tonal-warning`                                        |
| Empty state                       | `card preset-tonal-surface`                                        |
| Loading placeholder (no skeleton) | `card preset-tonal`                                                |

> **Rule:** always write `border` (not `border-[1px]`). Both give 1 px, but the bracket form is unnecessary.

### Buttons

| Use case                                   | Class                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| Primary CTA (Submit, Next Round, New game) | `btn preset-filled-primary-500`                           |
| Secondary CTA / external link              | `btn preset-tonal-primary`                                |
| Utility / neutral (Refresh, Reset)         | `btn preset-tonal`                                        |
| Icon-only utility                          | `btn-icon preset-tonal`                                   |
| Nav link hover                             | `btn hover:preset-tonal` or `btn-icon hover:preset-tonal` |
| Retry inside error card                    | `btn preset-outlined btn-sm`                              |
| Destructive confirm step                   | `btn preset-filled-warning-500`                           |

### Badges

| Use case                                  | Class                                          |
| ----------------------------------------- | ---------------------------------------------- |
| Feature / app label ("Daily picks")       | `badge preset-tonal-primary`                   |
| Neutral info (counts, dates, coordinates) | `badge preset-outlined`                        |
| Category label (text, non-numeric)        | `badge preset-tonal-surface`                   |
| Tech / language / tag                     | `badge preset-tonal-secondary`                 |
| Status: success / warning / error         | `badge preset-tonal-{success\|warning\|error}` |

### Filter / tab button groups

```svelte
<button class="btn btn-sm {active ? 'preset-tonal-primary' : 'hover:preset-tonal'}">
```

### Loading skeletons

Use `animate-pulse` cards with two surface shades for shapes:

```svelte
<div
  class="card preset-filled-surface-100-900 border border-surface-200-800 animate-pulse space-y-4 p-5"
>
  <div class="bg-surface-300-700 size-11 rounded-full"></div>
  <!-- avatar -->
  <div class="bg-surface-300-700 h-4 w-2/3 rounded"></div>
  <!-- title -->
  <div class="bg-surface-200-800 h-3 w-1/2 rounded"></div>
  <!-- subtitle -->
  <div class="bg-surface-200-800 h-16 rounded"></div>
  <!-- body -->
</div>
```

### Combobox dropdown lists

```svelte
<div
  class="card preset-filled-surface-100-900 border border-surface-200-800 z-50 max-h-60 w-full overflow-y-auto"
>
  <div
    class="cursor-pointer px-3 py-2 text-sm hover:preset-tonal data-highlighted:preset-tonal
              {selected ? 'preset-tonal-primary' : ''}"
  ></div>
</div>
```

### Dynamic components (Svelte 5)

`<svelte:component this={fn()}>` is **deprecated and broken** in Svelte 5 — SSR and client hydrate differently and it throws a `TypeError` at runtime.

**Correct pattern:** use `{@const}` to assign the component, but only inside a block directive (`{#if}`, `{#each}`, `{:else}`, `{#snippet}`, etc.) — **never inside a plain HTML element**.

```svelte
<!-- ✅ inside {#each} — {@const} is a direct child of the each block -->
{#each dailyRows as day (day.date)}
  {@const Icon = weatherIcon(day.code)}
  <article>
    <div class="card {weatherPreset(day.code)} p-2">
      <Icon size={24} />
    </div>
  </article>
{/each}

<!-- ✅ wrap in {#if true} when you need it inside markup -->
{#if true}
  {@const Icon = weatherIcon(weather.current.weather_code)}
  <div class="card {weatherPreset(weather.current.weather_code)} p-3">
    <Icon size={42} />
  </div>
{/if}

<!-- ❌ invalid — {@const} inside a <div> -->
<div class="card p-3">
  {@const Icon = weatherIcon(code)}
  <Icon size={42} />
</div>
```

### Skeleton Combobox and SSR hydration

The `Combobox` from `@skeletonlabs/skeleton-svelte` (backed by `@zag-js/combobox`) generates dynamic aria IDs during initialization. These IDs differ between the SSR run (server, Astro dev mode) and the client run, causing a Svelte 5 hydration mismatch:

```
TypeError: Cannot read properties of undefined (reading 'call')
```

**Rule:** any page whose Svelte component renders a `Combobox` **at the top level** (always visible, not inside a conditional) must use `client:only="svelte"` instead of `client:load` in its `index.astro`.

```astro
<!-- ✅ correct for components with a top-level Combobox -->
<WeatherPanel client:only="svelte" />

<!-- ❌ causes hydration crash in dev mode -->
<WeatherPanel client:load />
```

A `Combobox` that only appears after an initial conditional (e.g. `{#if status !== 'loading'}`) is safe with `client:load` because it is a fresh mount, not a hydration.

**Affected pages (already fixed):** `mistaweather`, `mistaexchange`, `mistaair`.

## mistagov — data layer notes

**Endpoint:** `https://dati.camera.it/sparql` (GET, `format=json`).

**Two-phase fetch in `MistaGov.svelte`:**

1. **Deputies query** — fetches name, current group, and date range for all XIX-legislature deputies.
   - Filter: `FILTER(STRENDS(STR(?persona), "_19"))` — without this the endpoint returns all deputies since 1946 (~10 000 rows).
   - A deputy appears multiple times (party switches); deduplication keeps the entry with the latest `groupSince` date.
   - Group label embeds dates: `"MISTO (09.01.2023)"` or `"AVS (27.10.2022-09.01.2023)"` — parsed by regex into `groupSince` / `groupUntil`.

2. **Total votazioni query** — one COUNT(DISTINCT) query at mount for the whole XIX legislature (`~17 257`). Used as the denominator for attendance rate.
   - **The store has duplicate triples** (data stored in two named graphs). `COUNT(*)` returns 2× the real number. Always use `COUNT(DISTINCT ?var)`.

3. **Absences batch query** — counts `dc:type "Non ha votato"` on `ocd:voto`, joined through `ocd:rif_votazione` to `ocd:votazione` to ensure only actual electronic votes are counted.
   - A single GROUP BY across all deputies times out (>60 s) on the endpoint.
   - Solution: batch the deputy URIs in groups of 25 using `VALUES ?persona { ... }`, fire all batches in parallel with `Promise.all`. Each batch resolves in ~0.5–1 s.
   - Batches patch the `deputies` array progressively as they settle (`Promise.allSettled`). First batch done → enables the Absences sort button.
   - Deputies not in any absences result get `absences: 0` (never missed a vote).
   - `attendanceRate = ((totalVotazioni - absences) / totalVotazioni) * 100`.

**Useful predicates discovered:**

- `ocd:aderisce` → blank node with `startDate`, `endDate`, `rif_gruppoParlamentare`
- `ocd:votazione` → `dc:type` values (vote topic type): `"Articolo"`, `"Emendamento"`, `"Finale atto Camera"`, `"Ordine del Giorno"`, etc.; also `ocd:votazioneSegreta` (`0`/`1`)
- `ocd:voto` → per-deputy record; `dc:type` values: `"Favorevole"`, `"Contrario"`, `"Astensione"`, `"Non ha votato"`, `"Ha votato"`; links to its `ocd:votazione` via `ocd:rif_votazione`
- `foaf:depiction` → photo URL on deputy (not yet used)

## mistaexchange — data layer notes

**Endpoint:** `https://api.frankfurter.dev/v1/` (no key required).

- `GET /v1/currencies` → `Record<string, string>` (code → full name, ~170 entries)
- `GET /v1/latest?from=X&to=Y` → `{ rates: { Y: number } }`

**⚠️ Do not use `api.frankfurter.app`** — it 301-redirects to `api.frankfurter.dev` and the redirect target drops `Access-Control-Allow-Origin`, causing all browser fetches to fail with a CORS error.

**`ExchangeConverter.svelte` architecture:**

- Four states: `idle` (empty amount) / `loading` / `result` / `error`
- 300 ms debounce on amount input; pair changes trigger the same `scheduleConversion()`
- Swap increments `swapKey` → `{#key swapKey}` remounts both `Combobox` components with updated `defaultValue`
- `localStorage` key `mistaexchange` stores `{ from, to }`; defaults to EUR → USD on first visit

## mistaoss — data layer notes

**Endpoint:** `https://api.github.com/search/repositories`

- Uses one public GitHub search request per manual refresh.
- Query shape: public, non-fork, non-archived repositories with moderate star counts and recent pushes.
- No category filter — shows 3 picks per day across all domains.
- Selection is deterministic per day: fetch a pool of 80, score locally for freshness + stars + forks + metadata quality, then choose 3 using a date-seeded ranking.
- Contributors fetched per-pick (`contributors_url?per_page=3`) after the main load.

## After each session

Update README.md apps table and this file if anything structural changed.
