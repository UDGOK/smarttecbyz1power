// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://smarttec.z1power.com',
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
