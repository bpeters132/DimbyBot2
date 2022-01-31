module.exports = {
    name: 'nowplaying',
    description: 'Tells you what\'s currently playing',
    cooldown: 5,
    guildeOnly: true,
    aliases: ['np'],

    async execute(client, message) {
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const progress = queue.createProgressBar();
        const perc = queue.getPlayerTimestamp();
        const source = queue.current.source;

        return void message.reply({
            embeds: [
                {
                    title: 'Now Playing',
                    description: `🎶 | **${queue.current.title}**! (\`${perc.progress}%\`)`,
                    fields: [
                        {
                            name: '\u200b',
                            value: progress
                        }, {
                            name: 'Source',
                            value: source
                        }
                    ],
                    color: 0xffffff
                }
            ]
        });
    },
};