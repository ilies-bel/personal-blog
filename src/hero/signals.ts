// ===========================================================================
// signals.ts — instant, client-only facts about the visitor.
//
// Everything here is read synchronously from the browser the moment we mount.
// NONE of it requires permission, NONE of it leaves the machine, and NONE of
// it runs on the server (these APIs don't exist during SSG). Always call from
// inside a mounted client component.
// ===========================================================================

export interface Signals {
  // Time
  hour: number; // 0-23 local
  partOfDay: 'small hours' | 'early morning' | 'morning' | 'afternoon' | 'evening' | 'night';
  weekday: string; // e.g. "Saturday"
  isWeekend: boolean;
  timezone: string; // e.g. "Europe/Paris"
  // Locale
  language: string; // e.g. "en-US"
  languageName: string; // e.g. "English"
  // Device
  device: 'phone' | 'tablet' | 'desktop';
  os: string;
  browser: string;
  touch: boolean;
  // Display
  prefersDark: boolean;
  prefersReducedMotion: boolean;
  screenW: number;
  screenH: number;
  viewportW: number;
  viewportH: number;
  fullscreenish: boolean; // viewport ~= screen
  // Context
  referrer: ReferrerInfo;
  // Power / network (best-effort; may be null where unsupported)
  battery: BatteryInfo | null;
  connection: string | null; // e.g. "4g", "slow-2g"
}

export interface ReferrerInfo {
  raw: string;
  kind: 'direct' | 'search' | 'social' | 'aggregator' | 'internal' | 'external';
  source: string | null; // "Google", "Reddit", "Twitter/X", a domain, or null
}

export interface BatteryInfo {
  level: number; // 0..1
  charging: boolean;
}

function partOfDay(h: number): Signals['partOfDay'] {
  if (h < 4) return 'small hours';
  if (h < 7) return 'early morning';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

function detectOS(ua: string): string {
  if (/windows nt/i.test(ua)) return 'Windows';
  // iOS before macOS: modern mobile Safari UAs also contain "Macintosh"-like
  // tokens, so an unordered macOS check would mislabel iPhones/iPads.
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/cros/i.test(ua)) return 'ChromeOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'an unknown OS';
}

function detectBrowser(ua: string): string {
  // Order matters: Edge/Brave/Opera masquerade as Chrome.
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox\//i.test(ua)) return 'Firefox';
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return 'Safari';
  return 'a browser you keep quiet about';
}

function detectDevice(ua: string, w: number): Signals['device'] {
  if (/ipad|tablet/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile/i.test(ua) || w < 600) return 'phone';
  return 'desktop';
}

const SEARCH = /google\.|bing\.|duckduckgo\.|yahoo\.|ecosia\.|baidu\.|yandex\./i;
const SOCIAL: Array<[RegExp, string]> = [
  [/reddit\./i, 'Reddit'],
  [/(twitter\.|t\.co|x\.com)/i, 'Twitter/X'],
  [/(facebook\.|fb\.me)/i, 'Facebook'],
  [/instagram\./i, 'Instagram'],
  [/linkedin\./i, 'LinkedIn'],
  [/(youtube\.|youtu\.be)/i, 'YouTube'],
  [/(mastodon|fosstodon|hachyderm|\.social)/i, 'the fediverse'],
  [/bsky\.|bluesky/i, 'Bluesky'],
  [/(t\.me|telegram)/i, 'Telegram'],
];
const AGGREGATOR: Array<[RegExp, string]> = [
  [/news\.ycombinator\.com|hacker-?news/i, 'Hacker News'],
  [/lobste\.rs/i, 'Lobsters'],
  [/digg\./i, 'Digg'],
];

function classifyReferrer(raw: string, ownHost: string): ReferrerInfo {
  if (!raw) return { raw: '', kind: 'direct', source: null };
  let host = '';
  try {
    host = new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return { raw, kind: 'external', source: null };
  }
  if (host === ownHost.replace(/^www\./, '')) return { raw, kind: 'internal', source: null };
  if (SEARCH.test(host)) {
    const name =
      host.split('.')[0].charAt(0).toUpperCase() + host.split('.')[0].slice(1);
    return { raw, kind: 'search', source: name };
  }
  for (const [re, name] of AGGREGATOR) if (re.test(host)) return { raw, kind: 'aggregator', source: name };
  for (const [re, name] of SOCIAL) if (re.test(host)) return { raw, kind: 'social', source: name };
  return { raw, kind: 'external', source: host };
}

function languageName(code: string): string {
  try {
    const base = code.split('-')[0];
    const dn = new Intl.DisplayNames([code], { type: 'language' });
    return dn.of(base) ?? code;
  } catch {
    return code;
  }
}

/** Read all instant signals. Safe to call only in the browser. */
export function readSignals(): Signals {
  const now = new Date();
  const ua = navigator.userAgent;
  const lang = navigator.language || 'en';
  const screenW = window.screen?.width ?? window.innerWidth;
  const screenH = window.screen?.height ?? window.innerHeight;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const ownHost = window.location.hostname;

  const conn =
    (navigator as any).connection?.effectiveType ??
    (navigator as any).mozConnection?.effectiveType ??
    (navigator as any).webkitConnection?.effectiveType ??
    null;

  return {
    hour: now.getHours(),
    partOfDay: partOfDay(now.getHours()),
    weekday: now.toLocaleDateString(lang, { weekday: 'long' }),
    isWeekend: now.getDay() === 0 || now.getDay() === 6,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'an unknown timezone',
    language: lang,
    languageName: languageName(lang),
    device: detectDevice(ua, viewportW),
    os: detectOS(ua),
    browser: detectBrowser(ua),
    touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    prefersDark: window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
    prefersReducedMotion:
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    screenW,
    screenH,
    viewportW,
    viewportH,
    fullscreenish: viewportW >= screenW - 40 && viewportH >= screenH - 120,
    referrer: classifyReferrer(document.referrer, ownHost),
    battery: null, // filled in asynchronously by readBattery()
    connection: conn,
  };
}

/** Battery is async and Promise-based; resolves to null where unsupported. */
export async function readBattery(): Promise<BatteryInfo | null> {
  try {
    const getBattery = (navigator as any).getBattery;
    if (typeof getBattery !== 'function') return null;
    const b = await getBattery.call(navigator);
    return { level: b.level, charging: b.charging };
  } catch {
    return null;
  }
}
