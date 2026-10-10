import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: ["tests/**/*.int.test.ts", "tests/e2e/**"],
        },
      },
      {
        // Needs the local Supabase stack (`pnpm supabase:start`). Files share one database, so they run in turn.
        resolve: { alias },
        test: {
          name: "int",
          environment: "node",
          include: ["tests/**/*.int.test.ts"],
          globalSetup: ["tests/helpers/int-global-setup.ts"],
          setupFiles: ["tests/helpers/int-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
