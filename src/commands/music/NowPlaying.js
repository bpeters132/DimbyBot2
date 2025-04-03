import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('View current playing song'),
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
            return interaction.reply({ content: 'Join a voice channel first!' });
        }

        const player = client.lavalink.players.get(guild.id);

        if (!player || (!player.queue.current && player.queue.length === 0)) {
            return interaction.reply('Nothing is playing.');
        }

        const track = player.queue.current;

        // Optional: format time
        const formatTime = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
        };

        const position = formatTime(player.position);
        const duration = formatTime(track.info.duration);

        const embed = {
            title: '🎵 Now Playing',
            description: `[${track.info.title}](${track.info.uri})\nBy: \`${track.info.author}\``,
            fields: [
                { name: 'Time', value: `\`${position} / ${duration}\`` }
            ],
            thumbnail: { url: track.info.artworkUrl || '' },
            color: 0x00FFAA
        };

        // console.dir(track)
        return interaction.reply({ embeds: [embed] });
    }
};
