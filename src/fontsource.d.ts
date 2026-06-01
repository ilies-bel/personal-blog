// Ambient declarations for @fontsource side-effect CSS imports.
// The @fontsource-variable packages ship CSS (no .d.ts), so TypeScript can't
// resolve `import '@fontsource-variable/geist'` on its own. These stubs tell it
// the imports are valid, side-effect-only modules. See src/layouts/BaseLayout.astro.
declare module '@fontsource-variable/geist';
declare module '@fontsource-variable/geist-mono';
