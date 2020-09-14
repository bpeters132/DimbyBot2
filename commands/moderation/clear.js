const {Command} = require('discord.js-commando')
const unirest = require('unirest')

module.exports = class ClearCommand extends Command{
    constructor(client) {
        super(client, {
            name: 'clear',
            group: 'moderation',
            memberName: 'clear',
            guildOnly: true,
            description: 'Clears a specified amount of messages',
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

        // Ping Pingdat every clear command
        const request = unirest("GET", `https://pingdat.io/?t=dmbybtclrcmd5748&v=${clear_amount}`)
        request.end(function (response) {
            if (response.error){
                message.reply('An error has occurred, please contact the bot owner.')
                return console.error('GET error: ', response.error)
            }
            console.log("Pinged Pingdat!")
        })


        await message.channel.bulkDelete(clear_amount+1)
        await message.reply(`Cleared ${clear_amount} messages!`)

    }
}