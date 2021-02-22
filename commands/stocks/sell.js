const { Command } = require("discord.js-commando");
const {
    createUser,
    readDataFile,
    updateDataFile,
} = require("../../scripts/datafile");
const { searchPrice, cacheStock, readCache } = require("../../scripts/stocks");

module.exports = class sellstock extends Command {
    constructor(client) {
        super(client, {
            name: "sellstock",
            aliases: ["sell"],
            group: "stocks",
            memberName: "sellstock",
            description: "Sell stocks at their current price",
            args: [
                {
                    key: "amount",
                    prompt: "How much you would like to sell",
                    type: "integer",
                    validate: (amount) => amount >= 1,
                },
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

    async run(message, { symbol, amount }) {
        function sellStock(stock, quantity, stockData, datafile, user) {
            return new Promise((resolve, reject) => {
                var sellPrice = stockData.price * quantity;
                var foundIndex = datafile[user].stocks.findIndex(
                    (element) => element.symbol == stock
                );

                if (foundIndex != -1) {
                    if (datafile[user].stocks[foundIndex].count >= quantity) {
                        datafile[user].stocks[foundIndex].count -= quantity;
                        datafile[user].balance += sellPrice;

                        if (datafile[user].stocks[foundIndex].count == 0) {
                            datafile[user].stocks.splice(foundIndex, 1);
                            resolve(datafile);
                        } else {
                            resolve(datafile);
                        }
                    } else {
                        reject(
                            `You do not have ${quantity} of ${stockData.name} to sell!`
                        );
                    }
                } else {
                    reject(`You do not own any ${stockData.name}`);
                }
            });
        }

        var symbol = await symbol.toUpperCase();
        var cache = await readCache(symbol);
        var datafile = await readDataFile();
        var authorID = message.author.id;
        
        if (typeof datafile[authorID] == 'undefined'){
            await createUser(authorID)
            datafile = await readDataFile();
        }

        // console.log(cache);
        if (cache) {
            if (cache["updated"] < Date.now() - 30000) {
                var newcache = await searchPrice(symbol);

                await cacheStock(newcache, symbol);

                cache = await readCache(symbol);
                if (typeof cache !== "undefined") {
                    sellStock(symbol, amount, cache, datafile, authorID)
                        .then((datafile) => {
                            updateDataFile(datafile);
                            message.reply(
                                `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
                            );
                        })
                        .catch((err) => {
                            message.reply(err);
                        });
                } else {
                    message.reply("Stock " + symbol + " does not exist!");
                }
            } else {
                sellStock(symbol, amount, cache, datafile, authorID)
                    .then((datafile) => {
                        updateDataFile(datafile);
                        message.reply(
                            `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
                        );
                    })
                    .catch((err) => {
                        message.reply(err);
                    });
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
                sellStock(symbol, amount, cache, datafile, authorID)
                    .then((datafile) => {
                        updateDataFile(datafile);
                        message.reply(
                            `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
                        );
                    })
                    .catch((err) => {
                        message.reply(err);
                    });
            } else {
                message.reply("Stock " + symbol + " does not exist!");
            }
        }
    }
};
