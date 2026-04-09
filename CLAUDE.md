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
│   │   └── mistamuseum/DailyArtwork.svelte
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
│       └── mistamuseum/index.astro
└── styles/
```

## Current app state

| Slug          | Status | Extra deps                                  |
| ------------- | ------ | ------------------------------------------- |
| `mistageo`    | ready  | `topojson-client`, `@types/topojson-client` |
| `mistadex`    | ready  | none                                        |
| `hypemeter`   | ready  | none                                        |
| `mistaword`   | ready  | none                                        |
| `mistajack`   | ready  | none (uses Deck of Cards API)               |
| `mistamuseum` | ready  | none (uses AIC public API)                  |

## Key conventions

**`apps.ts`** — pure data only, no UI imports:

```ts
type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
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

## After each session

Update README.md apps table and this file if anything structural changed.
