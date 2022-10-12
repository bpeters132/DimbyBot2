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
    async run(client, interaction) {
        const clear_amount = interaction.options.getInteger('count');
        const channel = interaction.channel;

        if (clear_amount <= 30) {
            try {
                await channel.bulkDelete(clear_amount + 1);
                interaction.reply(`Cleared ${clear_amount} messages!`);

            } catch (error) {
                interaction.reply('An error occured, likely a caching issue that isn\'t handled yet! Try clearing less messages.');
            }
        } else {
            interaction.reply('You can only clear up to 30 messages!');
        }


    };
}
const command = new Clear();
export default command;