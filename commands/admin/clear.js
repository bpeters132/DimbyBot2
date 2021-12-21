
module.exports = {
    name: 'clear',
    description: 'Used to clear messages, can clear up to 30 messages',
    cooldown: 5,
    guildeOnly: true,
    permissions: 'MANAGE_MESSAGES',
    usage: '[number of messages to clear]',
    args: true,
    async execute(client, message, args) {
        if (args.length != 1) {
            return message.reply(
                `Invalid arguments, please reference ${process.env.PREFIX}help`
            );
        }

        try {
            const clear_amount = Number(args[0]);
            const channel = message.channel;
            const author = message.author;
            if (clear_amount <= 30) {
                await message.channel.bulkDelete(clear_amount + 1);
                await channel.send(
                    `<@${author.id}>, Cleared ${clear_amount} messages!`
                );
            }else{
                await message.reply(`Invalid arguments, please reference ${process.env.PREFIX}help clear`);
            }
        } catch (error) {
            message.reply(`An error occured, please contact <@${process.env.OWNER_ID}>`);
        }
    },
};
