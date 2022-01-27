const { SlashCommand, CommandOptionType } = require('slash-create');
const { QueryType } = require('discord-player');
// import { SlashCommand, CommandOptionType } from 'slash-create';
// import QueryType from 'discord-player';


module.exports = class extends SlashCommand {
    constructor(creator) {
        super(creator, {
            name: 'play',
            description: 'Plays a song from youtube',
            options: [
                {
                    name: 'query',
                    type: CommandOptionType.STRING,
                    description: 'The song you want to play',
                    required: true
                }
            ],

            guildIDs: process.env.DISCORD_GUILD_ID ? [process.env.DISCORD_GUILD_ID] : undefined
        });
    }

    async run(ctx) {

        const { client } = require('../app.js');
        await ctx.defer();

        const guild = client.guilds.cache.get(ctx.guildID);
        const channel = guild.channels.cache.get(ctx.channelID);
        const query = ctx.options.query;
        
        console.log(`[DEBUG] Searching for ${query}...`);
        const searchResult = await client.player
            .search(query, {
                requestedBy: ctx.user,
                searchEngine: QueryType.AUTO
            })
            .catch((err) => {
                console.log('[DEBUG] Query Failed!');
                console.error(err);
            });
        if (!searchResult || !searchResult.tracks.length) {
            console.log('[DEBUG] No Search Results Found!');
            return void ctx.sendFollowUp({ content: 'No results were found!' });
        }
        console.log('[DEBUG] Results found.');
        console.log('[DEBUG] Getting Queue...');
        const queue = await client.player.createQueue(guild, {
            metadata: channel,
        });
        console.log('[DEBUG] Queue attained/created!');
        const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id);
        try {
            if (!queue.connection) {
                console.log('[DEBUG] Connecting to member voice channel...');
                await queue.connect(member.voice.channel);
                console.log('[DEBUG] Connected to voice channel');
            }
        } catch {
            console.log('[DEBUG] Unable to join voice channel');
            console.log('[DEBUG] Destryoing queue');
            void client.player.deleteQueue(ctx.guildID);
            console.log('[DEBUG] Queue destroyed');
            return void ctx.sendFollowUp({ content: 'Could not join your voice channel!' });
        }
        await ctx.sendFollowUp({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        if (searchResult.playlist) {
            console.log('[DEBUG] Adding playlist to queue...');
            queue.addTracks(searchResult.tracks);
            channel.send({ content: `<@${ctx.user.id}>, Playlist queued!` });
            console.log('[DEBUG] Playlist queued!');
        } else {
            console.log('[DEBUG] Adding track to queue...');
            queue.addTrack(searchResult.tracks[0]);
            console.log('[DEBUG] Track added to queue!');
        }
        // searchResult.playlist ? queue.addTracks(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);
        if (!queue.playing) {
            console.log('[DEBUG] Telling queue to play...');
            await queue.play();
        }
    }
};
