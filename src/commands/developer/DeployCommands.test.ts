import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { afterEach, beforeEach, describe, it, mock } from "node:test"
import { REST } from "discord.js"
import {
    createBotClientFake,
    createSlashInteraction,
    messageContents,
    type RecordedMessage,
} from "../../test-support/commandFakes.js"
import type { ChatInputCommandInteraction } from "discord.js"

const OWNER = "owner-1"
const previousOwner = process.env.OWNER_ID
const previousToken = process.env.BOT_TOKEN

type DeployGlobals = typeof globalThis & {
    __deployDirents?: { name: string; isDirectory: () => boolean; isFile: () => boolean }[]
}

const g = globalThis as DeployGlobals

registerHooks({
    resolve(specifier, context, nextResolve) {
        const parent = context.parentURL ?? ""
        if (specifier === "fs" && parent.includes("/commands/developer/DeployCommands.ts")) {
            return {
                url: "data:text/javascript," + encodeURIComponent(fsSource),
                shortCircuit: true,
            }
        }
        if (specifier.includes("fake-cmd.js")) {
            return {
                url: "data:text/javascript," + encodeURIComponent(commandSource),
                shortCircuit: true,
            }
        }
        return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
        if (url.includes("fake-cmd.js")) {
            return {
                format: "module",
                shortCircuit: true,
                source: `export default { data: { name: "fake", toJSON() { return { name: "fake" } } }, execute() {} }`,
            }
        }
        return nextLoad(url, context)
    },
})

const fsSource = `
const fs = {
    promises: {
        readdir: async () => globalThis.__deployDirents ?? [],
    },
}
export default fs
`

const commandSource = `export default { data: { name: "fake", toJSON() { return { name: "fake" } } }, execute() {} }`

const { default: deployCommands } = await import("./DeployCommands.js")

function fakeFile() {
    g.__deployDirents = [{ name: "fake-cmd.js", isDirectory: () => false, isFile: () => true }]
}

function texts(calls: RecordedMessage[]): string[] {
    return messageContents(calls).filter((value): value is string => typeof value === "string")
}

function attachClient(interaction: ChatInputCommandInteraction, token: string) {
    const raw = interaction as unknown as {
        client: { token: string; user: { id: string } }
    }
    raw.client = { token, user: { id: "app-1" } }
}

beforeEach(() => {
    delete process.env.BOT_TOKEN
    g.__deployDirents = []
    mock.method(REST.prototype, "put", async () => [])
})

afterEach(() => {
    if (previousOwner === undefined) delete process.env.OWNER_ID
    else process.env.OWNER_ID = previousOwner
    if (previousToken === undefined) delete process.env.BOT_TOKEN
    else process.env.BOT_TOKEN = previousToken
    delete g.__deployDirents
    mock.restoreAll()
})

describe("deploycommands", () => {
    it("reports a missing developer id", async () => {
        delete process.env.OWNER_ID
        const { interaction, calls } = createSlashInteraction({ subcommand: "deployglobal" })
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["Command configuration error: Developer ID not set."])
    })

    it("denies users who are not the owner", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: "someone-else",
            subcommand: "deployglobal",
        })
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "Sorry, this command can only be used by the bot developer.",
        ])
    })

    it("says no command files were loaded", async () => {
        process.env.OWNER_ID = OWNER
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "deployglobal",
        })
        attachClient(interaction, "token")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["⚠️ No command files found or loaded."])
    })

    it("says the bot token is missing", async () => {
        process.env.OWNER_ID = OWNER
        fakeFile()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "deployglobal",
        })
        attachClient(interaction, "")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "❌ Bot token is not available (client token unset and BOT_TOKEN missing).",
        ])
    })

    it("requires a guild id for a local deploy", async () => {
        process.env.OWNER_ID = OWNER
        fakeFile()
        const { interaction, calls } = createSlashInteraction({
            guild: null,
            userId: OWNER,
            subcommand: "deploylocal",
        })
        attachClient(interaction, "token")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), ["❌ Guild ID is required for local deploys."])
    })

    it("confirms a guild deploy", async () => {
        process.env.OWNER_ID = OWNER
        fakeFile()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "deploylocal",
        })
        attachClient(interaction, "token")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "✅ Successfully reloaded 1 application (/) commands for guild guild-1.",
        ])
    })

    it("confirms a global deploy", async () => {
        process.env.OWNER_ID = OWNER
        fakeFile()
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "deployglobal",
        })
        attachClient(interaction, "token")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "✅ Successfully reloaded 1 application (/) commands globally.",
        ])
    })

    it("reports a deploy failure", async () => {
        process.env.OWNER_ID = OWNER
        fakeFile()
        mock.method(REST.prototype, "put", async () => {
            throw new Error("discord down")
        })
        const { interaction, calls } = createSlashInteraction({
            userId: OWNER,
            subcommand: "deployglobal",
        })
        attachClient(interaction, "token")
        await deployCommands.execute(interaction, createBotClientFake())
        assert.deepEqual(texts(calls), [
            "❌ Failed to reload application commands. Check console for details. Error: discord down",
        ])
    })
})
