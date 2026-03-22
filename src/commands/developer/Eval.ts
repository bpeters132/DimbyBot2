import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, MessageFlags } from "discord.js"
import type { ChatInputCommandInteraction } from "discord.js"
import type BotClient from "../../lib/BotClient.js"

import { inspect } from "util" // Used for formatting output
import { Buffer } from "node:buffer" // For creating file buffers
import { createHash } from "node:crypto"

const MAX_FIELD_LENGTH = 1024 // Discord embed field limit

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
  if (client.token && typeof client.token === 'string') {
    sensitive.set(client.token, '[REDACTED TOKEN]')
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

export default {
  data: new SlashCommandBuilder()
    .setName("eval")
    .setDescription("Executes arbitrary JavaScript code (Developer Only)")
    .addStringOption(option =>
      option.setName("code")
        .setDescription("The code to execute")
        .setRequired(true)),
  async execute(interaction: ChatInputCommandInteraction, client: BotClient): Promise<unknown> {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[EvalCmd] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ 
        content: "Command configuration error: Developer ID not set.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[EvalCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ 
        content: "Sorry, this command can only be used by the bot developer.", 
        flags: [MessageFlags.Ephemeral] 
      })
    }
    // --- End Developer Check ---

    const code = interaction.options.getString("code", true)
    client.debug(evalCodeLogFingerprint(code, interaction.user.tag))

    await interaction.deferReply({ 
      flags: [MessageFlags.Ephemeral] 
    })

    // Get sensitive values BEFORE eval potentially modifies process.env or client
    const sensitiveValues = getSensitiveValues(client)
    
    // Function to perform redaction on a string (longer secrets first so a shorter value cannot leave a prefix unredacted).
    const redact = (str: string): string => {
      let redactedStr = str
      const entries = [...sensitiveValues.entries()].sort((a, b) => b[0].length - a[0].length)
      for (const [value, placeholder] of entries) {
        redactedStr = redactedStr.replaceAll(value, placeholder)
      }
      return redactedStr
    }

    try {
      let evaled = await eval(`(async () => { ${code} })()`)

      if (typeof evaled !== "string") {
        evaled = inspect(evaled) // Inspect objects fully initially
      }

      const cleanedEvaled = redact(evaled) // Redact sensitive info

      const outputEmbed = new EmbedBuilder()
        .setTitle("Eval Result ✅")
        .setColor(0x00FF00)
        .addFields(
          { name: "Input Code", value: `\`\`\`js\n${code.slice(0, MAX_FIELD_LENGTH - 10)}\n\`\`\`` }
        )
        .setTimestamp()
      
      const replyOptions: { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } = {
        embeds: [outputEmbed],
        files: [],
      }

      // Handle Output
      if (cleanedEvaled.length > MAX_FIELD_LENGTH - 10) {
        outputEmbed.addFields({ name: "Output", value: `Output was too long. See attached file.` })
        const outputBuffer = Buffer.from(cleanedEvaled, 'utf8')
        const attachment = new AttachmentBuilder(outputBuffer, { name: 'eval_output.js' })
        replyOptions.files.push(attachment)
      } else {
        outputEmbed.addFields({ name: "Output", value: `\`\`\`js\n${cleanedEvaled}\n\`\`\`` })
      }

      if (code.length > MAX_FIELD_LENGTH - 10) {
        outputEmbed.setFooter({ text: "Note: Input code was truncated in embed." })
      }

      await interaction.editReply(replyOptions)

    } catch (err: unknown) {
      const e = err instanceof Error ? err : new Error(String(err))
      let errorString = e.stack || e.toString()
      errorString = redact(errorString)
      client.error(
        `[EvalCmd] Error executing code [redacted] user=${interaction.user.tag} fingerprint=${evalCodeFingerprint(code, interaction.user.tag)}:`,
        errorString
      )

      const errorEmbed = new EmbedBuilder()
        .setTitle("Eval Error ❌")
        .setColor(0xFF0000)
        .addFields(
          { name: "Input Code", value: `\`\`\`js\n${code.slice(0, MAX_FIELD_LENGTH - 10)}\n\`\`\`` }
        )
        .setTimestamp()
      
      const replyOptions: { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } = {
        embeds: [errorEmbed],
        files: [],
      }

      // Handle Error Output
      if (errorString.length > MAX_FIELD_LENGTH - 10) {
        errorEmbed.addFields({ name: "Error", value: `Error was too long. See attached file.` })
        const errorBuffer = Buffer.from(errorString, 'utf8')
        const attachment = new AttachmentBuilder(errorBuffer, { name: 'eval_error.txt' })
        replyOptions.files.push(attachment)
      } else {
        errorEmbed.addFields({ name: "Error", value: `\`\`\`txt\n${errorString}\n\`\`\`` })
      }

      if (code.length > MAX_FIELD_LENGTH - 10) {
        errorEmbed.setFooter({ text: "Note: Input code was truncated in embed." })
      }

      try {
        await interaction.editReply(replyOptions)
      } catch (editError: unknown) {
        client.error(`[EvalCmd] Failed to edit reply with error embed/file:`, editError)
      }
    }
  },
}
