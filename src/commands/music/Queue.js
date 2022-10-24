import { SlashCommandBuilder, ButtonBuilder } from 'discord.js';
import secCheckChannel from '../../lib/secCheckChannel.js';
import pagination from '@acegoal07/discordjs-pagination'


class Queue extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('queue');
        super.setDescription('Get current queue');
    }
    async run(client, message) {
        const queue = client.player.getQueue(message.guild.id);
        // if user asking command isn't in working channel, fail command
        const memberInChannel = await secCheckChannel(client, message, message.guild.id);
        if (!memberInChannel) return;
        if (!queue || !queue.playing) return void message.reply({ content: '❌ | No music is being played!' });
        const currentTrack = queue.current;

        // Declare pages array
        const pages = []
        const tracks = queue.tracks

        // Build an embed for each page 10 songs long and push to pages array
        for (let i = 0; i < tracks.length; i += 10) {

            // Configure nowPlaying song in field format
            const nowPlaying = {
                name: 'Now Playing', value: `**${currentTrack.title}** ([link](${currentTrack.url}))`
            }

            // Structure upcoming songs into array
            const elements = queue.tracks.slice(i, i + 10).map((m, t) => {
                return `${t + i + 1}. **${m.title}** ([link](${m.url}))`
            });

            // Build the actual embed
            const page = {
                color: 0xff0000,
                title: 'Server Queue',
                fields: [nowPlaying, { name: 'Upcoming', value: elements.join('\r\n') }]
            }

            pages.push(page)
        }


        // Don't paginate if only one song is playing
        if (pages.length == 0) {
            message.reply({
                embeds: [{
                    title: 'Server Queue',
                    color: 0xff0000,
                    fields: [{ name: 'Now Playing', value: `**${currentTrack.title}** ([link](${currentTrack.url}))` }]
                }
                ]
            })
        } else {

            // Create pagination by sending pages array to pagination()
            new pagination().setInterface(message)
                .createPages(pages)
                .setButtonList([
                    new ButtonBuilder()
                        .setLabel(`Back`)
                        .setStyle("Primary")
                        .setCustomId(`1`),
                    new ButtonBuilder()
                        .setLabel(`Next`)
                        .setStyle("Primary")
                        .setCustomId(`2`)
                ])
                .paginate()
        }


    }

}

const command = new Queue();
export default command;