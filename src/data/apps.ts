import type { Component } from 'svelte';
import { Globe, Eye, Type } from 'lucide-svelte';

export type AppEntry = {
  slug: string;
  title: string;
  tagline: string;
  description: string;
  status: 'ready' | 'planned';
  icon: Component;
};

export const appEntries: AppEntry[] = [
  {
    slug: 'mistageo',
    title: 'mistageo',
    tagline: 'Identify countries from their flag or borders.',
    description:
      'A geography quiz that challenges you to recognize countries by flag or by border shape.',
    status: 'ready',
    icon: Globe,
  },
  {
    slug: 'mistadex',
    title: 'mistadex',
    tagline: 'Guess the Pokémon from its silhouette.',
    description: 'A Pokémon guessing game — a silhouette appears, type the name before giving up.',
    status: 'ready',
    icon: Eye,
  },
  {
    slug: 'mistaword',
    title: 'mistaword',
    tagline: 'Guess the 5-letter word in 6 tries.',
    description: 'A Wordle-style game available in English and Italian.',
    status: 'planned',
    icon: Type,
  },
];

export function getAppBySlug(slug: string) {
  return appEntries.find((entry) => entry.slug === slug);
}
