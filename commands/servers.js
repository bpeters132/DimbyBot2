exports.run = (client, message, args) =>{
    guilds = client.guilds
    guild_names = []
    guilds.forEach(guild => {
        guild_names.push(guild.name)
    });
    message.channel.send(guild_names.join('\n'))
}