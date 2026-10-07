/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * The packages are source, not builds: `@achar/*` ships `.ts`/`.tsx` and no
   * `dist/`, so Next has to compile them as if they were part of this app. That
   * is deliberate — one TypeScript program across the app and its packages means
   * a change to a shared component is a change the app's typecheck sees.
   */
  transpilePackages: ['@achar/types', '@achar/schema', '@achar/api', '@achar/auth', '@achar/ui'],
};

export default nextConfig;
