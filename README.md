# mistahub

A personal hub collecting small single-page apps — geography quizzes, games, tools — all under one GitHub Pages project.

Built with **Astro**, **Svelte**, and **Skeleton UI**.

## Live

```
https://mistahuman.github.io/mistahub/
```

## Apps

| Slug            | Type | What it does                                           |
| --------------- | ---- | ------------------------------------------------------ |
| `mistageo`      | game | Geography quiz — flags and borders                     |
| `mistadex`      | game | Guess the Pokémon from its silhouette                  |
| `mistahypedia`  | news | Most viewed Wikipedia articles yesterday               |
| `mistaword`     | game | Wordle-style word game                                 |
| `mistajack`     | game | Single-player Blackjack vs CPU dealer                  |
| `mistamuseum`   | art  | One curated AIC artwork per day                        |
| `mistanews`     | news | Top 10 Hacker News stories                             |
| `mistagov`      | data | Italian deputies — name, party, dates, absence ranking |
| `mistaexchange` | tool | Real-time currency converter (Frankfurter API)         |
| `mistaair`      | data | Air quality readings from ARPAE Emilia-Romagna         |
| `mistaweather`  | tool | Simple weather from Open-Meteo                         |
| `mistabolo`     | data | Bologna culture events from Comune open data           |
| `mistaradio`    | tool | World radio stream browser (Radio Browser API)         |
| `mistaoss`      | news | Daily open source picks from GitHub                    |
| `mistacurl`     | tool | In-browser GET request client with examples            |

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
