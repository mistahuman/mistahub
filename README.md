# mistahub

A personal hub collecting small single-page apps — geography quizzes, games, tools — all under one GitHub Pages project.

Built with **Astro**, **Svelte**, and **Skeleton UI**.

## Live

```
https://mistahuman.github.io/mistahub/
```

## Apps

| Slug          | What it does                             |
| ------------- | ---------------------------------------- |
| `mistageo`    | Geography quiz — flags and borders       |
| `mistadex`    | Guess the Pokémon from its silhouette    |
| `hypemeter`   | Most viewed Wikipedia articles yesterday |
| `mistaword`   | Wordle-style word game                   |
| `mistajack`   | Single-player Blackjack vs CPU dealer    |
| `mistamuseum` | One curated AIC artwork per day          |
| `mistasaur`   | Browse prehistoric life from fossils     |

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
npm run build
npm run preview
npm run lint / format
```
