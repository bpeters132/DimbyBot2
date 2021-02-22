const { Command } = require("discord.js-commando");
const {
    createUser,
    readDataFile,
    updateDataFile,
} = require("../../scripts/datafile");
const { searchPrice, cacheStock, readCache } = require("../../scripts/stocks");

module.exports = class Buystock extends Command {
    constructor(client) {
        super(client, {
            name: "buystock",
            aliases: ["buy"],
            group: "stocks",
            memberName: "balance",
            description: "Buy stocks at their current price",
            args: [
                {
                    key: "ammount",
                    prompt: "How much you would like to purchase",
                    default: 1,
                    type: "integer",
                    validate: (ammount) => ammount >= 1,
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

    async run(message, { symbol, ammount }) {
        function buyStock(stock, quantity, stockData, datafile, user) {
            return new Promise((resolve, reject) => {
                var purchasePrice = stockData.price * quantity;

                if (datafile[user].balance > purchasePrice) {
                    datafile[user].balance -= purchasePrice;

                    if (datafile[user].stocks.length > 0) {
                        var foundIndex = datafile[user].stocks.findIndex(
                            (element) => element.symbol == stock
                        );

                        if (foundIndex != -1) {
                            datafile[user].stocks[foundIndex].count += quantity;
                            resolve(datafile);
                        } else {
                            var purchaseStocks = {
                                symbol: stock,
                                count: quantity,
                            };

                            datafile[user].stocks.push(purchaseStocks);
                            resolve(datafile);
                        }
                    } else {
                        var purchaseStocks = {
                            symbol: stock,
                            count: quantity,
                        };

                        datafile[user].stocks.push(purchaseStocks);
                        resolve(datafile);
                    }
                } else {
                    reject("Unable to purchase due to lack of balance.");
                }
            });
        }

        var symbol = await symbol.toUpperCase();
        var cache = await readCache(symbol);
        var datafile = await readDataFile();
        var authorID = message.author.id;

        // console.log(cache);
        if (cache) {
            if (cache["updated"] < Date.now() - 30000) {
                var newcache = await searchPrice(symbol);

                await cacheStock(newcache, symbol);

                cache = await readCache(symbol);
                if (typeof cache !== "undefined") {
                    buyStock(symbol, ammount, cache, datafile, authorID)
                        .then((datafile) => {
                            updateDataFile(datafile);
                            message.reply(
                                `Successfully purchased ${ammount} of ${cache.name}`
                            );
                        })
                        .catch((err) => {
                            message.reply(err);
                        });
                } else {
                    message.reply("Stock " + symbol + " does not exist!");
                }
            } else {
                buyStock(symbol, ammount, cache, datafile, authorID)
                    .then((datafile) => {
                        updateDataFile(datafile);
                        message.reply(
                            `Successfully purchased ${ammount} of ${cache.name}`
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
                buyStock(symbol, ammount, cache, datafile, authorID)
                    .then((datafile) => {
                        updateDataFile(datafile);
                        message.reply(
                            `Successfully purchased ${ammount} of ${cache.name}`
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
