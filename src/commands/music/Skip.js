import { SlashCommandBuilder } from 'discord.js';

class Skip extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('skip');
        super.setDescription('Skip to the next song');
    }
    async run(client, message) {
        if (!message.member.voice.channel) {
            return message.reply('You have to be in a voice channel to do that!');
        }

        const queue = client.player.getQueue(message.guild.id);
        if (!queue) return void message.reply({ content: '❌ | No music is being played!' });
        const currentTrack = queue.current;
        const success = queue.skip();
        return void message.reply({
            content: success ? `✅ | Skipped **${currentTrack}**!` : '❌ | Something went wrong!'
        });
    }

}

const command = new Skip();
export default command;