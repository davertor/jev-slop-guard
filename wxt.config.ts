import { defineConfig } from 'wxt';

export default defineConfig({
  vite: () => ({
    build: {
      // Keep content-script identifiers stable; short minify caused runtime collisions.
      minify: false,
    },
  }),
  manifest: {
    name: 'Slop Guard',
    description:
      'Real-time slop detector for X and LinkedIn: Not slop / Stop badges, blur, and a SLOP stamp.',
    permissions: ['storage'],
    host_permissions: [
      'https://x.com/*',
      'https://twitter.com/*',
      'https://www.linkedin.com/*',
      'https://linkedin.com/*',
      'https://api.typesafe.ai/*',
      'https://openrouter.ai/*',
    ],
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
  },
});
