import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Göreli yollar: alt dizinde (ör. GitHub Pages /perspektive/) de çalışır
  base: './',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
