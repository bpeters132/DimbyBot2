module.exports = {
    name: 'stop',
    description: 'Stop the player',
    cooldown: 5,
    guildeOnly: true,

    async execute(client, message) {
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        queue.destroy();
        return void message.reply({ content: '🛑 | Stopped the player!' });
    },
};