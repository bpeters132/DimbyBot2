const { QueryType } = require('discord-player');
const shuffle = require('../../lib/shuffle.js');

module.exports = {
    name: 'play',
    description: 'example command for code refernece',
    cooldown: 5,
    guildeOnly: true,
    usage: '[query] [shuffle yes/no]',
    args: true,
    guildIDs: process.env.DISCORD_GUILD_ID ? [process.env.DISCORD_GUILD_ID] : undefined,

    async execute(client, message, args) {
        if (args.length > 2) message.reply('You can only have 3 args');

        const guild = client.guilds.cache.get(message.guildId);
        const channel = guild.channels.cache.get(message.channelId);
        const query = args[0];
        var doShuffle = args[1];

        if (doShuffle == 'yes') {
            doShuffle = true;
        } else {
            doShuffle = false;
        }

        console.log(`[DEBUG] Searching for ${query}...`);
        const searchResult = await client.player
            .search(query, {
                requestedBy: message.author,
                searchEngine: QueryType.AUTO
            })
            .catch((err) => {
                console.log('[DEBUG] Query Failed!');
                console.error(err);
            });
        if (!searchResult || !searchResult.tracks.length) {
            console.log('[DEBUG] No Search Results Found!');
            return void message.reply({ content: 'No results were found!' });
        }
        console.log('[DEBUG] Results found.');
        console.log('[DEBUG] Getting Queue...');
        const queue = await client.player.createQueue(guild, {
            metadata: channel,
        });
        console.log('[DEBUG] Queue attained/created!');
        const member = guild.members.cache.get(message.author.id) ?? await guild.members.fetch(message.author.id);
        try {
            if (!queue.connection) {
                console.log('[DEBUG] Connecting to member voice channel...');
                await queue.connect(member.voice.channel);
                console.log('[DEBUG] Connected to voice channel');
            }
        } catch {
            console.log('[DEBUG] Unable to join voice channel');
            console.log('[DEBUG] Destryoing queue');
            void client.player.deleteQueue(message.guildID);
            console.log('[DEBUG] Queue destroyed');
            return void message.reply({ content: 'Could not join your voice channel!' });
        }
        await message.reply({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        if (searchResult.playlist) {
            console.log('[DEBUG] Adding playlist to queue...');
            await queue.addTracks(searchResult.tracks);
            channel.send({ content: `<@${message.author.id}>, Playlist queued!` });
            console.log('[DEBUG] Playlist queued!');
        } else {
            console.log('[DEBUG] Adding track to queue...');
            queue.addTrack(searchResult.tracks[0]);
            console.log('[DEBUG] Track added to queue!');
        }
        // searchResult.playlist ? queue.addTracks(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);
        if (!queue.playing) {
            console.log('[DEBUG] Telling queue to play...');
            if (doShuffle) {
                console.log('[DEBUG] Set to shuffle, shuffling queue...');
                await shuffle(queue);
                console.log('[DEBUG] Queue shuffled!');
                channel.send({ content: `<@${message.author.id}>, Playlist queued and shuffled!` });
                await queue.play();
            }else{
                await queue.play();
            }
            
        }
    },
};