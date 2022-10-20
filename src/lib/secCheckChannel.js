export default (client, message, guild) => {
    return new Promise((resolve) => {
        // Check if the requesting member is in a voice channel
        if (!message.member.voice.channel) {
            message.reply('You have to be in a voice channel to do that!');
            return resolve(false);
        }

        // Get queue information for the requester's guild
        const queue = client.player.getQueue(guild);
        // console.log(queue);
        // if the queue exists or not
        if (queue != undefined) {
            // console.log(`Queue Channel: ${queue.connection.channel}`);
            // console.log(`Member Channel: ${message.member.voice.channel}`);
            // if the requester is in the same voice channel as the bot or not
            if (message.member.voice.channel == queue.connection.channel) {
                return resolve(true);
            }
            else {
                message.reply('You have to be in the same voice channel as the bot to do that!');
                return resolve(false);
            }
        }
        else {
            return resolve(true);
        }
    });
};