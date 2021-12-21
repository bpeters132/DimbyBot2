const egenerator = require('./lib/embedGenerator');

module.exports.registerPlayerEvents = async (player) => {

    player.on('error', (queue, error) => {
        console.log(`[${queue.guild.name}] Error emitted from the queue: ${error.message}`);
        queue.metadata.send(`\`\`\`Error emitted from the queue: ${error} \n ${error.message} \`\`\` Contact <@${process.env.OWNER_ID}> for explanation, \nI'M VERY BUGGY LEAVE ME ALONE`);
    });
    player.on('connectionError', (queue, error) => {
        console.log(`[${queue.guild.name}] Error emitted from the connection: ${error.message}`);
    });

    player.on('trackStart', async (queue, track) => {
        const response = await egenerator.general('🎶 | Started playing:', `${track.title}`, ['In Channel:'], [`${queue.connection.channel.name}`]);
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send(`🎶 | Started playing: **${track.title}** in **${queue.connection.channel.name}**!`);
    });

    player.on('trackAdd', async (queue, track) => {
        const response = await egenerator.general(`🎶 | Track ${track.title} queued!`, '/queue to see the queue');
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send(`🎶 | Track **${track.title}** queued!`);
    });

    player.on('botDisconnect', async (queue) => {
        const response = await egenerator.general('❌ | I was manually disconnected from the voice channel, clearing queue!', 'Why so mean?');
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send('❌ | I was manually disconnected from the voice channel, clearing queue!');
    });

    player.on('channelEmpty', async (queue) => {
        const response = await egenerator.general('❌ | Nobody is in the voice channel, leaving...', 'So lonely');
        queue.metadata.send({ embeds: [response] });
        // queue.metadata.send('❌ | Nobody is in the voice channel, leaving...');
    });

    player.on('queueEnd', async (queue) => {
        queue.metadata.send('✅ | Queue finished!');
    });

};
