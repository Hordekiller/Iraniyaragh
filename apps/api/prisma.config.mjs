import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "prisma/config";

const repositoryEnvironment = fileURLToPath(
  new URL("../../.env", import.meta.url),
);
if (existsSync(repositoryEnvironment)) {
  process.loadEnvFile(repositoryEnvironment);
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node prisma/seed.mjs",
  },
});
