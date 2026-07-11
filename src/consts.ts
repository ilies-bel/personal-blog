// Site-wide constants. Single source of truth for metadata used in <head>,
// Open Graph cards, JSON-LD, the sitemap, and the layout chrome.
//
// EDIT THESE: name, description, and (in astro.config.mjs) the SITE/BASE URLs.

export const SITE_TITLE = 'Iliès';
export const SITE_DESCRIPTION =
  'Technical writing on web development, tooling, and software craft, by Iliès. Plus a scroll-scrubbed black-hole hero.';
export const SITE_LANG = 'en';

// Proper-case legal/author name for structured data (JSON-LD Person, article
// author fields). BRAND_NAME below is the all-caps display lockup — keep the
// two separate so styling never leaks into metadata.
export const AUTHOR_NAME = 'Iliès Beldjilali';

/**
 * Join a path onto the configured BASE_URL, collapsing duplicate slashes.
 * The single sanctioned way to build a base-relative href — with base '/'
 * naive concatenation yields protocol-relative '//path' URLs that browsers
 * resolve against a bogus host (the favicon bug this replaced).
 */
export function withBase(path: string): string {
  return `${import.meta.env.BASE_URL}/${path}`.replace(/\/+/g, '/');
}

// The signature brand lockup — the hero's persistent identity (name + role).
// Used as the SAME mark everywhere: the home scene (HeroIdentity), the reading-
// page header, and the about overlay. One source of truth so the logo never drifts.
export const BRAND_NAME = 'ILIÈS BELDJILALI';
export const BRAND_ROLE = 'Software Engineer';

// Social links (shown in footer / about). Leave blank to hide.
export const SOCIALS = {
  github: 'https://github.com/ilies-bel',
  twitter: 'https://x.com/ilies_without_y',
  email: 'beldjilali.ilies@gmail.com',
};

// Default social-share image (lives in /public). Replace with your own.
export const DEFAULT_OG_IMAGE = 'og-default.png';

// Availability readout for the /contact route — the mono instrument rows the
// page renders as a <dl>. Safe defaults pending the owner's confirmation
// (tracked in docs/INPUTS-NEEDED.md, P13): status/note/location are the
// fields most likely to change; edit HERE and the contact page follows.
export const AVAILABILITY = {
  status: 'open' as 'open' | 'limited' | 'closed',
  note: 'Open to interesting engagements',
  location: 'France',
  timezone: 'Europe/Paris (CET/CEST)',
  engagements: ['Frontend & creative development', 'Web performance', 'Design engineering'],
  responseTime: 'Usually within 48 hours',
};
