import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    classifyMigrateFailure,
    prismaP3009ResolutionHint,
    sanitizeMigrateOutput,
} from "./prismaMigrateOutput.js"

describe("sanitizeMigrateOutput", () => {
    it("redacts database URLs, password/token key=value forms, and bearer tokens", () => {
        const out = sanitizeMigrateOutput(
            [
                "Error: postgresql://user:s3cret@db.example:5432/app",
                "password=hunter2 token=abc secret=xyz",
                "Authorization Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig",
            ].join("\n")
        )
        assert.match(out, /\[REDACTED_DATABASE_URL]/)
        assert.match(out, /password=\[REDACTED]/)
        assert.match(out, /token=\[REDACTED]/)
        assert.match(out, /secret=\[REDACTED]/)
        assert.match(out, /Bearer \[REDACTED]/)
        assert.doesNotMatch(out, /s3cret|hunter2|abc|xyz|eyJhbGci/)
    })
})

describe("classifyMigrateFailure", () => {
    it("prefers network and permission categories", () => {
        assert.equal(classifyMigrateFailure("P1001: Can't reach database server").tag, "[network]")
        assert.equal(classifyMigrateFailure("ECONNREFUSED 127.0.0.1:5432").tag, "[network]")
        assert.equal(classifyMigrateFailure("EACCES: permission denied").tag, "[permission]")
    })

    it("detects P3009 before generic schema wording", () => {
        const out = classifyMigrateFailure(
            "Prisma schema loaded from prisma/schema.prisma\nP3009\nmigrate found failed migrations"
        )
        assert.equal(out.tag, "[p3009-failed-migration]")
        assert.match(out.category, /_prisma_migrations/)
    })

    it("classifies constraint conflicts and falls back to exit-code", () => {
        assert.equal(
            classifyMigrateFailure("Unique constraint failed on guildId").tag,
            "[schema-conflict]"
        )
        assert.equal(
            classifyMigrateFailure("P2002: Unique constraint failed").tag,
            "[schema-conflict]"
        )
        assert.equal(classifyMigrateFailure("unexpected migrate failure").tag, "[exit-code]")
    })
})

describe("prismaP3009ResolutionHint", () => {
    it("embeds the named migration when present", () => {
        const hint = prismaP3009ResolutionHint(
            "The `20260614120000_add_player_session` migration failed"
        )
        assert.match(hint, /20260614120000_add_player_session/)
        assert.match(hint, /migrate resolve --applied/)
        assert.match(hint, /migrate resolve --rolled-back/)
    })

    it("uses a placeholder when the migration name is missing", () => {
        assert.match(prismaP3009ResolutionHint("P3009 without a name"), /<migration_name>/)
    })
})
