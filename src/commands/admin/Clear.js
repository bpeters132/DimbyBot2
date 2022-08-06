import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
class Clear extends SlashCommandBuilder {
    constructor() {
        super();
        super.setName('clear');
        super.setDescription('Used to clear messages, can clear up to 30 messages');
        super.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);
        super.addIntegerOption(option =>
            option.setName('count').setDescription('The amount of messages to clear').setRequired(true));
    }
    async run(message) {
        const clear_amount = message.options.getInteger('count');
        const channel = message.channel;

        if (clear_amount <= 30) {
            try {
                await channel.bulkDelete(clear_amount + 1);
                message.reply(`Cleared ${clear_amount} messages!`);

            } catch (error) {
                message.reply('An error occured, likely a caching issue that isn\'t handled yet!');
            }
        } else {
            message.reply('You can only clear up to 30 messages!');
        }


    };
}
const command = new Clear();
export default command;