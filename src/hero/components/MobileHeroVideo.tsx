// MobileHeroVideo — scroll-scrubbed pre-rendered portrait video for phones.
//
// On phones (innerWidth < 768) HeroIsland mounts this instead of the live WebGL
// hero. The video was captured at 720×1280 portrait by scripts/capture-mobile-hero.mjs,
// stepping through scroll progress in fixed increments with the high-tier scene,
// encoded as all-intra H.264 (+ HEVC for Apple devices) so every frame is a keyframe
// and seeking is instantaneous.
//
// `currentTime` is driven by `progress` (the same 0..1 lifecycle axis the live hero
// reads) — the effect runs on every scroll tick and produces the same visual result
// as the GPU rAF loop but at near-zero processing cost.
//
// Graceful fallbacks (deepest → richest):
//   1. poster attribute: the opening black-hole still, shown before the video loads
//      and whenever an error occurs (the browser always renders the poster when
//      playback cannot start).
//   2. video element absent: if JS is off or the element fails construction, the
//      CSS background on .bh-stage (solid #000) is the rock-bottom floor.
import { useEffect, useRef } from 'react';
import { resolveHref } from '../lib/url';
import { SCENE_READY_EVENT } from '../lib/constants';

export interface MobileHeroVideoProps {
  /** 0..1 scroll progress — 0 at the top (black hole), 1 at the bottom (dot). */
  progress: number;
  /** import.meta.env.BASE_URL — the URL prefix the video/poster assets live under. */
  base: string;
}

/**
 * Scroll-scrubbed hero video for phones. Muted, playsinline, poster-backed.
 * currentTime is synced to `progress × duration` on each scroll update.
 */
export default function MobileHeroVideo({ progress, base }: MobileHeroVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep the latest progress in a ref so the loadedmetadata handler can read it
  // without a stale closure (it's registered once on mount, outlives many renders).
  const progressRef = useRef(progress);
  progressRef.current = progress;

  // Seek when scroll progress changes (runs after every render where progress differs).
  // Guards on readyState so we never seek into an unloaded video — the browser
  // silently clamps those seeks, which can leave the poster showing indefinitely.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    if (!isFinite(video.duration) || video.duration <= 0) return;
    video.currentTime = progress * video.duration;
  }, [progress]);

  // On mount: register a one-time loadedmetadata handler so the video jumps to the
  // correct position the instant the browser knows the duration — even if the user
  // has already scrolled away from the top before the metadata arrived.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleMetadata = (): void => {
      if (!isFinite(video.duration) || video.duration <= 0) return;
      video.currentTime = progressRef.current * video.duration;
    };
    // If metadata is already available (e.g. video is cached), seek immediately.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      handleMetadata();
    } else {
      video.addEventListener('loadedmetadata', handleMetadata, { once: true });
    }
    return () => {
      video.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, []);

  // On mount: dispatch 'scene:ready' when the video has its first frame available.
  // The inline script in index.astro listens for this event to reveal the loader
  // (same flow as createScene firing it after the first GPU frame). This keeps the
  // skip-intro button keyboard-accessible during the brief load window, and the
  // index.astro 8 s safety backstop still fires if the video never loads.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const dispatchReady = (): void => {
      document.dispatchEvent(new CustomEvent(SCENE_READY_EVENT));
    };
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      // Video is already buffered (cache hit) — signal immediately.
      dispatchReady();
    } else {
      video.addEventListener('canplay', dispatchReady, { once: true });
      // On error (file missing, codec unsupported, network failure): signal ready
      // immediately so the loader exits and the poster fallback is shown. The
      // index.astro 8 s backstop still fires eventually, but this fires first.
      video.addEventListener('error', dispatchReady, { once: true });
    }
    return () => {
      video.removeEventListener('canplay', dispatchReady);
      video.removeEventListener('error', dispatchReady);
    };
  }, []);

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      ref={videoRef}
      className="bh-mobile-video"
      muted
      playsInline
      aria-hidden="true"
      poster={resolveHref(base, 'assets/posters/poster-1-blackhole.webp')}
      preload="auto"
      /* onError: the poster attribute is the browser's built-in fallback for a
         video that cannot play — no JS intervention needed. We leave the element
         in place so HeroIsland never has to re-mount the GL scene reactively. */
    >
      {/* HEVC (hvc1) first: tighter compression, better quality on Apple/Safari. */}
      <source src={resolveHref(base, 'assets/hero-mobile.hevc.mp4')} type='video/mp4; codecs="hvc1"' />
      {/* H.264 universal fallback — plays everywhere. */}
      <source src={resolveHref(base, 'assets/hero-mobile.mp4')} type="video/mp4" />
    </video>
  );
}
