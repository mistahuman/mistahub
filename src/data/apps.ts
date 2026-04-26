export type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: 'game' | 'news' | 'tool' | 'data' | 'art';
  status: 'ready' | 'planned';
  stars: number;
};

export const appEntries: AppEntry[] = [
  {
    slug: 'mistageo',
    title: 'mistageo',
    tagline: 'Identify countries from their flag or borders.',
    description:
      'A geography quiz that challenges you to recognize countries by flag or by border shape.',
    category: 'game',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistadex',
    title: 'mistadex',
    tagline: 'Guess the Pokémon from its silhouette.',
    description: 'A Pokémon guessing game — a silhouette appears, type the name before giving up.',
    category: 'game',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistahypedia',
    title: 'mistahypedia',
    tagline: 'Most viewed Wikipedia articles yesterday.',
    description: 'A live ranking of the most read Wikipedia pages from the previous day.',
    category: 'news',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistaword',
    title: 'mistaword',
    tagline: 'Guess the 5-letter word in 6 tries.',
    description: 'A Wordle-style game — guess the daily word in six tries.',
    category: 'game',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistajack',
    title: 'mistajack',
    tagline: 'Beat the dealer at Blackjack.',
    description:
      'A single-player Blackjack game against a CPU dealer with a persistent credit system.',
    category: 'game',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistamuseum',
    title: 'mistamuseum',
    tagline: 'One curated artwork, every day.',
    description:
      'A daily artwork discovery app — one public-domain piece from the Art Institute of Chicago, seeded by date.',
    category: 'art',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistanews',
    title: 'mistanews',
    tagline: 'Top 10 Hacker News stories, right now.',
    description:
      'A Hacker News link aggregator — fetches the top 10 stories and opens them externally.',
    category: 'news',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistagov',
    title: 'mistagov',
    tagline: 'Italian deputies, live from Camera dei Deputati.',
    description:
      'Live list of current Italian deputies with name and party group, fetched from the Camera SPARQL endpoint.',
    category: 'data',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistaexchange',
    title: 'mistaexchange',
    tagline: 'Real-time currency converter.',
    description:
      'A live currency converter powered by the Frankfurter public API — pick any pair, type an amount, get the rate instantly.',
    category: 'tool',
    status: 'ready',
    stars: 1,
  },
  {
    slug: 'mistaair',
    title: 'mistaair',
    tagline: 'Air quality readings from ARPAE Emilia-Romagna.',
    description:
      'A prototype air-quality dashboard using the latest official ARPAE Emilia-Romagna bulletin.',
    category: 'data',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistaweather',
    title: 'mistaweather',
    tagline: 'Simple weather from Open-Meteo.',
    description:
      'A lightweight weather panel with saved place search, current conditions, and a short forecast.',
    category: 'tool',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistabolo',
    title: 'mistabolo',
    tagline: 'Bologna culture events from public open data.',
    description:
      'A Bologna events board using the official Comune di Bologna Agenda Cultura open dataset.',
    category: 'data',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistaradio',
    title: 'mistaradio',
    tagline: 'World radio streams from Radio Browser.',
    description:
      'A lightweight radio browser with country, language, and tag filters powered by Radio Browser.',
    category: 'tool',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistaoss',
    title: 'mistaoss',
    tagline: 'Daily open source picks from GitHub.',
    description:
      'A curated daily OSS explorer that surfaces three promising repositories by category, momentum, and recency.',
    category: 'news',
    status: 'ready',
    stars: 0,
  },
  {
    slug: 'mistacurl',
    title: 'mistacurl',
    tagline: 'Fire GET requests and inspect JSON responses.',
    description:
      'A lightweight HTTP client — enter a URL, add query params and headers, send a GET request, and read the formatted JSON response.',
    category: 'tool',
    status: 'ready',
    stars: 0,
  },
];

export function getAppBySlug(slug: string) {
  return appEntries.find((entry) => entry.slug === slug);
}
