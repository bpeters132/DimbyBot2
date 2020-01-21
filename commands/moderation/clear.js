const {Command} = require('discord.js-commando')

module.exports = class ClearCommand extends Command{
    constructor(client) {
        super(client, {
            name: 'clear',
            group: 'moderation',
            memberName: 'clear',
            guildOnly: true,
            description: 'Clears a specified amount of channels',
            clientPermissions: ['MANAGE_MESSAGES'],
            userPermissions: ['MANAGE_MESSAGES'],
            args: [
                {
                    key: 'clear_amount',
                    prompt: 'Please speficy the amount of messages to clear. (Up to 35)',
                    type: 'integer',
                    validate: clear_amount => clear_amount >= 1 && clear_amount <= 35
                }
            ]
        })
    }

    async run(message, {clear_amount}) {
        if (message.author.bot) return

        await message.channel.bulkDelete(clear_amount+1)
        await message.say(`Cleared ${clear_amount} messages!`)

    }
}