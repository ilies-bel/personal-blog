// Site-wide constants. Single source of truth for metadata used in <head>,
// Open Graph cards, JSON-LD, the sitemap, and the layout chrome.
//
// EDIT THESE: name, description, and (in astro.config.mjs) the SITE/BASE URLs.

export const SITE_TITLE = 'Iliès';
export const SITE_DESCRIPTION =
  'Technical writing on web development, tooling, and software craft, by Iliès. Plus a scroll-scrubbed black-hole hero.';
export const SITE_LANG = 'en';
// OG locale format uses underscore-separated BCP 47 (e.g. en_US), not just 'en'.
export const SITE_OG_LOCALE = 'en_US';

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

// Site owner — used in Person JSON-LD schema and as author in BlogPosting.
// The canonical profile URL is constructed at runtime from Astro.site so that
// changing the site domain in astro.config.mjs keeps everything in sync.
export const SITE_OWNER = {
  name: 'Iliès Beldjilali',
  jobTitle: 'Software Engineer',
  // sameAs: authoritative external profiles for deduplication by search engines.
  sameAs: [
    'https://github.com/ilies-bel',
    'https://x.com/ilies_without_y',
  ],
} as const;
