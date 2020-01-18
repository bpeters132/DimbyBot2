const { Command } = require('discord.js-commando')


module.exports = class LeaveCommand extends Command {
  constructor(client) {
    super(client, {
      name: 'leave',
      group: 'music',
      memberName: 'leave',
      guildOnly: true,
      description: 'Leaves voice channel if in one'
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
      return message.reply('There is no song playing right now!')
    }
    if (!message.guild.musicData.queue) {
      return message.say('There are no songs in queue')
    }

    if (voiceChannel === bot_channel){
      message.guild.musicData.songDispatcher.end()
      message.guild.musicData.queue.length = 0
      return
    }else{
      return message.reply('You need to be in the same channel as me to use that command!')
    }
    
  }
}