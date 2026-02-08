import { buildApp } from "./app.js";
import { MemoryRepository } from "./repositories/memory-repo.js";
import { PrismaRepository } from "./repositories/prisma-repo.js";

const port = Number(process.env.PORT ?? 4000);
const repo =
  process.env.USE_MEMORY_DB === "true"
    ? new MemoryRepository()
    : new PrismaRepository();
const app = buildApp(repo);

app.listen(port, () => {
  console.log(`Ultra Fan API listening on http://localhost:${port}`);
});
