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

        console.log(`Searching for ${query}...`);
        const searchResult = await client.player
            .search(query, {
                requestedBy: ctx.user,
                searchEngine: QueryType.AUTO
            })
            .catch((err) => {
                console.log('Query Failed!');
                console.error(err);
            });
        if (!searchResult || !searchResult.tracks.length) {
            console.log('No Search Results Found!');
            return void ctx.sendFollowUp({ content: 'No results were found!' });
        }
        console.log('Results found.');
        console.log('Getting Queue...');
        const queue = await client.player.createQueue(guild, {
            metadata: channel,
        });
        console.log('Queue attained/created!');
        const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id);
        try {
            if (!queue.connection) {
                console.log('Connecting to member voice channel...');
                await queue.connect(member.voice.channel);
                console.log('Connected to voice channel');
            }
        } catch {
            console.log('Unable to join voice channel');
            console.log('Destryoing queue');
            void client.player.deleteQueue(ctx.guildID);
            console.log('Queue destroyed');
            return void ctx.sendFollowUp({ content: 'Could not join your voice channel!' });
        }
        await ctx.sendFollowUp({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        if (searchResult.playlist) {
            console.log('Adding playlist to queue...');
            queue.addTracks(searchResult.tracks);
            channel.send({ content: `<@${ctx.user.id}>, Playlist queued!` });
            console.log('Playlist queued!');
        } else {
            console.log('Adding track to queue...');
            queue.addTrack(searchResult.tracks[0]);
            console.log('Track added to queue!');
        }
        // searchResult.playlist ? queue.addTracks(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);
        if (!queue.playing) {
            console.log('Telling queue to play...');
            await queue.play();
        }
    }
};
