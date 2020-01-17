require('dotenv').config()
const commando = require('discord.js-commando')
const path = require('path')
const token = process.env.token
const prefix = process.env.prefix
const ownerid = process.env.ownerid

const client = new commando.CommandoClient({
  commandPrefix: '.',
  owner: ownerid
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