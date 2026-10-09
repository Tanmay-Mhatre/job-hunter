import { defineConfig } from "vitest/config";

export default defineConfig({
  // The web app's component tests render JSX (tsconfig "jsx": "react-jsx").
  esbuild: { jsx: "automatic" },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/web/test/**/*.test.{ts,tsx}", "services/*/test/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
