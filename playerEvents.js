const pingDat = require('./lib/pingDat.js');

module.exports.registerPlayerEvents = async (player) => {

    player.on('error', (queue, error) => {
        console.log(`[DEBUG] [${queue.guild.name}] Error emitted from the queue: ${error.message}`);
        pingDat.ping(process.env.PING_ERROR_URL);
    });
    
    player.on('connectionError', (queue, error) => {
        console.log(`[DEBUG] [${queue.guild.name}] Error emitted from the connection: ${error.message}`);
        pingDat.ping(process.env.PING_ERROR_URL);
    });

    player.on('trackStart', async (queue, track) => {
        console.log(`[DEBUG] Playing ${track.title} on ${queue.guild.name}`);
        queue.metadata.send(`🎶 | Started playing: **${track.title}** in **${queue.connection.channel.name}**!`);
    });

    player.on('trackAdd', async (queue, track) => {
        console.log(`[DEBUG] Track ${track.title} added to ${queue.guild.name}`);
        queue.metadata.send(`🎶 | Track **${track.title}** queued!`);
    });

    player.on('botDisconnect', async (queue) => {
        queue.metadata.send('❌ | I was manually disconnected from the voice channel, clearing queue!');
    });

    player.on('channelEmpty', async (queue) => {
        queue.metadata.send('❌ | Nobody is in the voice channel, leaving...');
    });

    player.on('queueEnd', async (queue) => {
        queue.metadata.send('✅ | Queue finished!');
    });

    player.on('debug', async (queue, message) => {
        console.log(`[DEBUG] ${queue}`);
        console.log(`[DEBUG] ${message}`);
    });

};
