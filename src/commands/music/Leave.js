import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leave')
        .setDescription('Tell the bot to leave'),
    /**
     * 
     * @param {import('../../lib/BotClient.js').default} client 
     * @param {import('discord.js').CommandInteraction} interaction 
     * 
     */
    async run(client, interaction) {
        const guild = interaction.guild;
        const member = interaction.member;

        // Check if user is in a voice channel
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'Join a voice channel first!', ephemeral: true });
        }

        await interaction.deferReply();

        client.manager.leave(guild.id);
        await interaction.editReply('BYE!');
    }
};
