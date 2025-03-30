// src/bot/events/ready.js
module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Force a connection to each Lavalink node.
    if (client.player.nodes && typeof client.player.nodes.forEach === 'function') {
      client.player.nodes.forEach(async (node) => {
        try {
          await node.connect();
          console.log(`Connected to Lavalink node: ${node.options.host}:${node.options.port}`);
        } catch (err) {
          console.error(`Failed to connect to Lavalink node: ${node.options.host}:${node.options.port}`, err);
        }
      });
    } else {
      console.warn("No nodes collection found on client.player. Connection will occur on demand.");
    }
  }
};
