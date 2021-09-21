const { SlashCommand, CommandOptionType } = require('slash-create');
const { QueryType } = require('discord-player');

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

        const { client } = require('..');
        console.log('1');
        await ctx.defer();
        console.log('2');
        const guild = client.guilds.cache.get(ctx.guildID);
        console.log('3');
        const channel = guild.channels.cache.get(ctx.channelID);
        console.log('4');
        const query = ctx.options.query;
        console.log('5');
        console.log(query);
        console.log(ctx.user);
        console.log(client.player);
        const searchResult = await client.player
            .search(query, {
                requestedBy: ctx.user,
                searchEngine: QueryType.AUTO
            })
            .catch(() => {
                console.log('he');
            });
        console.log('6');
        if (!searchResult || !searchResult.tracks.length) return void ctx.sendFollowUp({ content: 'No results were found!' });
        console.log('7');
        const queue = await client.player.createQueue(guild, {
            metadata: channel
        });
        console.log('8');
        const member = guild.members.cache.get(ctx.user.id) ?? await guild.members.fetch(ctx.user.id);
        console.log('9');
        try {
            if (!queue.connection) await queue.connect(member.voice.channel);
            console.log('10');
        } catch {
            void client.player.deleteQueue(ctx.guildID);
            console.log('11');
            return void ctx.sendFollowUp({ content: 'Could not join your voice channel!' });
        }
        console.log('12');
        await ctx.sendFollowUp({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        console.log('13');
        searchResult.playlist ? queue.addTracks(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);
        console.log('14');
        if (!queue.playing) await queue.play();
        console.log('15');
    }
};
