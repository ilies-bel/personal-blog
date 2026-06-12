// Reduced-motion feature barrel — the still poster hero, the corner toggle, its
// confirmation/explanation modal, the resolved-preference hook, and the reduced
// mount path. Grouped here so the feature reads as one unit; HeroIsland imports the
// pieces it wires together from this single entry point.
export { default as PosterSlideshow } from './PosterSlideshow';
export type { PosterSlideshowProps } from './PosterSlideshow';
export { default as ReducedMotionToggle } from './ReducedMotionToggle';
export { default as ReducedMotionModal } from './ReducedMotionModal';
export type { ReducedMotionModalMode, ReducedMotionModalProps } from './ReducedMotionModal';
export { mountReducedMotionHero } from './mountReducedMotionHero';
export {
  useReducedMotionPreference,
  resolveReducedMotionNow,
  type ReducedMotionPreference,
} from './useReducedMotionPreference';
