import { SlashCommandBuilder } from "discord.js"
import nodemailer from "nodemailer"

/**
 * Suggest command.
 * Allows users to submit suggestions via email to a pre-configured address,
 * intended for integration with an issue tracker like GitLab.
 */
export default {
  data: new SlashCommandBuilder()
    .setName("suggest")
    .setDescription("Submit a suggestion to the repository issue board")
    // Option for the suggestion title
    .addStringOption((option) =>
      option.setName("title").setDescription("The title of your suggestion").setRequired(true)
    )
    // Option for the suggestion description
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("A detailed description of your suggestion")
        .setRequired(true)
    ),

  /**
   * Executes the suggestion submission process.
   * @param {import('../../lib/BotClient.js').default} client The bot client instance.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction The interaction object.
   */
  async execute(interaction, client) {
    client.debug(
      `Suggest command invoked by ${interaction.user.tag} in guild ${interaction.guild?.id ?? "DM"}`
    )

    await interaction.deferReply()

    // Get the suggestion details from the command options
    const title = interaction.options.getString("title")
    const description = interaction.options.getString("description")
    const user = interaction.user // Get the user who submitted the suggestion
    client.debug(`Suggestion details - Title: "${title}", User: ${user.tag} (${user.id})`)

    // --- Environment Variable Validation ---
    // Ensure necessary email credentials and recipient address are configured in the environment.
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.GITLAB_EMAIL) {
      client.error(
        "Suggest command failed: Missing required environment variables (EMAIL_USER, EMAIL_PASS, GITLAB_EMAIL)."
      )
      // Inform the user that the bot configuration is incomplete.
      return interaction.editReply({
        content:
          "Suggestion submission is not configured correctly on the bot's end. Please notify the administrator.",
      })
    }
    client.debug("Email environment variables seem present.")

    // --- Nodemailer Transporter Setup ---
    let transporter
    try {
      client.debug("Creating nodemailer transporter for Mailgun...")
      // Configure nodemailer to use Mailgun SMTP
      transporter = nodemailer.createTransport({
        host: "smtp.mailgun.org",
        port: 587, // Standard port for STARTTLS
        secure: false, // `secure: false` means use STARTTLS
        auth: {
          user: process.env.EMAIL_USER, // Mailgun SMTP username (often the full email address)
          pass: process.env.EMAIL_PASS, // Mailgun SMTP password or API key
        },
        // Optional: Add timeout settings to prevent hangs
        connectionTimeout: 10000, // 10 seconds to establish connection
        socketTimeout: 10000, // 10 seconds of inactivity allowed on socket
      })
      client.debug("Nodemailer transporter created successfully.")
    } catch (error) {
      // Log error during transporter creation
      client.error("Suggest command failed: Error creating nodemailer transporter:", error)
      // Inform user about the setup issue
      return interaction.editReply({
        content:
          "There was an error setting up the suggestion submission service. Please try again later.",
      })
    }

    // --- Email Content Definition ---
    const mailOptions = {
      from: process.env.EMAIL_USER, // Sender address (must match Mailgun sending domain/user)
      to: process.env.GITLAB_EMAIL, // Recipient address (e.g., GitLab service desk email)
      subject: title, // Use the user-provided title as the email subject
      // Construct the email body with user and suggestion details
      text: `
Suggestion from Discord user: ${user.tag} (${user.id})

Title: ${title}

Description:
${description}

Submitted at: ${new Date().toISOString()}
      `,
    }
    client.debug(`Mail options prepared for recipient ${mailOptions.to}`)

    // --- Send Email and Handle Response ---
    try {
      client.debug(`Attempting to send email with subject "${title}"...`)
      // Send the email using the configured transporter and options
      const info = await transporter.sendMail(mailOptions)
      // Log success information from the email server response
      client.debug(
        `Email sent successfully! Message ID: ${info.messageId}, Response: ${info.response}`
      )
      // Inform the user of success
      await interaction.editReply({
        content: "Your suggestion has been submitted successfully!",
      })
      client.debug(`Suggest command finished successfully for ${user.tag}.`)
    } catch (error) {
      // Log failure information
      client.error(`Suggest command failed: Error sending email for user ${user.tag}:`, error)
      // Provide specific SMTP error details if available in the error object
      if (error.responseCode) {
        client.error(`SMTP Error Code: ${error.responseCode}, Response: ${error.response}`)
      }
      // Inform the user about the failure
      await interaction.editReply({
        content:
          "There was an error submitting your suggestion. Please try again later or contact an admin if the issue persists.",
      })
    }
  },
}
