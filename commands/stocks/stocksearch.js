const { Command } = require("discord.js-commando");
const Discord = require("discord.js");
const { searchSymbol, cacheStock, readCache } = require("../../scripts/stocks");

module.exports = class UrbanCommand extends Command {
    constructor(client) {
        super(client, {
            name: "stocksearch",
            group: "stocks",
            memberName: "stocksearch",
            aliases: ["ss", "stock"],
            description:
                "Look up a stock's current stats and price with it's symbol",
            args: [
                {
                    key: "symbol",
                    prompt: "You need to specify a stock symbol",
                    type: "string",
                    validate: (symbol) =>
                        symbol.length >= 3 && symbol.length <= 4,
                },
            ],
        });
    }

    async run(message, { symbol }) {
        var cache = readCache(symbol);
        if (cache) {
            if (cache["updated"] < Date.now() - (300 * 1000)) {
                message.reply("Updating cached stock data")
                
                searchSymbol(symbol, (res) => {
                    cacheStock(res["Global Quote"]);
                });
            } else {
                message.reply("Printing cached stock data")
            }
        } else {
            searchSymbol(symbol, (res) => {
                cacheStock(res["Global Quote"]);
            });
        }
    }
};
