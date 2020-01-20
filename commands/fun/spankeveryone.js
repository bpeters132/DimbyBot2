const { Command } = require('discord.js-commando')

module.exports = class SpankCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'spankeveryone',
            group: 'fun',
            memberName: 'spankeveryone',
            description: 'Spanks everyone in the server.',
            ownerOnly: true
        })
    }

    run(message) {
        var guild_members = message.guild.members
        
        guild_members.forEach(element => {
            message.say(`${element} has been spanked!`)
        });
    }
}