import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test shares one client IP (Supertest → 127.0.0.1), so lift the
    // Phase-10 rate-limit ceilings high enough that the suite never throttles
    // itself. Limiter behaviour is covered by tests/p10.hardening.test.ts
    // against an isolated instance with a tiny limit.
    env: {
      RATE_LIMIT_MAX: "100000000",
      AUTH_RATE_LIMIT_MAX: "100000000",
    },
    // Compiled test artifacts from `npm run build` (dist/tests/**) must never
    // run alongside their .ts originals — they share fixtures and collide.
    exclude: [...configDefaults.exclude, "**/dist/**"],
  },
});