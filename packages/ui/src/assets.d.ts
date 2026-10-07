/**
 * What an image import is, for this package.
 *
 * `@achar/ui` ships the brand assets beside its components, so a component can
 * import `../assets/logo.png` and a screen gets the real mark without every app
 * copying a file into its own `public/`. That import is resolved by the
 * bundler, and TypeScript needs to be told the shape it resolves to — this is
 * that declaration, and it matches what a static import is under `next/image`
 * (which the apps resolve it with) so that reading `.src`, `.width` and
 * `.height` means the same thing in this package's program and in an app's.
 */
declare module '*.png' {
  const image: {
    src: string;
    height: number;
    width: number;
    blurDataURL?: string;
  };
  export default image;
}
