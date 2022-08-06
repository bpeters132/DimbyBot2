import { SlashCommandBuilder } from 'discord.js';

class Stop extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('stop');
        super.setDescription('stop the music!');
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        queue.destroy();
        return void message.reply({ content: '🛑 | Stopped the player!' });

    }
}

const command = new Stop();
export default command;