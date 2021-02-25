const { Command } = require("discord.js-commando");
const {
  createUser,
  readUserData,
  updateUserData,
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
          validate: (symbol) => symbol.length >= 2 && symbol.length <= 5,
        },
      ],
    });
  }

  async run(message, { symbol, amount }) {
    function sellStock(stock, quantity, stockData, datafile) {
      return new Promise((resolve, reject) => {
        var sellPrice = stockData.price * quantity;
        var foundIndex = datafile.stocks.findIndex(
          (element) => element.symbol == stock
        );

        if (foundIndex != -1) {
          if (datafile.stocks[foundIndex].count >= quantity) {
            datafile.stocks[foundIndex].count -= quantity;
            datafile.balance += sellPrice;

            if (datafile.stocks[foundIndex].count == 0) {
              datafile.stocks.splice(foundIndex, 1);
              resolve(datafile);
            } else {
              resolve(datafile);
            }
          } else {
            reject(`You do not have ${quantity} of ${stockData.name} to sell!`);
          }
        } else {
          reject(`You do not own any ${stockData.name}`);
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
        console.log(cache);

        switch (cache) {
          case null:
            message.reply("Stock " + symbol + " does not exist!");
            break;
          default:
            sellStock(symbol, amount, cache, datafile)
              .then((datafile) => {
                updateUserData(authorID, datafile);
                message.reply(
                  `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
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
              sellStock(symbol, amount, cache, datafile)
                .then((datafile) => {
                  updateUserData(authorID, datafile);
                  message.reply(
                    `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
                  );
                })
                .catch((err) => {
                  message.reply(err);
                });
          }
        } else {
          sellStock(symbol, amount, cache, datafile)
            .then((datafile) => {
              updateUserData(authorID, datafile);
              message.reply(
                `Successfully sold ${amount} of ${cache.name} at $${cache.price}`
              );
            })
            .catch((err) => {
              message.reply(err);
            });
        }
    }
  }
};
