module.exports = {
    name: 'skip',
    description: 'Skip to the next song',
    cooldown: 5,
    guildeOnly: true,

    async execute(client, message) {
        if (!message.member.voice.channel){
            return message.reply('You have to be in a voice channel to do that!');
        }
        
        const queue = client.player.getQueue(message.guildId);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentTrack = queue.current;
        const success = queue.skip();
        return void message.reply({
            content: success ? `✅ | Skipped **${currentTrack}**!` : '❌ | Something went wrong!'
        });
    },
};