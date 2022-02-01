const CustomPlayer = require('../../lib/customPlayer.js');
module.exports = {
    name: 'shuffle',
    description: 'Shuffles the current queue',
    cooldown: 5,
    guildeOnly: true,

    async execute(client, message) {
        if (!message.member.voice.channel){
            return message.reply('You have to be in a voice channel to do that!');
        }
        
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });

        // await queue.shuffle();
        CustomPlayer.shuffle(queue);

        message.reply({ content: '✅ | Queue has been shuffled!' });
    },
};

