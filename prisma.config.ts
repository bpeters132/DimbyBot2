import "dotenv/config"
import { defineConfig } from "prisma/config"
// Runtime image copies this compiled module next to prisma.config.ts (see Dockerfile).
// Do not import other `src/` files here — they are not in the production image.
import { resolvePrismaDatasourceUrl } from "./src/util/prismaDatasourceUrl.js"

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        url: resolvePrismaDatasourceUrl(),
    },
})
