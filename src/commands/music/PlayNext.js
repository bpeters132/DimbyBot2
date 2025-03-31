import { SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import secCheckChannel from '../../lib/secCheckChannel.js';

class PlayNext extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('playnext');
        super.setDescription('Queue a song to play next');
        super.addStringOption(option =>
            option.setName('query').setDescription('query the song to play next').setRequired(true));
    }
    async run(client, interaction) {
        const guild = client.guilds.cache.get(interaction.guild.id);
        
        const queue = await client.player.getQueue(guild);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, interaction, guild);
        if (!memberInChannel) return;
        if (!queue || !queue.playing) return void interaction.reply({ content: '❌ | No music is being played!' });

        const query = interaction.options.getString('query');
        const searchResult = await client.player
            .search(query, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO
            })
            .catch(() => {
                console.log('he');
            });

        if (!searchResult || !searchResult.tracks.length) return void interaction.reply({ content: 'No results were found!' });
        queue.insert(searchResult.tracks[0]);
        await interaction.reply({ content: '⏱ | Loading your track...' });

    }

}

const command = new PlayNext();
export default command;