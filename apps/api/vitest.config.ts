import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC emits decorator metadata, which NestJS dependency injection needs (esbuild does not).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' }, jsc: { target: 'es2022', parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true } } })],
  test: { include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'], testTimeout: 30_000, hookTimeout: 60_000, fileParallelism: false,
    env: { COOKIE_SECURE: 'false', RATE_LIMIT_DISABLED: 'true' } },
});
