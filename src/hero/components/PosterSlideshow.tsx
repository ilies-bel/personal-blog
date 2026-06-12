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
 * Per-poster opacity for a position across the four stops — a HARD CUT, no fade.
 * `progress` maps to a position in [0, 3]; whichever stop is nearest is shown solid
 * (opacity 1) and all others are off (0). Exactly one poster is ever visible.
 *
 * Why a hard cut, not a cross-fade: these are STILL photographs of very different
 * objects (a black hole vs a red giant). ANY opacity blend between two such stills
 * muds into a double-exposure at the 50/50 midpoint — the black hole's photon ring
 * ghosts THROUGH the red giant's surface, reading as a render glitch, and the scroll
 * can park right on it. A snap avoids that entirely; it's also the honest reduced-
 * motion behaviour (swap states, don't animate the swap). The visible jump is small
 * because each adjacent pair shares the dark space background, and the manifesto line
 * changes at the same boundary, so the cut reads as turning a page, not a flicker.
 */
function opacityFor(index: number, progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  const position = clamped * (POSTERS.length - 1); // 0..3
  const nearest = Math.round(position); // the stop this scroll position belongs to
  return index === nearest ? 1 : 0;
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
