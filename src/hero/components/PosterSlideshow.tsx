// Reduced-motion poster slideshow — the STILL stand-in for the live WebGL hero.
//
// Under the resolved reduced-motion preference HeroIsland renders this instead of
// mounting the GPU engine (no createScene, no rAF loop). It stacks the four
// pre-captured lifecycle posters and cross-fades between adjacent ones from the
// same 0..1 scroll progress the live hero reads, so the manifesto copy still scrubs
// over a matching backdrop:
//
//   progress 0 (top) → blackhole → red-giant → nebula → dot (progress 1, bottom)
//
// OPACITY IS THE ONLY THING THAT ANIMATES. No transform / scale / translate /
// parallax / zoom — that restraint is the whole point of the reduced-motion path.

/** Join the site base (import.meta.env.BASE_URL) with a base-relative asset path,
 *  collapsing any double slashes — mirrors StarMarker's local helper of the same
 *  shape so the poster URLs resolve under the site's base path. */
function resolveHref(base: string, href: string): string {
  return `${base}/${href}`.replace(/\/+/g, '/');
}

/** The four lifecycle posters, in top-of-page → bottom-of-page (reverse-arc)
 *  order. Paths are relative to the site base; resolveHref prefixes BASE_URL. */
const POSTERS: ReadonlyArray<{ src: string; alt: string }> = [
  { src: 'assets/posters/poster-1-blackhole.webp', alt: 'A black hole' },
  { src: 'assets/posters/poster-2-red-giant.webp', alt: 'A red giant star' },
  { src: 'assets/posters/poster-3-nebula.webp', alt: 'A nebula' },
  { src: 'assets/posters/poster-4-dot.webp', alt: 'A lone pale blue dot' },
];

export interface PosterSlideshowProps {
  /** 0..1 scroll progress — 0 at the top (black hole), 1 at the bottom (dot). */
  progress: number;
  /** import.meta.env.BASE_URL — the URL prefix the poster assets live under. */
  base: string;
}

/**
 * Per-poster opacity for a fractional position across the four stops. `progress`
 * is mapped to an index in [0, 3]; the active poster is full-on and its nearer
 * neighbour blends in across the overlap zone, so adjacent posters cross-fade.
 * Only the two posters straddling the current position are ever non-zero.
 */
function opacityFor(index: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const position = clamped * (POSTERS.length - 1); // 0..3
  const distance = Math.abs(index - position);
  if (distance >= 1) return 0;
  return 1 - distance; // linear cross-fade in the [0,1) overlap band
}

export default function PosterSlideshow({ progress, base }: PosterSlideshowProps) {
  return (
    <div className="bh-poster-slideshow" aria-hidden="true">
      {POSTERS.map((poster, index) => (
        <img
          key={poster.src}
          className="bh-poster"
          src={resolveHref(base, poster.src)}
          alt={poster.alt}
          // OPACITY ONLY — no transform of any kind on this layer.
          style={{ opacity: opacityFor(index, progress) }}
          draggable={false}
          decoding="async"
          // The first poster is the opening frame, so let it load eagerly; the
          // rest are below the initial fold of the fade and can defer.
          loading={index === 0 ? 'eager' : 'lazy'}
        />
      ))}
    </div>
  );
}
