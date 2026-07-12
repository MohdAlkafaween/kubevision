import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  datasource: {
    url: "file:./prisma/dev.db",
  },
  migrate: {
    adapter: async () => {
      const { PrismaBetterSQLite } = await import("@prisma/adapter-better-sqlite3");
      return new PrismaBetterSQLite({ url: "file:./prisma/dev.db" });
    },
  },
});
