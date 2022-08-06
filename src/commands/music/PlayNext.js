import { SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';


class PlayNext extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('playnext');
        super.setDescription('Queue a song to play next');
        super.addStringOption(option =>
            option.setName('query').setDescription('query the song to play next').setRequired(true));
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const guild = client.guilds.cache.get(message.guild.id);

        const queue = await client.player.getQueue(guild);
        if (!queue || !queue.playing) return void message.reply({ content: '❌ | No music is being played!' });

        const query = message.options.getString('query');
        const searchResult = await client.player
            .search(query, {
                requestedBy: message.user,
                searchEngine: QueryType.AUTO
            })
            .catch(() => {
                console.log('he');
            });

        if (!searchResult || !searchResult.tracks.length) return void message.reply({ content: 'No results were found!' });
        queue.insert(searchResult.tracks[0]);
        await message.reply({ content: '⏱ | Loading your track...' });

    }

}

const command = new PlayNext();
export default command;