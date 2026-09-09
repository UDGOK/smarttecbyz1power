// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://smarttec.z1power.com',
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
          },
        },
      },
    },
  },
});
