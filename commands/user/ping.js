module.exports = {
    name: "ping",
    description: "Ping!",
    cooldown: 5,
    execute(client, message, args) {
      message.reply("Pong!");
    },
  };
  