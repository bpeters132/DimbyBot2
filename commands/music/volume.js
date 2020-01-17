const { Command } = require('discord.js-commando')

module.exports = class VolumeCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'volume',
            group: 'music',
            memberName: 'volume',
            guildOnly: true,
            description: 'Adjust bot volume 1 to 100, default is 10',
            throttling: {
                usages: 1,
                duration: 5,
            },
            args: [
                {
                    key: 'desiredVolume',
                    prompt: 'What would you like the volume set to? 1 to 100 (Default volume is 10%)',
                    type: 'integer',
                    validate: desiredVolume => desiredVolume >= 1 && desiredVolume <= 100
                }
            ]
        })
    }

    run(message, { desiredVolume }) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('Join a channel and try again');
    
        if (
          typeof message.guild.musicData.songDispatcher == 'undefined' ||
          message.guild.musicData.songDispatcher == null
        ) {
          return message.reply('There is no song playing right now!');
        }
        const volume = desiredVolume / 100;
        message.guild.musicData.songDispatcher.setVolume(volume);
        message.reply(`Volume has been set to **${desiredVolume}**%`)
      }
    };