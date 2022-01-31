const { shuffle } = require('../../lib/shuffle.js');
module.exports = {
    name: 'shuffle',
    description: 'Shuffles the current queue',
    guildIDs: process.env.DISCORD_GUILD_ID ? [process.env.DISCORD_GUILD_ID] : undefined,

    async execute(client, message) {
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });

        // await queue.shuffle();
        shuffle(queue);

        message.reply({ content: '✅ | Queue has been shuffled!' });
    },
};

