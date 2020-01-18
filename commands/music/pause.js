const { Command } = require('discord.js-commando')

module.exports = class PauseCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'pause',
            group: 'music',
            memberName: 'pause',
            guildOnly: true,
            description: 'Pause the bot\'s playback',
        })
    }

    run(message) {
        var voiceChannel = message.member.voice.channel
        var bot_channel = message.guild.me.voice.channel

        if (!voiceChannel) return message.reply('Join a channel and try again')

        if (
            typeof message.guild.musicData.songDispatcher == 'undefined' ||
            message.guild.musicData.songDispatcher == null
        ) {
            return message.say('There is no song playing right now!')
        }

        if (voiceChannel === bot_channel) {
            message.say('Song paused :pause_button:')
            message.guild.musicData.songDispatcher.pause()
            
        } else {
            return message.reply('You need to be in the same channel as me to use that command!')
        }
    }
}