const { Command } = require("discord.js-commando");
const {
  createUser,
  readUserData,
  updateUserData,
} = require("../../scripts/datafile");
const { searchPrice, cacheStock, readCache } = require("../../scripts/stocks");

module.exports = class Buystock extends Command {
  constructor(client) {
    super(client, {
      name: "buystock",
      aliases: ["buy"],
      group: "stocks",
      memberName: "buystock",
      description: "Buy stocks at their current price",
      args: [
        {
          key: "amount",
          prompt: "How much you would like to purchase",
          type: "integer",
          validate: (amount) => amount >= 1,
        },
        {
          key: "symbol",
          prompt: "Specify the stock's symbol",
          type: "string",
          validate: (symbol) => symbol.length >= 2 && symbol.length <= 5,
        },
      ],
    });
  }

  async run(message, { symbol, amount }) {
    function buyStock(stock, quantity, stockData, datafile) {
      return new Promise((resolve, reject) => {
        var purchasePrice = stockData.price * quantity;

        if (datafile.balance > purchasePrice) {
          datafile.balance -= purchasePrice;

          if (datafile.stocks.length > 0) {
            var foundIndex = datafile.stocks.findIndex(
              (element) => element.symbol == stock
            );

            if (foundIndex != -1) {
              datafile.stocks[foundIndex].count += quantity;
              resolve(datafile);
            } else {
              var purchaseStocks = {
                symbol: stock,
                count: quantity,
                purchased_at: stockData.price
              };

              datafile.stocks.push(purchaseStocks);
              resolve(datafile);
            }
          } else {
            var purchaseStocks = {
              symbol: stock,
              count: quantity,
              purchased_at: stockData.price
            };

            datafile.stocks.push(purchaseStocks);
            resolve(datafile);
          }
        } else {
          reject("Unable to purchase due to lack of balance.");
        }
      });
    }

    var symbol = await symbol.toUpperCase();
    var cache = await readCache(symbol);
    var authorID = message.author.id;
    var datafile = await readUserData(authorID);

    switch (datafile) {
      case null:
        await createUser(authorID);
        datafile = await readUserData();
        break;
    }

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
        cache = await readCache(symbol);
        console.log(cache)

        switch (cache) {
          case null:
            message.reply("Stock " + symbol + " does not exist!");
            break;
          default:
            buyStock(symbol, amount, cache, datafile)
              .then((datafile) => {
                updateUserData(authorID, datafile);
                message.reply(
                  `Successfully purchased ${amount} of ${cache.name} at $${cache.price}`
                );
              })
              .catch((err) => {
                message.reply(err);
              });
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

          switch (cache) {
            case null:
              message.reply("Stock " + symbol + " does not exist!");
              break;
            default:
              buyStock(symbol, amount, cache, datafile)
                .then((datafile) => {
                  updateUserData(authorID, datafile);
                  message.reply(
                    `Successfully purchased ${amount} of ${cache.name} at $${cache.price}`
                  );
                })
                .catch((err) => {
                  message.reply(err);
                });
          }
        } else {
          buyStock(symbol, amount, cache, datafile)
            .then((datafile) => {
              updateUserData(authorID, datafile);
              message.reply(
                `Successfully purchased ${amount} of ${cache.name} at $${cache.price}`
              );
            })
            .catch((err) => {
              message.reply(err);
            });
        }
    }
  }
};
