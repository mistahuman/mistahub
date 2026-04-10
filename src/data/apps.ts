export type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  category: 'game' | 'news' | 'tool' | 'data' | 'art';
  status: 'ready' | 'planned';
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
  },
  {
    slug: 'mistadex',
    title: 'mistadex',
    tagline: 'Guess the Pokémon from its silhouette.',
    description: 'A Pokémon guessing game — a silhouette appears, type the name before giving up.',
    category: 'game',
    status: 'ready',
  },
  {
    slug: 'hypemeter',
    title: 'hypemeter',
    tagline: 'Most viewed Wikipedia articles yesterday.',
    description: 'A live ranking of the most read Wikipedia pages from the previous day.',
    category: 'news',
    status: 'ready',
  },
  {
    slug: 'mistaword',
    title: 'mistaword',
    tagline: 'Guess the 5-letter word in 6 tries.',
    description: 'A Wordle-style game — guess the daily word in six tries.',
    category: 'game',
    status: 'ready',
  },
  {
    slug: 'mistajack',
    title: 'mistajack',
    tagline: 'Beat the dealer at Blackjack.',
    description:
      'A single-player Blackjack game against a CPU dealer with a persistent credit system.',
    category: 'game',
    status: 'ready',
  },
  {
    slug: 'mistamuseum',
    title: 'mistamuseum',
    tagline: 'One curated artwork, every day.',
    description:
      'A daily artwork discovery app — one public-domain piece from the Art Institute of Chicago, seeded by date.',
    category: 'art',
    status: 'ready',
  },
  {
    slug: 'mistanews',
    title: 'mistanews',
    tagline: 'Top 10 Hacker News stories, right now.',
    description:
      'A Hacker News link aggregator — fetches the top 10 stories and opens them externally.',
    category: 'news',
    status: 'ready',
  },
  {
    slug: 'mistagov',
    title: 'mistagov',
    tagline: 'Italian deputies, live from Camera dei Deputati.',
    description:
      'Live list of current Italian deputies with name and party group, fetched from the Camera SPARQL endpoint.',
    category: 'data',
    status: 'ready',
  },
  {
    slug: 'mistaexchange',
    title: 'mistaexchange',
    tagline: 'Real-time currency converter.',
    description:
      'A live currency converter powered by the Frankfurter public API — pick any pair, type an amount, get the rate instantly.',
    category: 'tool',
    status: 'ready',
  },
  {
    slug: 'mistaair',
    title: 'mistaair',
    tagline: 'Air quality readings from ARPAE Emilia-Romagna.',
    description:
      'A prototype air-quality dashboard using the latest official ARPAE Emilia-Romagna bulletin.',
    category: 'data',
    status: 'ready',
  },
];

export function getAppBySlug(slug: string) {
  return appEntries.find((entry) => entry.slug === slug);
}
