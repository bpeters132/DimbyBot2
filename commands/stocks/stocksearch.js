const { Command } = require("discord.js-commando");
const { MessageEmbed } = require("discord.js");
const { searchPrice, cacheStock, readCache } = require("../../scripts/stocks");

module.exports = class UrbanCommand extends Command {
  constructor(client) {
    super(client, {
      name: "stocksearch",
      group: "stocks",
      memberName: "stocksearch",
      aliases: ["stock", "s"],
      description: "Look up a stock's current stats and price with it's symbol",
      args: [
        {
          key: "symbol",
          prompt: "Specify the stock's symbol",
          type: "string",
          validate: (symbol) => symbol.length >= 2 && symbol.length <= 5,
        },
      ],
    });
  }

  async run(message, { symbol }) {
    var symbol = await symbol.toUpperCase();
    // console.log(symbol);
    var cache = await readCache(symbol);
    // console.log(cache);

    switch (cache) {
      case null:
        var newcache = await searchPrice(symbol);
        // console.log(newcache)
        await cacheStock(newcache, symbol)
          .then()
          .catch((err) => {
            console.log(err);
          });
        newcache = await readCache(symbol);
        // console.log(newcache);

        switch (newcache) {
          case null:
            message.reply("Stock " + symbol + " does not exist!");
            break;
          default:
            const embed = new MessageEmbed()
              .setColor("#c7ffed")
              .setTitle(newcache.name)
              .setThumbnail(
                "https://dummyimage.com/160x160/c7ffed/000000.png&text=" +
                  symbol
              )
              .addFields(
                { name: "Current Price", value: newcache.price },
                { name: "Open", value: newcache.open, inline: true },
                { name: "High", value: newcache.high, inline: true },
                { name: "Low", value: newcache.low, inline: true },
                {
                  name: "Previous",
                  value: newcache.previous,
                  inline: true,
                }
              )
              .setTimestamp();
            message.channel.send(embed);
        }
        break;
      default:
        if (cache["updated"] < Date.now() - 30000) {
          var newcache = await searchPrice(symbol);

          await cacheStock(newcache, symbol, cache)
          .then()
          .catch((err) => {
            console.log(err);
          });

          cache = await readCache(symbol);
          if (typeof cache !== "undefined") {
            const embed = new MessageEmbed()
              .setColor("#c7ffed")
              .setTitle(cache.name)
              .setThumbnail(
                "https://dummyimage.com/160x160/c7ffed/000000.png&text=" +
                  symbol
              )
              .addFields(
                { name: "Current Price", value: cache.price },
                { name: "Open", value: cache.open, inline: true },
                { name: "High", value: cache.high, inline: true },
                { name: "Low", value: cache.low, inline: true },
                {
                  name: "Previous",
                  value: cache.previous,
                  inline: true,
                }
              )
              .setTimestamp();
            message.channel.send(embed);
          } else {
            message.reply("Stock " + symbol + " does not exist!");
          }
        } else {
          const embed = new MessageEmbed()
            .setColor("#c7ffed")
            .setTitle(cache.name)
            .setThumbnail(
              "https://dummyimage.com/160x160/c7ffed/000000.png&text=" + symbol
            )
            .addFields(
              { name: "Current Price", value: cache.price },
              { name: "Open", value: cache.open, inline: true },
              { name: "High", value: cache.high, inline: true },
              { name: "Low", value: cache.low, inline: true },
              {
                name: "Previous",
                value: cache.previous,
                inline: true,
              }
            )
            .setTimestamp();
          message.channel.send(embed);
        }
    }
  }
};
