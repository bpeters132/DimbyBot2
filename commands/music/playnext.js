const { QueryType } = require('discord-player');
module.exports = {
    name: 'playnext',
    description: 'Queue a song to play next',
    cooldown: 5,
    guildeOnly: true,
    aliases: ['playn', 'pn'],
    args: true,

    async execute(client, message, args) {
        if (!message.member.voice.channel){
            return message.reply('You have to be in a voice channel to do that!');
        }
        
        const guild = client.guilds.cache.get(message.guildId);
        const channel = guild.channels.cache.get(message.channelId);
        const query = args.join(' ');

        const searchResult = await client.player
            .search(query, {
                requestedBy: message.author,
                searchEngine: QueryType.AUTO
            })
            .catch(() => {
                console.log('he');
            });
        if (!searchResult || !searchResult.tracks.length) return void message.reply({ content: 'No results were found!' });
        const queue = await client.player.getQueue(guild);
        const member = guild.members.cache.get(message.author.id) ?? await guild.members.fetch(message.author.id);
        if (typeof(queue) == 'undefined'){
            return message.reply({ content: `<@${message.author.id}> Cannot playnext when there is no music being played!`});
        }else{
            try {
                if (!queue.connection) await queue.connect(member.voice.channel);
            } catch {
                void client.player.deleteQueue(message.guildId);
                return void message.reply({ content: 'Could not join your voice channel!' });
            }
        }       
        await message.reply({ content: `⏱ | Loading your ${searchResult.playlist ? 'playlist' : 'track'}...` });
        searchResult.playlist ? channel.send({content: `<@${message.author.id}>, Can't playnext a playlist!` }): queue.insert(searchResult.tracks[0]);
        if (!queue.playing) await queue.play();
    },
};