import "dotenv/config"
import { defineConfig } from "prisma/config"

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // Allow `prisma generate` in build contexts where DATABASE_URL is not injected yet.
        // Runtime startup still validates real DB connectivity before the bot proceeds.
        url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres",
    },
})
