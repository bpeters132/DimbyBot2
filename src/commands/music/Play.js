import { SlashCommandBuilder } from 'discord.js';
import { Rest } from 'lavacord';

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
     * @param {import('../../lib/BotClient.js').default} client 
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

        let player = client.manager.players.get(guild.id);

        if (!player) {
            console.log('joining channel');
            console.dir(voiceChannel.id);
            console.log(client.manager.idealNodes[0].id);
            player = await client.manager.join({
                guild: guild.id,
                channel: voiceChannel.id,
                node: '1'
            });

        } else if (player.channelId !== voiceChannel.id) {
            await player.switchChannel(voiceChannel.id);
        }

        // try {
        const node = client.manager.idealNodes[0];
        const result = await Rest.load(node, `scsearch:${query}`);

        if (result.loadType === 'LOAD_FAILED' || result.loadType === 'NO_MATCHES') {
            return interaction.editReply('No results found for that query');
        }

        const track = result.data[0];

        player.play(track.encoded);

        return interaction.editReply(`Now Playing: ${track.info.title}`);

        // } catch (err) {
        //     client.logger.error('Error loading or playing the track', err);
        //     return interaction.editReply('An error occurred while trying to play the track');
        // }

        // interaction.editReply('I did my thinking.. now time to do yours! Have a browse at the console!');

    }
};
