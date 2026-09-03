import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@adapters': fileURLToPath(new URL('./src/adapters', import.meta.url)),
      '@web': fileURLToPath(new URL('./src/web', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // API 服务独立进程，避免前端热更新打断正在跑的字体任务
    proxy: {
      '/api': { target: 'http://127.0.0.1:5174', changeOrigin: true },
      // 分片产物由 API 服务托管（output/ 目录），需一并代理，否则前端字形预览 404
      '/output': { target: 'http://127.0.0.1:5174', changeOrigin: true },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
