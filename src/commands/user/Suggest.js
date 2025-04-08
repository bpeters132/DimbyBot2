import { SlashCommandBuilder } from "discord.js"
import nodemailer from "nodemailer"

export default {
    data: new SlashCommandBuilder()
        .setName("suggest")
        .setDescription("Submit a suggestion to the repository issue board")
        .addStringOption(option =>
            option.setName("title")
                .setDescription("The title of your suggestion")
                .setRequired(true))
        .addStringOption(option =>
            option.setName("description")
                .setDescription("A detailed description of your suggestion")
                .setRequired(true)),

    /**
     * @param {import('../lib/BotClient').default} client
     * @param {import('discord.js').ChatInputCommandInteraction} interaction
     */
    async execute(client, interaction) {
        await interaction.deferReply({ ephemeral: true })

        const title = interaction.options.getString("title")
        const description = interaction.options.getString("description")
        const user = interaction.user

        // Create a transporter using Mailgun SMTP
        const transporter = nodemailer.createTransport({
            host: "smtp.mailgun.org",
            port: 587,
            secure: false, // Use false for STARTTLS on port 587
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        })

        // Email content
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.GITLAB_EMAIL,
            subject: title,
            text: `
Suggestion from Discord user: ${user.tag} (${user.id})

Title: ${title}

Description:
${description}

Submitted at: ${new Date().toISOString()}
      `
        }

        try {
            await transporter.sendMail(mailOptions)
            await interaction.editReply({
                content: "✅ Your suggestion has been submitted successfully!",
                ephemeral: true
            })
        } catch (error) {
            client.log(error)
            await interaction.editReply({
                content: "❌ There was an error submitting your suggestion. Please try again later.",
                ephemeral: true
            })
        }
    }
}

