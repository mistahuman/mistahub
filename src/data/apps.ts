export type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  status: 'ready' | 'planned';
};

export const appEntries: AppEntry[] = [
  {
    slug: 'mistageo',
    title: 'mistageo',
    tagline: 'Identify countries from their flag or borders.',
    description:
      'A geography quiz that challenges you to recognize countries by flag or by border shape.',
    status: 'ready',
  },
  {
    slug: 'mistadex',
    title: 'mistadex',
    tagline: 'Guess the Pokémon from its silhouette.',
    description: 'A Pokémon guessing game — a silhouette appears, type the name before giving up.',
    status: 'ready',
  },
  {
    slug: 'hypemeter',
    title: 'hypemeter',
    tagline: 'Most viewed Wikipedia articles yesterday.',
    description: 'A live ranking of the most read Wikipedia pages from the previous day.',
    status: 'ready',
  },
  {
    slug: 'mistaword',
    title: 'mistaword',
    tagline: 'Guess the 5-letter word in 6 tries.',
    description: 'A Wordle-style game — guess the daily word in six tries.',
    status: 'ready',
  },
  {
    slug: 'mistajack',
    title: 'mistajack',
    tagline: 'Beat the dealer at Blackjack.',
    description:
      'A single-player Blackjack game against a CPU dealer with a persistent credit system.',
    status: 'ready',
  },
  {
    slug: 'mistamuseum',
    title: 'mistamuseum',
    tagline: 'One curated artwork, every day.',
    description:
      'A daily artwork discovery app — one public-domain piece from the Art Institute of Chicago, seeded by date.',
    status: 'ready',
  },
];

export function getAppBySlug(slug: string) {
  return appEntries.find((entry) => entry.slug === slug);
}
