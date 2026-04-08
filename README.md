# Template Astro Svelte Skeleton

A **base template** for building small static frontend apps deployed on **GitHub Pages** as a sub-path (`mistahuman.github.io/<repo-name>/`).

## Live Demo

[View the website](https://mistahuman.github.io/template-astro-svelte-skeleton)

## Tech Stack

| Tool                                    | Version       | Role                                  |
| --------------------------------------- | ------------- | ------------------------------------- |
| [Astro](https://astro.build)            | ^6            | Static framework, file-based routing  |
| [Svelte](https://svelte.dev)            | ^5            | Interactive components (runes syntax) |
| [Skeleton UI](https://www.skeleton.dev) | ^4            | Component library / design system     |
| [Tailwind CSS](https://tailwindcss.com) | ^4 (via Vite) | Utility CSS                           |
| [lucide-svelte](https://lucide.dev)     | latest        | Icons                                 |

## Installation

```bash
git clone https://github.com/mistahuman/template-astro-svelte-skeleton.git
cd template-astro-svelte-skeleton
npm install
npm run dev
```

## Commands

```bash
npm run dev       # Start dev server (base URL already configured)
npm run build     # Static build to ./dist
npm run preview   # Preview the build
npm run lint      # ESLint
npm run format    # Prettier
```

## Project Structure

```
src/
├── components/
│   ├── generic/          # Reusable components (Header, Footer, Drawer, Logo, Lightswitch, Card)
│   └── WelcomeHome.astro
├── layouts/
│   ├── LayoutRoot.astro  # Root HTML (head, body, dark mode script)
│   └── Layout.astro      # Page layout (header + main + footer)
├── pages/
│   └── index.astro       # Every .astro file here = one route
└── styles/
    ├── global.css         # Tailwind + Skeleton themes imports
    └── mistahuman-theme.css  # Custom theme (colors, monospace fonts)
```

## Import Aliases

```ts
@components/*  →  src/components/*
@layouts/*     →  src/layouts/*
@styles/*      →  src/styles/*
@assets/*      →  src/assets/*
```

## Key Concepts

### GitHub Pages — Sub-path Deployment

The site is NOT served from root (`/`) but from a sub-path. Configured in `astro.config.mjs`:

```js
site: 'https://mistahuman.github.io/<repo-name>',
base: '/<repo-name>/',
```

**Critical rule**: never use `href="/"` in Astro components. Always use `import.meta.env.BASE_URL` for home links and static assets.

```astro
---
const base = import.meta.env.BASE_URL;
---

<a href={base}>Home</a>
<img src={`${base}image.png`} />
```

For internal routes, always append to the base:

```astro
<a href={`${base}about`}>About</a>
```

### Routing

Astro uses file-based routing. Create a file in `src/pages/` to add a route:

```
src/pages/index.astro        →  /
src/pages/about.astro        →  /about
src/pages/blog/[slug].astro  →  /blog/:slug
```

### Adding Pages and Nav Links

1. Create `src/pages/new-page.astro` using the layout:

```astro
---
import Layout from '@layouts/Layout.astro';
---

<Layout>
  <!-- content -->
</Layout>
```

2. Add the link in `src/components/generic/Header.astro`:

```js
const base = import.meta.env.BASE_URL;
const coreLinks = [
  { href: base, label: 'home', target: '_self' },
  { href: `${base}new-page`, label: 'new page', target: '_self' },
];
```

The mobile Drawer receives the same links automatically — single source of truth.

### Svelte Components in Astro

Add `client:load` (or `client:visible`) to hydrate Svelte components in the browser:

```astro
---
import MyComponent from '@components/MyComponent.svelte';
---

<MyComponent client:load />
```

Without a `client:*` directive, the component renders as static HTML only — no reactivity.

### Theming

Active theme is `mistahuman-theme` (defined in `src/styles/mistahuman-theme.css`). Change the `data-theme` attribute in `LayoutRoot.astro` to use any Skeleton built-in theme. All themes are imported in `global.css`.

Dark/light mode is managed via `data-mode="dark|light"` on `<html>` and persisted in `localStorage`.

## Deploy to GitHub Pages

Deploy is automatic via `.github/workflows/deploy.yml` on every push to `main`.

When using this template for a new project:

1. Create the new repo on GitHub
2. Update `astro.config.mjs`:
   ```js
   site: 'https://mistahuman.github.io/<new-repo>',
   base: '/<new-repo>/',
   ```
3. Enable GitHub Pages in repo settings (source: GitHub Actions)
4. Push to `main` → automatic deploy

## Architectural Notes

- Navigation lives in the Header (desktop) and Drawer (mobile) — no sidebar by default.
- `coreLinks` in `Header.astro` is the single source of truth for all nav links.
- Tailwind v4 is integrated via Vite plugin, not PostCSS.
- Skeleton v4 ships Svelte-specific components from `@skeletonlabs/skeleton-svelte`.
