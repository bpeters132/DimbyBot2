require('dotenv').config()
const discord = require('discord.js')
const token = process.env.token
const prefix = process.env.prefix

const client = new discord.Client()

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`)
  client.user.setActivity(
    `${prefix}help | Running on ${client.guilds.size} servers`
  )
})

client.on('message', message =>{
  if (!message.content.startsWith(prefix) || message.author.bot) return

  const args = message.content.slice(prefix.length).split(/ +/)
  const command = args.shift().toLowerCase()

  if(command === 'ping'){
    message.reply('pong!')
  }
  else if (command === 'args_info'){
    if(!args.length) {
      return message.channel.send(`You didn't specify any args, ${message.author}`)
    }

    message.channel.send(`Command name: ${command}\nArguments: ${args}`)
  }
  else if (command === 'kick'){
    if (!message.mentions.users.size) {
      return message.reply('You need to specify a user for this command to work!')
    }

    const taggedUser = message.mentions.users.first()

    message.channel.send(`You wanted to kick: ${taggedUser.username}`)
  }
  else if (command ==='avatar'){
    if (!message.mentions.users.seize){
      return message.reply(`Your Avater: <${message.author.displayAvatarURL}>`)
    }

    const avatarList = message.mentions.users.map(user => {
      return `${user.username}'s avater: <${user.displayAvatarURL}>`
    })

    message.channel.send(avatarList);
  }
})

client.login(token)