const logIt = require('./scripts/logIt');
module.exports.registerPlayerEvents = (player) => {

    player.on('error', (queue, error) => {
        console.log(`[${queue.guild.name}] Error emitted from the queue: ${error.message}`);
        queue.metadata.send(`\`\`\`Error emitted from the queue: ${error} \n ${error.message} \`\`\` Contact <@${process.env.OWNER_ID}> for explanation`);
        logIt('error', error.message);
    });
    player.on('connectionError', (queue, error) => {
        console.log(`[${queue.guild.name}] Error emitted from the connection: ${error.message}`);
        queue.metadata.send(`\`\`\`Error emitted from the connection: ${error} \n ${error.message} \`\`\` Contact <@${process.env.OWNER_ID}> for explanation`);
        logIt('error', error.message);
    });

    player.on('trackStart', (queue, track) => {
        queue.metadata.send(`🎶 | Started playing: **${track.title}** in **${queue.connection.channel.name}**!`);
    });

    player.on('trackAdd', (queue, track) => {
        queue.metadata.send(`🎶 | Track **${track.title}** queued!`);
    });

    player.on('botDisconnect', (queue) => {
        queue.metadata.send('❌ | I was manually disconnected from the voice channel, clearing queue!');
    });

    player.on('channelEmpty', (queue) => {
        queue.metadata.send('❌ | Nobody is in the voice channel, leaving...');
    });

    player.on('queueEnd', (queue) => {
        queue.metadata.send('✅ | Queue finished!');
    });

};
