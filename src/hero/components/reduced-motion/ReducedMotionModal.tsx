// Reduced-motion confirmation / explanation modal.
//
// Two situations open it (the mode prop), with different copy + actions:
//
//   'confirm' — the visitor clicked the corner toggle to ENTER reduced motion. We
//     confirm before turning the live animation off ("Continue" / "Cancel"). The
//     reverse direction (turning motion back on) never opens this — it flips at once.
//
//   'explain' — reduced motion is already active because of the OS preference and the
//     visitor has set no manual override. We explain why they see the still version
//     once ("Show full experience" → live hero / "Keep it simple" → stay reduced), so
//     OS users understand the lighter view and can opt into the full hero.
//
// Accessibility: role="dialog" aria-modal, a focus trap, Escape cancels, backdrop
// click cancels (the safe / no-change option), and a visible focus ring. The modal is
// itself reduced-motion-friendly — a simple opacity fade, no transform-heavy motion.
import { useEffect, useRef } from 'react';

export type ReducedMotionModalMode = 'confirm' | 'explain';

export interface ReducedMotionModalProps {
  /** Which copy + actions to show (manual-confirm vs OS-explanation). */
  mode: ReducedMotionModalMode;
  /** Primary action: confirm → enter reduced; explain → leave for the full hero. */
  onConfirm: () => void;
  /** Dismiss with no change (Cancel / Keep it simple / Escape / backdrop click). */
  onCancel: () => void;
}

const COPY: Record<ReducedMotionModalMode, {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
}> = {
  confirm: {
    title: 'Switch to the still version?',
    body:
      'This turns the live animation off and shows a lighter, still version of the '
      + 'hero. The writing and navigation stay exactly the same. You can switch back '
      + 'to motion any time from the same control.',
    confirmLabel: 'Continue',
    cancelLabel: 'Cancel',
  },
  explain: {
    title: 'You are seeing the still version',
    body:
      'Your system asks for reduced motion, so the hero is showing a lighter, still '
      + 'version instead of the live animation. Nothing else changes. If you would '
      + 'rather see the full animated experience, you can switch to it here.',
    confirmLabel: 'Show full experience',
    cancelLabel: 'Keep it simple',
  },
};

export default function ReducedMotionModal({ mode, onConfirm, onCancel }: ReducedMotionModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copy = COPY[mode];

  // Focus the primary action on open and trap focus inside the dialog while it is up.
  // Escape cancels (= the safe / no-change option). We keep focus management here so
  // the modal is self-contained — the parent only owns its open/closed state.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();

    // BACKGROUND INERT — make every body-level subtree outside this dialog
    // inaccessible to assistive technology while the modal is open.
    //
    // `aria-modal="true"` tells well-behaved ATs to ignore the rest of the
    // page, but the HTML `inert` attribute is the robust, author-controlled
    // equivalent: it removes every inerted element from the AT tree AND the
    // Tab sequence, regardless of AT implementation quality.
    //
    // Strategy: walk up from the dialog element to the direct child of
    // <body> that contains it (the Astro island wrapper), then set `inert`
    // on every OTHER direct body child.  We record which siblings were
    // already inert so the cleanup only removes the attribute from the ones
    // WE added it to — never stripping an attribute another actor set.
    const dialog = dialogRef.current;
    let container: Element | null = dialog;
    while (container && container.parentElement !== document.body) {
      container = container.parentElement;
    }
    const siblings = Array.from(document.body.children).filter(el => el !== container);
    const wasInert = siblings.map(el => el.hasAttribute('inert'));
    siblings.forEach(el => el.setAttribute('inert', ''));

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const dlg = dialogRef.current;
      if (!dlg) return;
      const focusable = dlg.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      // Wrap focus at the ends so Tab never escapes the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // Restore each sibling's inert state to exactly what it was before the
      // modal opened — only remove the attribute from siblings WE added it to.
      siblings.forEach((el, i) => {
        if (!wasInert[i]) el.removeAttribute('inert');
      });
      // Restore focus to whatever opened the modal (the corner toggle) on close.
      previouslyFocused?.focus?.();
    };
  }, [onCancel]);

  return (
    <div
      className="bh-rm-modal-backdrop"
      // Backdrop click = cancel (the safe, no-change option). Only when the click
      // lands on the backdrop itself, not when it bubbles up from the dialog.
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className="bh-rm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bh-rm-modal-title"
        aria-describedby="bh-rm-modal-body"
      >
        <h2 id="bh-rm-modal-title" className="bh-rm-modal-title">{copy.title}</h2>
        <p id="bh-rm-modal-body" className="bh-rm-modal-body">{copy.body}</p>
        <div className="bh-rm-modal-actions">
          <button
            type="button"
            className="bh-rm-modal-btn bh-rm-modal-btn--ghost"
            onClick={onCancel}
          >
            {copy.cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className="bh-rm-modal-btn bh-rm-modal-btn--primary"
            onClick={onConfirm}
          >
            {copy.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
