const embedGenerator = require('./lib/embedGenerator');
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
        const response = await embedGenerator.general('🎶 | Started playing:', `${track.title}`);
        console.log(`[DEBUG] Playing ${track.title} on ${queue.guild.name}`);
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send(`🎶 | Started playing: **${track.title}** in **${queue.connection.channel.name}**!`);
    });

    player.on('trackAdd', async (queue, track) => {
        const response = await embedGenerator.general(`🎶 | Track ${track.title} queued!`, '/queue to see the queue');
        console.log(`[DEBUG] Track ${track.title} added to ${queue.guild.name}`);
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send(`🎶 | Track **${track.title}** queued!`);
    });

    player.on('botDisconnect', async (queue) => {
        const response = await embedGenerator.general('❌ | I was manually disconnected from the voice channel, clearing queue!', 'Why so mean?');
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send('❌ | I was manually disconnected from the voice channel, clearing queue!');
    });

    player.on('channelEmpty', async (queue) => {
        const response = await embedGenerator.general('❌ | Nobody is in the voice channel, leaving...', 'So lonely');
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send('❌ | Nobody is in the voice channel, leaving...');
    });

    player.on('queueEnd', async (queue) => {
        queue.metadata.send('✅ | Queue finished!');
    });

    player.on('debug', async (queue, message) => {
        console.log(`[DEBUG] ${queue}`);
        console.log(`[DEBUG] ${message}`);
    });

};
