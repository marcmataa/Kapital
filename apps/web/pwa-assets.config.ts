import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Genera los iconos PNG de la PWA a partir de public/brand/kapital-marca.png:
//   npm run generate-pwa-assets -w @kapital/web
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#07110e' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#07110e' } },
  },
  images: ['public/brand/kapital-marca.png'],
});
