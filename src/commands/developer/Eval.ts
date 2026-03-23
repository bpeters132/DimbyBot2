import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"
import type { Command } from "../../types/index.js"

import { Buffer } from "node:buffer" // For creating file buffers
import { createHash } from "node:crypto"
import fs from "node:fs"
import { Worker } from "node:worker_threads"
import { fileURLToPath } from "node:url"

const MAX_FIELD_LENGTH = 1024 // Discord embed field limit
const EVAL_WORKER_WALL_MS = 15_000

/** Resolved once at load; ESM URL works on Windows and with special path characters. */
const EVAL_WORKER_PATH = fileURLToPath(new URL("../workers/evalSnippetWorker.js", import.meta.url))
try {
    fs.accessSync(EVAL_WORKER_PATH, fs.constants.R_OK)
} catch {
    throw new Error(
        `[EvalCmd] eval worker missing or unreadable at ${EVAL_WORKER_PATH} (run yarn build).`
    )
}

/** Non-reversible fingerprint for correlating eval logs without storing the raw snippet. */
function evalCodeFingerprint(code: string, userTag: string): string {
    return createHash("sha256").update(`${userTag}\0${code}`, "utf8").digest("hex").slice(0, 16)
}

/** Log-safe line for eval start (never includes the raw code). */
function evalCodeLogFingerprint(code: string, userTag: string): string {
    return `[EvalCmd] Developer ${userTag} executing code [redacted] fingerprint=${evalCodeFingerprint(code, userTag)}`
}

/** Collects sensitive values from the client and environment for redaction. */
function getSensitiveValues(client: BotClient): Map<string, string> {
    const sensitive = new Map<string, string>()

    // Add bot token
    if (client.token && typeof client.token === "string") {
        sensitive.set(client.token, "[REDACTED TOKEN]")
    }

    const sensitiveKey =
        /(?:^|_)(PASS|PWD|PASSWORD|SECRET|TOKEN|CRED|CREDENTIAL|API|KEY|PRIVATE|ACCESS)(?:_|$)/i
    for (const key in process.env) {
        if (!sensitiveKey.test(key)) continue
        const value = process.env[key]
        if (value && typeof value === "string") {
            if (!sensitive.has(value)) {
                sensitive.set(value, `[REDACTED ENV: ${key}]`)
            }
        }
    }
    return sensitive
}

function escapeFenceBreaks(s: string): string {
    return s.replace(/```/g, "`\u200b``")
}

/** Builds a fenced code block for embed fields: escapes triple-backtick runs, respects Discord field length. */
function toCodeBlock(language: string, value: string): string {
    const escaped = escapeFenceBreaks(value)
    const open = `\`\`\`${language}\n`
    const close = "\n```"
    const budget = MAX_FIELD_LENGTH - open.length - close.length
    const body =
        escaped.length > budget
            ? `${escaped.slice(0, Math.max(0, budget - 20))}\n...[truncated]`
            : escaped
    return `${open}${body}${close}`
}

type EvalWorkerMessage = { ok: true; result: string } | { ok: false; error: string }

/** Runs the snippet in a worker thread (VM + wall-clock timeout); does not execute on the main thread. */
function runSnippetInWorker(code: string): Promise<EvalWorkerMessage> {
    return new Promise((resolve) => {
        let settled = false
        const worker = new Worker(EVAL_WORKER_PATH)
        const finish = (out: EvalWorkerMessage) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            void worker.terminate().catch(() => {})
            resolve(out)
        }
        const timer = setTimeout(() => {
            finish({ ok: false, error: "Eval timed out (worker wall clock)." })
        }, EVAL_WORKER_WALL_MS)
        worker.on("message", (msg: unknown) => {
            if (msg && typeof msg === "object" && "ok" in msg) {
                finish(msg as EvalWorkerMessage)
            } else {
                finish({ ok: false, error: "Invalid worker response." })
            }
        })
        worker.on("error", (err) => {
            finish({ ok: false, error: err.stack || err.message })
        })
        worker.on("exit", (code) => {
            if (!settled) {
                finish({ ok: false, error: `Worker exited unexpectedly (code ${code}).` })
            }
        })
        worker.postMessage(code)
    })
}

const evalCommand: Command = {
    data: new SlashCommandBuilder()
        .setName("eval")
        .setDescription("Executes arbitrary JavaScript code (Developer Only)")
        .addStringOption((option) =>
            option.setName("code").setDescription("The code to execute").setRequired(true)
        ),
    async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
        // --- Developer Check ---
        const ownerId = process.env.OWNER_ID
        if (!ownerId) {
            client.error(
                "[EvalCmd] Developer ID is not configured as OWNER_ID in environment variables!"
            )
            try {
                await interaction.reply({
                    content: "Command configuration error: Developer ID not set.",
                    flags: [MessageFlags.Ephemeral],
                })
            } catch (e: unknown) {
                client.error("[EvalCmd] Failed to send configuration error reply:", e)
            }
            return
        }
        if (interaction.user.id !== ownerId) {
            client.debug(
                `[EvalCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`
            )
            try {
                await interaction.reply({
                    content: "Sorry, this command can only be used by the bot developer.",
                    flags: [MessageFlags.Ephemeral],
                })
            } catch (e: unknown) {
                client.error("[EvalCmd] Failed to send access denied reply:", e)
            }
            return
        }
        // --- End Developer Check ---

        const code = interaction.options.getString("code", true)
        client.debug(evalCodeLogFingerprint(code, interaction.user.tag))

        try {
            await interaction.deferReply({
                flags: [MessageFlags.Ephemeral],
            })
        } catch (deferErr: unknown) {
            client.error("[EvalCmd] deferReply failed (transport):", deferErr)
            return
        }

        const sensitiveValues = getSensitiveValues(client)
        const redact = (str: string): string => {
            let redactedStr = str
            const entries = [...sensitiveValues.entries()].sort((a, b) => b[0].length - a[0].length)
            for (const [value, placeholder] of entries) {
                redactedStr = redactedStr.replaceAll(value, placeholder)
            }
            return redactedStr
        }

        let workerOut: EvalWorkerMessage
        try {
            workerOut = await runSnippetInWorker(code)
        } catch (workerErr: unknown) {
            client.error("[EvalCmd] Worker invocation failed:", workerErr)
            try {
                await interaction.editReply({
                    content: "Could not start the eval worker. Check logs.",
                })
            } catch (ioErr: unknown) {
                client.error("[EvalCmd] editReply failed after worker spawn error:", ioErr)
            }
            return
        }

        if (workerOut.ok === false) {
            const errorString = redact(workerOut.error)
            client.error(
                `[EvalCmd] Error executing code [redacted] user=${interaction.user.tag} fingerprint=${evalCodeFingerprint(code, interaction.user.tag)}:`,
                errorString
            )

            const errorEmbed = new EmbedBuilder()
                .setTitle("Eval Error ❌")
                .setColor(0xff0000)
                .addFields({
                    name: "Input Code",
                    value: toCodeBlock("js", code),
                })
                .setTimestamp()

            const replyOptions: { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } = {
                embeds: [errorEmbed],
                files: [],
            }

            const errFenceBudget = MAX_FIELD_LENGTH - 20
            if (errorString.length > errFenceBudget) {
                errorEmbed.addFields({
                    name: "Error",
                    value: "Error was too long. See attached file.",
                })
                const errorBuffer = Buffer.from(errorString, "utf8")
                const attachment = new AttachmentBuilder(errorBuffer, { name: "eval_error.txt" })
                replyOptions.files.push(attachment)
            } else {
                errorEmbed.addFields({ name: "Error", value: toCodeBlock("txt", errorString) })
            }

            if (code.length > MAX_FIELD_LENGTH - 10) {
                errorEmbed.setFooter({ text: "Note: Input code was truncated in embed." })
            }

            try {
                await interaction.editReply(replyOptions)
            } catch (ioErr: unknown) {
                client.error("[EvalCmd] editReply failed (error path, transport):", ioErr)
            }
            return
        }

        const cleanedEvaled = redact(workerOut.result)

        const outputEmbed = new EmbedBuilder()
            .setTitle("Eval Result ✅")
            .setColor(0x00ff00)
            .addFields({
                name: "Input Code",
                value: toCodeBlock("js", code),
            })
            .setTimestamp()

        const replyOptions: { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } = {
            embeds: [outputEmbed],
            files: [],
        }

        const outputFenceBudget = MAX_FIELD_LENGTH - 20
        if (cleanedEvaled.length > outputFenceBudget) {
            outputEmbed.addFields({
                name: "Output",
                value: "Output was too long. See attached file.",
            })
            const outputBuffer = Buffer.from(cleanedEvaled, "utf8")
            const attachment = new AttachmentBuilder(outputBuffer, { name: "eval_output.js" })
            replyOptions.files.push(attachment)
        } else {
            outputEmbed.addFields({
                name: "Output",
                value: toCodeBlock("js", cleanedEvaled),
            })
        }

        if (code.length > MAX_FIELD_LENGTH - 10) {
            outputEmbed.setFooter({ text: "Note: Input code was truncated in embed." })
        }

        try {
            await interaction.editReply(replyOptions)
        } catch (ioErr: unknown) {
            client.error("[EvalCmd] editReply failed (success path, transport):", ioErr)
        }
    },
}

export default evalCommand
