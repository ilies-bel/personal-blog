// Site-wide constants. Single source of truth for metadata used in <head>,
// Open Graph cards, JSON-LD, the sitemap, and the layout chrome.
//
// EDIT THESE: name, description, and (in astro.config.mjs) the SITE/BASE URLs.

export const SITE_TITLE = 'Iliès';
export const SITE_DESCRIPTION =
  'Technical writing on web development, tooling, and software craft, by Iliès. Plus a scroll-scrubbed black-hole hero.';
export const SITE_LANG = 'en';

// Social links (shown in footer / about). Leave blank to hide.
export const SOCIALS = {
  github: 'https://github.com/ilies-bel',
  twitter: '',
  email: 'beldjilali.ilies@gmail.com',
};

// Default social-share image (lives in /public). Replace with your own.
export const DEFAULT_OG_IMAGE = 'og-default.png';
