import { SlashCommandBuilder } from 'discord.js';
import { QueryType } from 'discord-player';
import customShuffle from '../../lib/customShuffle.js';
import secCheckChannel from '../../lib/secCheckChannel.js';

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
    async run(client, interaction) {
        // console.log(client);
        // console.log(interaction.member.id);
        // console.log(interaction.guild.id);
        
        const guildId = interaction.guild.id;
        const memberId = interaction.member.id;
        
        const guild = client.guilds.cache.get(guildId);
        // console.log(guild);
        const channel = guild.channels.cache.get(interaction.channelId);
        // console.log('channel', channel);
        
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, interaction, guild);
        if (!memberInChannel) return;

        const doShuffle = interaction.options.getBoolean('shuffle');
        // console.log(doShuffle);

        const query = interaction.options.getString('query');
        console.log(query);

        const searchResult = await client.player
            .search(query, {
                requestedBy: interaction.user,
                searchEngine: QueryType.AUTO
            })
            .catch((err) => {
                console.log(err);
            });
        // if (!searchResult || !searchResult.tracks.length) return void interaction.reply({ content: 'No results were found!' });
        if (!searchResult) {
            interaction.reply('No results found!');
            return console.log('1', searchResult);
        } else if (!searchResult.tracks.length) {
            interaction.reply('No results found!');
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
            void client.player.deleteQueue(interaction.guildID);
            return void interaction.reply({ content: 'Could not join your voice channel!' });
        }

        await interaction.reply({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
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