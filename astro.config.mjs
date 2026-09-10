// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://www.smarttec.dev',
  // Preserve spaces around inline expressions when upgrading from Astro 5.
  compressHTML: true,
  // Static by default — every public page still prerenders. The adapter exists
  // for the handful of routes that opt out with `prerender = false`: the news
  // brief and the private investor section.
  //
  // Vercel is the deployment target. It has no preview server, though, and
  // `npm run verify` needs something to point at — so `npm run preview`
  // builds against the Node adapter instead and serves the real compiled
  // output on 4321, which is where verify.mjs looks by default.
  adapter: process.env.SMARTTEC_BUILD_TARGET === 'node' ? node({ mode: 'standalone' }) : vercel(),
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: {
      target: 'es2022',
      // Keep the WebGL layer out of the critical path — it is a separate chunk
      // that only the cinematic island requests.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('node_modules/gsap')) return 'gsap';
            if (id.includes('node_modules/howler')) return 'howler';
            // Forced into its own chunk so Astro cannot inline it. The
            // investor CSP is `script-src 'self'` with no `unsafe-inline`,
            // and an inlined login handler is a blocked script — which
            // presents as the form doing a native GET with the password in
            // the query string. See client/login.mjs.
            if (id.includes('smarttec-investor/client/login')) return 'investor-login';
            // The small chapter controller must also remain external under
            // the private room's same-origin-only script policy.
            if (id.includes('smarttec-investor/client/journey')) return 'investor-journey';
            if (id.endsWith('/src/lib/menu.ts')) return 'site-menu';
            if (id.endsWith('/src/lib/cinematic.mjs')) return 'cinematic-art';
            if (id.endsWith('/src/lib/menu-preview.mjs')) return 'menu-preview';
          },
        },
      },
    },
  },
});
