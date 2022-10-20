export default async (client, message, guild) => {
    return new Promise((resolve) =>{
        if (!message.member.voice.channel) {
            message.reply('You have to be in a voice channel to do that!');
            return resolve(false);
        }
        const queue = client.player.getQueue(guild);
        // console.log(queue);
        if (queue != undefined){
            // console.log(`Queue Channel: ${queue.connection.channel}`);
            // console.log(`Member Channel: ${message.member.voice.channel}`);
            if (message.member.voice.channel == queue.connection.channel){
                return resolve(true);
            }else{
                message.reply('You have to be in the same voice channel as the bot to do that!');
                return resolve(false);
            }
        }else{
            return resolve(true);
        }
    });
};