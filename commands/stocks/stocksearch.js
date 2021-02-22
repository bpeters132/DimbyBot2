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
            description:
                "Look up a stock's current stats and price with it's symbol",
            args: [
                {
                    key: "symbol",
                    prompt: "Specify the stock's symbol",
                    type: "string",
                    validate: (symbol) =>
                        symbol.length >= 3 && symbol.length <= 4,
                },
            ],
        });
    }

    async run(message, { symbol }) {
        var symbol = await symbol.toUpperCase();
        var cache = await readCache(symbol);
        // console.log(cache);
        if (cache) {
            if (cache["updated"] < Date.now() - 30000) {
                var newcache = await searchPrice(symbol);

                await cacheStock(newcache, symbol);

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
            }
        } else {
            var newcache = await searchPrice(symbol);
            // console.log(newcache)
            await cacheStock(newcache, symbol).catch((err) => {
                console.log(err);
            });
            cache = await readCache(symbol);
            // console.log(cache)

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
        }
    }
};
