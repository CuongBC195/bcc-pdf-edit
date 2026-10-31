import { defineConfig } from 'vitest/config';

// Cấu hình riêng cho test: không nạp plugin tích hợp nhân PDF của vite.config.ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});

