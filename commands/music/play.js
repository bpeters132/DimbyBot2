const { QueryType } = require('discord-player');
const CustomPlayer = require('../../lib/customPlayer.js');

module.exports = {
    name: 'play',
    description: 'Play a song',
    cooldown: 5,
    guildeOnly: true,
    aliases: ['p', 'pl'],
    usage: '[query] [shuffle or no if playlist]',
    args: true,

    async execute(client, message, args) {
        const guild = client.guilds.cache.get(message.guildId);
        const channel = guild.channels.cache.get(message.channelId);

        var doShuffle = args.pop();

        if (doShuffle == 'shuffle') {
            doShuffle = true;
        } else {
            args.push(doShuffle);
            doShuffle = false;
        }

        const query = args.join(' ');

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
            void client.player.deleteQueue(message.guildId);
            console.log('[DEBUG] Queue destroyed');
            return void message.reply({ content: 'Could not join your voice channel!' });
        }
        await message.reply({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        if (searchResult.playlist) {
            console.log('[DEBUG] Adding playlist to queue...');
            await queue.addTracks(searchResult.tracks);
            if (doShuffle) {
                console.log('[DEBUG] Told to shuffle, shuffling playlist...');
                await CustomPlayer.shuffle(queue);
                console.log('[DEBUG] Shuffling complete!');
                channel.send({ content: `<@${message.author.id}>, Playlist shuffled and queued!` });
            } else {
                channel.send({ content: `<@${message.author.id}>, Playlist queued!` });
            }
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
    },
};