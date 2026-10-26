import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
function legacyCssCompatPlugin() {
  return {
    name: 'legacy-css-compat',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const [fileName, file] of Object.entries(bundle)) {
        if (fileName.endsWith('.css') && file.type === 'asset' && typeof file.source === 'string') {
          let css = file.source;
          // 1. Remove duplicate lab() definitions overriding solid hex values
          css = css.replace(/--color-[a-z0-9-]+:lab\([^)]+\);?/g, '');
          // 2. Remove ' in oklab' and ' in lab' from gradient positions and linear-gradient
          css = css.replace(/\s+in\s+oklab/g, '');
          css = css.replace(/\s+in\s+lab/g, '');
          // 3. Remove any remaining raw lab() definitions
          css = css.replace(/:lab\([^)]+\);?/g, '');
          file.source = css;
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    legacyCssCompatPlugin(),
  ],
  css: {
    transformer: 'lightningcss',
    lightningcss: {
      targets: {
        chrome: 100 << 16,
        firefox: 100 << 16,
        safari: 15 << 16,
        edge: 100 << 16,
      }
    }
  },
  build: {
    target: ['chrome100', 'firefox100', 'safari15', 'edge100'],
    cssMinify: 'lightningcss',
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'https://complain.ecogreensolar.co.in',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'https://complain.ecogreensolar.co.in',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
