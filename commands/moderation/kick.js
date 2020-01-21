const {Command} = require('discord.js-commando')

module.exports = class KickCommand extends Command{
    constructor(client) {
        super(client, {
            name: 'kick',
            group: 'moderation',
            memberName: 'kick',
            guildOnly: true,
            description: 'Kicks a specified user',
            clientPermissions: ['KICK_MEMBERS'],
            userPermissions: ['KICK_MEMBERS'],
            args: [
                {
                    key: 'kick_user',
                    prompt: 'Please specify a user to kick',
                    type: 'member'
                },
                {
                    key: 'kick_reason',
                    prompt: 'Please specify a reason for the kick',
                    type: 'string'
                }
            ]
        })
    }

    run(message, {kick_user, kick_reason}) {
       kick_user.kick(kick_reason)
       message.reply(`User ${kick_user} has been kicked for reason: ${kick_reason}`)
    }
}