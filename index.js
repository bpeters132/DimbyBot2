require('dotenv').config()
const {CommandoClient} = require('discord.js-commando')
const {Structures} = require('discord.js')
const path = require('path')

const token = process.env.token
const prefix = process.env.prefix
const owner_id = process.env.owner_id

Structures.extend('Guild', Guild => {
  class MusicGuild extends Guild {
    constructor(client, data) {
      super(client, data)
      this.musicData = {
        queue: [],
        isPlaying: false,
        songDispatcher: null
      }
    }
  }
  return MusicGuild
})

const client = new CommandoClient({
  commandPrefix: '.',
  owner: owner_id,
  unknownCommandResponse: false
})

client.registry
  .registerDefaultTypes()
  .registerGroups([
    ['fun', 'Commands For Fun'],
    ['moderation', 'Moderation Commands'],
    ['music', 'Music Commands'],
    ['status', 'Bot/Server Status Commands']
  ])
  .registerDefaultGroups()
  .registerDefaultCommands()
  .registerCommandsIn(path.join(__dirname, 'commands'))


client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}! (${client.user.id})`)
    client.user.setActivity(
      `${prefix}help | Running on ${client.guilds.size} servers`
    )
})

client.on('error', console.error)

client.login(token)