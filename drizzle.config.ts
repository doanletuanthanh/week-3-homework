import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // DDL must not go through the transaction pooler: migrations use the session pooler / direct URL.
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT ?? "" },
});
