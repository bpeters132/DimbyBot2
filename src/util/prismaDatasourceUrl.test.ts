import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { resolvePrismaDatasourceUrl } from "./prismaDatasourceUrl.js"

describe("resolvePrismaDatasourceUrl", () => {
    it("prefers an explicit DATABASE_URL", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({
                DATABASE_URL: "postgresql://bot_user:secret@postgres-db:5432/bot_db",
                POSTGRES_USER: "ignored",
                POSTGRES_DB: "ignored",
            }),
            "postgresql://bot_user:secret@postgres-db:5432/bot_db"
        )
    })

    it("builds a host-local URL from POSTGRES_* when DATABASE_URL is unset", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({
                POSTGRES_USER: "bot_user",
                POSTGRES_PASSWORD: "p@ss word",
                POSTGRES_DB: "bot_db",
            }),
            "postgresql://bot_user:p%40ss%20word@localhost:5432/bot_db"
        )
    })

    it("treats a blank DATABASE_URL as unset", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({
                DATABASE_URL: "  ",
                POSTGRES_USER: "bot_user",
                POSTGRES_PASSWORD: "secret",
                POSTGRES_DB: "bot_db",
            }),
            "postgresql://bot_user:secret@localhost:5432/bot_db"
        )
    })

    it("uses postgres-db when assembling from POSTGRES_* in production", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({
                NODE_ENV: "production",
                POSTGRES_USER: "bot_user",
                POSTGRES_PASSWORD: "secret",
                POSTGRES_DB: "bot_db",
            }),
            "postgresql://bot_user:secret@postgres-db:5432/bot_db"
        )
    })

    it("encodes user and database names that contain URL delimiters", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({
                POSTGRES_USER: "user@name",
                POSTGRES_PASSWORD: "secret",
                POSTGRES_DB: "db/name?x#y",
            }),
            "postgresql://user%40name:secret@localhost:5432/db%2Fname%3Fx%23y"
        )
    })

    it("falls back to the generate dummy URL when neither source is set", () => {
        assert.equal(
            resolvePrismaDatasourceUrl({}),
            "postgresql://postgres:postgres@localhost:5432/postgres"
        )
    })
})
