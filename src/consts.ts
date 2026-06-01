// Site-wide constants. Single source of truth for metadata used in <head>,
// Open Graph cards, JSON-LD, the sitemap, and the layout chrome.
//
// EDIT THESE: name, description, and (in astro.config.mjs) the SITE/BASE URLs.

export const SITE_TITLE = 'Iliès';
export const SITE_TAGLINE = 'Engineer. I write about the web, tooling, and the occasional rabbit hole.';
export const SITE_DESCRIPTION =
  'Technical writing on web development, tooling, and software craft, by Iliès. Plus a hero that says hello back.';
export const SITE_AUTHOR = 'Iliès';
export const SITE_LANG = 'en';

// Social links (shown in footer / about). Leave blank to hide.
export const SOCIALS = {
  github: 'https://github.com/ilies-bel',
  twitter: '',
  email: 'beldjilali.ilies@gmail.com',
};

// Default social-share image (lives in /public). Replace with your own.
export const DEFAULT_OG_IMAGE = 'og-default.png';

// === Homepage copy =========================================================
// The long single page reads as a short, honest pitch: who I am, how I work,
// what I've written, and how to reach me. Voice: sharp, precise, warm; funny
// because it's specific, never because it's loud. No em dashes, no buzzwords.

/** The role shown under the name in the hero's top-left identity slot. */
export const HERO_ROLE = 'Software Engineer';

/** Sub-line under the personalized greeting in the hero. */
export const HERO_SUBLINE =
  'Engineer. I build small, precise things for the web and write down what I learned.';

/** The opening statement, one clause per line (revealed line by line). */
export const STATEMENT_LINES = [
  'I build interfaces that feel obvious.',
  'The obvious ones take the longest.',
  'That is usually the point.',
];

/** How I work: a short claim and the clause that earns it. */
export interface Tenet {
  claim: string;
  clause: string;
}
export const TENETS: Tenet[] = [
  {
    claim: 'Ship the boring version first.',
    clause: 'Then earn every clever thing it grows into.',
  },
  {
    claim: 'Read the whole error.',
    clause: 'The fix is almost always in the part people skip.',
  },
  {
    claim: 'Make it work, then make it quiet.',
    clause: 'The best interactions are the ones nobody notices.',
  },
];

/** One muted line introducing the writing list. */
export const WRITING_INTRO =
  'Notes from the build. Mostly the web, tooling, and the occasional rabbit hole.';

/** A short teaser that points at the about page. */
export const ABOUT_TEASER =
  "I'm Iliès, an engineer who likes building things on the web and writing about how they work.";

/** The closing line above the single contact link. */
export const CONTACT_CTA =
  'If you are hiring, or just want to compare notes, my inbox is open.';
