import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js"
import { inspect } from "util" // Used for formatting output
import { Buffer } from "node:buffer" // For creating file buffers

const MAX_FIELD_LENGTH = 1024 // Discord embed field limit

// Function to collect sensitive values for redaction
function getSensitiveValues(client) {
  const sensitive = new Map() // Use a Map to store value -> placeholder

  // Add bot token
  if (client.token && typeof client.token === 'string') {
    sensitive.set(client.token, '[REDACTED TOKEN]')
  }

  // Add environment variables containing "PASSWORD"
  for (const key in process.env) {
    if (key.toUpperCase().includes("PASSWORD")) {
      const value = process.env[key]
      // Only redact non-empty strings to avoid issues
      if (value && typeof value === 'string') {
        // Avoid adding the token twice if it's also in env
        if (!sensitive.has(value)) { 
          sensitive.set(value, `[REDACTED ENV: ${key}]`)
        }
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
  /**
   * @param {import('../../lib/BotClient.js').default} client
   * @param {import('discord.js').CommandInteraction} interaction
   */
  async execute(interaction, client) {
    // --- Developer Check ---
    const ownerId = process.env.OWNER_ID
    if (!ownerId) {
      client.error("[EvalCmd] Developer ID is not configured as OWNER_ID in environment variables!")
      return interaction.reply({ content: "Command configuration error: Developer ID not set.", ephemeral: true })
    }
    if (interaction.user.id !== ownerId) {
      client.debug(`[EvalCmd] Denied access to user ${interaction.user.tag} (${interaction.user.id})`)
      return interaction.reply({ content: "Sorry, this command can only be used by the bot developer.", ephemeral: true })
    }
    // --- End Developer Check ---

    const code = interaction.options.getString("code")
    client.debug(`[EvalCmd] Developer ${interaction.user.tag} executing code: ${code}`)

    await interaction.deferReply({ ephemeral: true })

    // Get sensitive values BEFORE eval potentially modifies process.env or client
    const sensitiveValues = getSensitiveValues(client)
    
    // Function to perform redaction on a string
    const redact = (str) => {
      let redactedStr = str
      for (const [value, placeholder] of sensitiveValues.entries()) {
        // Use replaceAll for thoroughness
        redactedStr = redactedStr.replaceAll(value, placeholder)
      }
      return redactedStr
    }

    try {
      // eslint-disable-next-line no-eval
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
      
      let replyOptions = { embeds: [outputEmbed], files: [] }

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

    } catch (err) {
      client.error(`[EvalCmd] Error executing code: ${code}`, err)
      let errorString = err.stack || err.toString() // Get stack trace if available
      errorString = redact(errorString) // Redact sensitive info from error

      const errorEmbed = new EmbedBuilder()
        .setTitle("Eval Error ❌")
        .setColor(0xFF0000)
        .addFields(
          { name: "Input Code", value: `\`\`\`js\n${code.slice(0, MAX_FIELD_LENGTH - 10)}\n\`\`\`` }
        )
        .setTimestamp()
      
      let replyOptions = { embeds: [errorEmbed], files: [] }

      // Handle Error Output
      if (errorString.length > MAX_FIELD_LENGTH - 10) {
        errorEmbed.addFields({ name: "Error", value: `Error was too long. See attached file.` })
        const errorBuffer = Buffer.from(errorString, 'utf8')
        const attachment = new AttachmentBuilder(errorBuffer, { name: 'eval_error.txt' })
        replyOptions.files.push(attachment)
      } else {
        errorEmbed.addFields({ name: "Error", value: `\`\`\`xl\n${errorString}\n\`\`\`` })
      }

      if (code.length > MAX_FIELD_LENGTH - 10) {
        errorEmbed.setFooter({ text: "Note: Input code was truncated in embed." })
      }

      try {
        await interaction.editReply(replyOptions)
      } catch (editError) {
        client.error(`[EvalCmd] Failed to edit reply with error embed/file:`, editError)
      }
    }
  },
} 