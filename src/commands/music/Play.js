import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Queries and play\'s a song')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song name or URL')
                .setRequired(true)
        ),
    /**
     * 
     * @param {import('discord.js').Client} client 
     * @param {import('discord.js').CommandInteraction} interaction 
     * 
     */
    async run(client, interaction) {
        const query = interaction.options.getString('query');
        const guild = interaction.guild;
        const member = interaction.member;

        // Check if user is in a voice channel
        const voiceChannel = member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'Join a voice channel first!', ephemeral: true });
        }

        await interaction.deferReply();

        // TODO: Music Searh and Play function
    }
};
