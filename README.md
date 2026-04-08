# mistahub

A personal hub collecting small single-page apps — geography quizzes, games, tools — all under one GitHub Pages project.

Built with **Astro**, **Svelte**, and **Skeleton UI**.

## Live

```
https://mistahuman.github.io/mistahub/
```

## Apps

| Slug        | Title     | What it does                             | Status  |
| ----------- | --------- | ---------------------------------------- | ------- |
| `mistageo`  | mistageo  | Geography quiz — flags and borders       | planned |
| `mistadex`  | mistadex  | Guess the Pokémon from its silhouette    | planned |
| `mistaword` | mistaword | Wordle-style game in English and Italian | planned |

## Stack

| Tool           | Role                       |
| -------------- | -------------------------- |
| Astro ^6       | Static site + file routing |
| Svelte ^5      | Interactive components     |
| Skeleton UI ^4 | Theme and UI components    |
| Tailwind ^4    | Utility classes            |
| lucide-svelte  | Icons                      |

## Local dev

```bash
npm install
npm run dev   # → http://localhost:4321/mistahub/
```

```bash
npm run build
npm run preview
npm run lint
npm run format
```

## Base URL

The base is always `/mistahub/` (dev and production) so the local URL mirrors the deployed one.

Config in `astro.config.mjs`:

```js
site: 'https://mistahuman.github.io/mistahub',
base: '/mistahub/',
```

**Never use absolute links.** Always use `import.meta.env.BASE_URL` for internal links and assets:

```astro
---
const base = import.meta.env.BASE_URL;
---

<a href={base}>hub</a>
<a href={`${base}apps/mistageo/`}>mistageo</a>
```

## Project structure

```
src/
├── components/
│   ├── AppHub.astro           # hub grid on the homepage
│   ├── apps/                  # one component per integrated app
│   └── generic/               # Header, Footer, Drawer, Logo, Lightswitch
├── data/
│   └── apps.ts                # single source of truth for all app entries
├── layouts/
│   ├── LayoutRoot.astro       # HTML root, theme, dark-mode script
│   └── Layout.astro           # header + main + footer
├── pages/
│   ├── index.astro            # homepage — the hub grid
│   └── apps/
│       └── [slug].astro       # one page per app (auto or dedicated)
└── styles/
    ├── global.css
    └── mistahuman-theme.css
```

## How to integrate a mini app

1. Copy the main Svelte component from the source repo into `src/components/apps/`.
2. Install any extra dependencies the component needs (`npm install <pkg>`).
3. Create a dedicated page at `src/pages/apps/<slug>/index.astro` (static routes take priority over `[slug].astro`).
4. Import and mount the component with `client:load`.
5. Set `status: 'ready'` in `src/data/apps.ts` and update the table in this README.

### Example page

```astro
---
import Layout from '@layouts/Layout.astro';
import MyGame from '@components/apps/MyGame.svelte';

const base = import.meta.env.BASE_URL;
---

<Layout>
  <div class="container mx-auto px-4 py-10">
    <a href={base}>← mistahub</a>
    <MyGame client:load />
  </div>
</Layout>
```

## Data shape (`apps.ts`)

```ts
import type { Component } from 'svelte';

type AppEntry = {
  slug: string;
  title: string;
  tagline: string; // short subtitle shown on the card
  description: string; // slightly longer, shown on the placeholder page
  status: 'ready' | 'planned';
  icon: Component; // lucide-svelte component, imported directly in apps.ts
};
```

The icon lives in `apps.ts` alongside the data — no separate map needed elsewhere.

---

> **For Claude:** when integrating a new app, check its source repo for extra npm dependencies before copying the component. Always update the apps table above and set `status: 'ready'` when the page is functional.
