module.exports = {
    name: 'ping',
    description: 'Ping!',
    cooldown: 5,
    execute(client, message) {
        message.reply(`Pong! Latency is ${Date.now() - message.createdTimestamp}ms. API Latency is ${Math.round(client.ws.ping)}ms`);
    },
};
  