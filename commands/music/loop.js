const { QueueRepeatMode } = require('discord-player');
module.exports = {
    name: 'loop',
    description: 'Loop the track',
    cooldown: 5,
    guildeOnly: true,

    async execute(client, message) {
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentMode = queue.repeatMode;
        
        if (currentMode == 1){
            const success = queue.setRepeatMode(QueueRepeatMode.OFF);
            return void message.reply({ content: success ? 'Track is no longer looping!' : '❌ | Could not update loop mode!' });
        }else{
            const success = queue.setRepeatMode(QueueRepeatMode.TRACK);
            return void message.reply({ content: success ? 'Track is looping!' : '❌ | Could not update loop mode!' });
        }
        
    },
};