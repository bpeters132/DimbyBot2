import { SlashCommandBuilder } from 'discord.js'

export default {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Loop the currently playing song')
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('Loop mode')
                .setRequired(true)
                .addChoices(
                    { name: 'Off', value: 'off' },
                    { name: 'Track', value: 'track' },
                    { name: 'Queue', value: 'queue' }
                )),

    /**
     * @param {import('../../lib/BotClient.js').default} client
     * @param {import('discord.js').CommandInteraction} interaction
     */
    async execute(interaction, client) {
        const guild = interaction.guild
        const member = interaction.member

        // Check if user is in a voice channel
        const voiceChannel = member.voice.channel
        if (!voiceChannel) {
        return interaction.reply({ content: "Join a voice channel first!" })
        }
        
        const player = client.lavalink.getPlayer(guild.id)

        if (!player) {
            return interaction.reply({ content: 'There is no player for this guild.'})
        }

        if (!player.playing) {
            return interaction.reply({ content: 'There is nothing playing.'})
        }

        const mode = interaction.options.getString('mode')
        
        switch (mode) {
            case 'off':
                player.setRepeatMode('off')
                return interaction.reply({ content: 'Looping disabled.' })
            case 'track':
                player.setRepeatMode('track')
                return interaction.reply({ content: 'Now looping the current track.' })
            case 'queue':
                player.setRepeatMode('queue')
                return interaction.reply({ content: 'Now looping the queue.' })
        }
    }
}
