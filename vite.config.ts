import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    precision: 12
  }
})
