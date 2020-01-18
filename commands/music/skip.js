const { Command } = require('discord.js-commando')

module.exports = class SkipCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'skip',
            aliases: ['skip-song', 'advance-song'],
            memberName: 'skip',
            group: 'music',
            description: 'Skip the current playing song',
            guildOnly: true
        })
    }

    run(message) {
        const voiceChannel = message.member.voice.channel
        var bot_channel = message.guild.me.voice.channel

        if (!voiceChannel) return message.reply('Join a channel and try again')

        if (
            typeof message.guild.musicData.songDispatcher == 'undefined' ||
            message.guild.musicData.songDispatcher == null
        ) {
            return message.reply('There is no song playing right now!')
        }
        if (voiceChannel === bot_channel) {
            message.guild.musicData.songDispatcher.end()
        } else {
            return message.reply('You need to be in the same channel as me to use that command!')
        }
    }
}