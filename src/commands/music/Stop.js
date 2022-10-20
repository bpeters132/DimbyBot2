import { SlashCommandBuilder } from 'discord.js';
import secCheckChannel from '../../lib/secCheckChannel.js';

class Stop extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('stop');
        super.setDescription('stop the music!');
    }
    async run(client, message) {
        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        queue.destroy();
        return void message.reply({ content: '🛑 | Stopped the player!' });

    }
}

const command = new Stop();
export default command;