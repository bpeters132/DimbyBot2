import { SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import customShuffle from '../../lib/customShuffle.js';
import playdl from 'play-dl';

class Play extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('play');
        super.setDescription('Query and play a song!');
        super.addStringOption(option =>
            option.setName('query').setDescription('Search the song you want to play').setRequired(true));
        super.addBooleanOption(option =>
            option.setName('shuffle').setDescription('Shuffle playlist if link is playlist').setRequired(false));

    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        // console.log(client);
        // console.log(message.member.id);
        // console.log(message.guild.id);

        const guildId = message.guild.id;
        const memberId = message.member.id;

        const guild = client.guilds.cache.get(guildId);
        // console.log(guild);
        const channel = guild.channels.cache.get(message.channelId);
        // console.log('channel', channel);

        const doShuffle = message.options.getBoolean('shuffle');
        // console.log(doShuffle);

        const query = message.options.getString('query');
        console.log(query);

        const searchResult = await client.player
            .search(query, {
                requestedBy: message.user,
                searchEngine: QueryType.AUTO
            })
            .catch(() => {
                console.log('he');
            });
        // if (!searchResult || !searchResult.tracks.length) return void message.reply({ content: 'No results were found!' });
        if (!searchResult) {
            message.reply('No results found!');
            return console.log('1', searchResult);
        } else if (!searchResult.tracks.length) {
            message.reply('No results found!');
            return console.log('2', searchResult);
        } else {
            console.log(searchResult);
        }

        const queue = await client.player.createQueue(guild, {
            ytdlOptions: {
                filter: 'audioonly',
                highWaterMark: 1 << 30,
                dlChunkSize: 0,
            },
            metadata: channel,
            // async onBeforeCreateStream(track, source, _queue) {
            //     // only trap youtube source
            //     if (source === 'youtube') {
            //         console.log(source);
            //         // track here would be youtube track
            //         return (await playdl.stream(track.url, { discordPlayerCompatibility: true })).stream;
            //         // we must return readable stream or void (returning void means telling discord-player to look for default extractor)
            //     }
            // }
        });

        const member = guild.members.cache.get(memberId) ?? await guild.members.fetch(memberId);
        try {
            if (!queue.connection) await queue.connect(member.voice.channel);
        } catch {
            void client.player.deleteQueue(message.guildID);
            return void message.reply({ content: 'Could not join your voice channel!' });
        }

        await message.reply({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        if (searchResult.playlist) {
            // console.log('[DEBUG] Adding playlist to queue...');
            await queue.addTracks(searchResult.tracks);
            if (doShuffle) {
                // console.log('[DEBUG] Told to shuffle, shuffling playlist...');
                await customShuffle(queue);
                // console.log('[DEBUG] Shuffling complete!');
            }
            // console.log('[DEBUG] Playlist queued!');
        } else {
            // console.log('[DEBUG] Adding track to queue...');
            queue.addTrack(searchResult.tracks[0]);
            // console.log('[DEBUG] Track added to queue!');
        }
        // searchResult.playlist ? queue.addTracks(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);

        if (!queue.playing) await queue.play();
    }

}
const command = new Play();
export default command;