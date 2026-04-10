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
│   │   ├── hypemeter/SpikeDetector.svelte + SpikeRow.svelte
│   │   ├── mistaword/WordleGame.svelte
│   │   ├── mistajack/BlackjackGame.svelte
│   │   ├── mistamuseum/DailyArtwork.svelte
│   │   ├── mistanews/NewsFeed.svelte
│   │   ├── mistagov/MistaGov.svelte
│   │   └── mistaexchange/ExchangeConverter.svelte
│   └── generic/                  # Header, Footer, Drawer, Logo, Lightswitch
├── data/
│   └── apps.ts                   # pure data — no UI imports
├── pages/
│   ├── index.astro
│   └── apps/
│       ├── [slug].astro          # auto "coming soon" for planned apps
│       ├── mistageo/index.astro
│       ├── mistadex/index.astro
│       ├── hypemeter/index.astro
│       ├── mistaword/index.astro
│       ├── mistajack/index.astro
│       ├── mistamuseum/index.astro
│       ├── mistanews/index.astro
│       ├── mistagov/index.astro
│       └── mistaexchange/index.astro
└── styles/
```

## Current app state

| Slug            | Status | Extra deps                                                                |
| --------------- | ------ | ------------------------------------------------------------------------- |
| `mistageo`      | ready  | `topojson-client`, `@types/topojson-client`                               |
| `mistadex`      | ready  | none                                                                      |
| `hypemeter`     | ready  | none                                                                      |
| `mistaword`     | ready  | none                                                                      |
| `mistajack`     | ready  | none (uses Deck of Cards API)                                             |
| `mistamuseum`   | ready  | none (uses AIC public API)                                                |
| `mistanews`     | ready  | none (uses HN Firebase REST API)                                          |
| `mistagov`      | ready  | none (uses Camera dei Deputati SPARQL — two queries: deputies + absences) |
| `mistaexchange` | ready  | none (uses Frankfurter public API — `api.frankfurter.dev/v1/`)            |

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

**`AppPage.astro`** handles back button + title + tagline for all app pages. Do not repeat these inside the game component itself. (Note: `hypemeter/SpikeDetector.svelte` had its internal header stripped for this reason.)

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

## After each session

Update README.md apps table and this file if anything structural changed.
