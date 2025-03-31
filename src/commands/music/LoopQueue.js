import { SlashCommandBuilder } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';
import secCheckChannel from '../../lib/secCheckChannel.js';

class LoopQueue extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('loopqueue');
        super.setDescription('Loop the queue');
    }
    async run(client, interaction) {
        const queue = client.player.getQueue(interaction.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, interaction, interaction.guild.id);
        if (!memberInChannel) return;
        if (!queue) return void interaction.reply({ content: '❌ | No music is being played!' });
        const currentMode = queue.repeatMode;

        if (currentMode == 1) {
            const success = queue.setRepeatMode(QueueRepeatMode.OFF);
            return void interaction.reply({ content: success ? 'Queue is no longer looping!' : '❌ | Could not update loop mode!' });
        } else {
            const success = queue.setRepeatMode(QueueRepeatMode.QUEUE);
            return void interaction.reply({ content: success ? 'Queue is looping!' : '❌ | Could not update loop mode!' });
        }


    }

}

const command = new LoopQueue();
export default command;