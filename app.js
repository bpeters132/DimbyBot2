const Discord = require('discord.js');
const token = 'NjYzNjE2MjI4NTIyMTk3MDMw.Xh3slw.Rk5mSx8Np0AJzFQlTb0lSCSMphI'
const client = new Discord.Client();

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
  });
  
  client.on('message', msg => {
    if (msg.content === '.ping') {
      msg.reply('pong');
    }
  });


client.login(token)