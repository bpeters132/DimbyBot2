import { SlashCommandBuilder } from 'discord.js';
import secCheckChannel from '../../lib/secCheckChannel.js';

class Queue extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('queue');
        super.setDescription('Get current queue');
        super.addIntegerOption(option =>
            option.setName('page').setDescription('Specific page number in queue').setRequired(false));

    }
    async run(client, message) {
        let pageCount = message.options.getInteger('page');

        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue || !queue.playing) return void message.reply({ content: '❌ | No music is being played!' });
        if (!pageCount) pageCount = 1;
        const pageStart = 10 * (pageCount - 1);
        const pageEnd = pageStart + 10;
        const currentTrack = queue.current;
        const tracks = queue.tracks.slice(0, 10).map((m, i) => {
            return `${i + 1}. **${m.title}** ([link](${m.url}))`;
        });

        return void message.reply({
            embeds: [
                {
                    title: 'Server Queue',
                    description: `${tracks.join('\n')}${queue.tracks.length > pageEnd
                        ? `\n...${queue.tracks.length - pageEnd} more track(s)`
                        : ''
                        }`,
                    color: 0xff0000,
                    fields: [{ name: 'Now Playing', value: `🎶 | **${currentTrack.title}** ([link](${currentTrack.url}))` }]
                }
            ]
        });


    }

}

const command = new Queue();
export default command;