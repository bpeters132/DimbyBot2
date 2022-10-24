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

        const pages = []
        const tracks = queue.tracks

        for (let i = 0; i < tracks.length; i += 10) {
            const fields = [
                {
                    name: 'Now Playing', value: `**${currentTrack.title}** ([link](${currentTrack.url}))`
                }
            ]
            const elements = queue.tracks.slice(i, i + 10).map((m, t) => {
                return { title: `${t + 1} `, value: `**${m.title}** ([link](${m.url}))` }
            });

            elements.forEach(element => {
                fields.push(element)
            });

            const page = {
                color: 0xff0000,
                title: 'Server Queue',
                fields: fields
            }

            // console.log(`Page: ${page}`)

            pages.push(page)
        }

        // console.log(`Pages: ${pages}`)
        try {
            console.log(JSON.parse(pages))
            // pages[0].toJSON()
        } catch (error) {
            console.log(error)
        }

        new pagination().setInterface(message)
            .createPages(JSON.stringify(pages))
            .setButtonList([
                new ButtonBuilder()
                    .setLabel(`1`)
                    .setStyle("Secondary")
                    .setCustomId(`1`),
                new ButtonBuilder()
                    .setLabel(`2`)
                    .setStyle("Secondary")
                    .setCustomId(`2`)
            ])
            .paginate()


        // return void message.reply('I did something! Look at the console!')



        // return void message.reply({
        //     embeds: [
        //         {
        //             title: 'Server Queue',
        //             color: 0xff0000,
        //             fields: [{ name: 'Now Playing', value: `🎶 | **${currentTrack.title}** ([link](${currentTrack.url}))` }]
        //         }
        //     ]
        // });


    }

}

const command = new Queue();
export default command;