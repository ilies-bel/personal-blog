/** Editorial content for a Graveyard specimen.
 *  Image paths are NOT included here — they depend on Astro's BASE_URL helper
 *  and are computed in src/pages/graveyard.astro.
 *  index.astro imports this array to derive finaleCounts.specimenCount. */
export interface SpecimenEntry {
  readonly id: string;
  readonly name: string;
  readonly link: { readonly href: string; readonly label: string };
  readonly interred: string;
  readonly cause: string;
  readonly body: readonly string[];
  readonly lesson: string;
}

/** The canonical list of Graveyard specimens.
 *  Adding or removing an entry here automatically updates the finale counter. */
export const SPECIMENS: readonly SpecimenEntry[] = [
  {
    id: 'keywordlens',
    name: 'KeywordLens',
    link: { href: 'https://getkeywordlens.com/', label: 'getkeywordlens.com' },
    interred: '2023',
    cause: 'Market collapsed',
    body: [
      'A SEMrush for stock media. It analyzed searches across the major stock platforms to surface high-demand, low-competition niches, so photographers could shoot what actually sells instead of guessing.',
      "It died the month generative AI went mainstream. The whole premise was helping people find the right photo to shoot. When anyone could generate the exact image they needed on demand, the market I was optimizing for stopped existing. Not a pivot. The ground moved.",
    ],
    lesson:
      "you can execute well and still be on the wrong side of a shift you didn't see coming. Timing isn't a detail. It's the whole bet.",
  },
  {
    id: 'heydaniel',
    name: 'HeyDaniel',
    link: { href: 'https://heydaniel.app/', label: 'heydaniel.app' },
    interred: '2024',
    cause: 'No market validation',
    body: [
      "A context-aware reminder assistant. You'd send it a task by Telegram, a screenshot, or a note, and it would surface the right one based on where you were and what your day looked like. Walk into a shop, your list appears. Capturing cost nothing, remembering cost nothing.",
      "It worked. For me. Generalizing it for other people would have meant a lot more engineering, and I never got any market validation to justify the work. So I stopped building it as a product. I still use it every day.",
    ],
    lesson:
      "I'll happily pour engineering into a problem before checking whether anyone else has it. Validation first, build second. (Also: a tool that only serves you isn't a failure. It just isn't a business.)",
  },
] as const;
