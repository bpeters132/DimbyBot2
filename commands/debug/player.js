
module.exports = {
    name: 'player',
    description: 'Used to clear messages, can clear up to 30 messages',
    cooldown: 5,
    guildeOnly: true,
    async execute(client, message) {
        try {
            const guild = await client.guilds.cache.get(message.guildId);
            const queue = await client.player.getQueue(guild);
            if (typeof(queue) == 'undefined'){
                message.reply('There is no queue!');
            }else{
                message.reply(`\`${queue.connection.status}\``);
                console.log(queue.connection.status);
            }

        } catch (error) {
            console.log(error);
            message.reply(`An error occured, please contact <@${process.env.OWNER_ID}>`);
        }
    },
};


