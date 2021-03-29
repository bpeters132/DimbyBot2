const unirest = require("unirest");
const finnhub = require("finnhub");
const {
  finnhubAPI,
  firebase_rtdb_url,
  firebase_rtdb_url_dev_suffix,
} = require("../config.json");

const api_key = finnhub.ApiClient.instance.authentications["api_key"];
api_key.apiKey = finnhubAPI;
const finnhubClient = new finnhub.DefaultApi();

function searchPrice(symbol) {
  return new Promise((resolve, reject) => {
    finnhubClient.quote(symbol, (error, data, response) => {
      if (error) reject(error);
      resolve(data);
    });
  });
}

function searchName(keyword) {
  return new Promise((resolve, reject) => {
    unirest(
      "GET",
      "https://alpha-vantage.p.rapidapi.com/query?keywords=" +
        keyword +
        "&function=SYMBOL_SEARCH&datatype=json"
    )
      .headers({
        "x-rapidapi-key": "a204e3a3ebmshfa26fe8cd83c110p189835jsnf974dfc15017",
        "x-rapidapi-host": "alpha-vantage.p.rapidapi.com",
        useQueryString: "true",
      })
      .end(function (res) {
        if (res.error) reject(res.error);
        resolve(res.body);
      });
  });
}

function updateCacheFile(payload, symbol) {
  return new Promise((resolve, reject) => {
    unirest(
      "PUT",
      `${firebase_rtdb_url}stocks/${symbol}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`
    )
      .send(JSON.stringify(payload))
      .end(function (res) {
        if (res.error) reject(res.error);
        resolve(res.body);
      });
  });
}

function cacheStock(stockData, symbol, cache) {
  return new Promise((resolve, reject) => {
    var payload = {};
    unirest(
      "GET",
      `${firebase_rtdb_url}stocks/${symbol}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`
    ).end(function (res) {
      switch (res.body) {
        case null:
          searchName(symbol).then((res) => {
            if (typeof res["bestMatches"][0] !== "undefined") {
              // console.log("TEST 4", res)
              payload = {
                name: res["bestMatches"][0]["2. name"],
                open: stockData.o,
                high: stockData.h,
                low: stockData.l,
                price: stockData.c,
                previous: stockData.pc,
                updated: Date.now(),
              };
              console.log("Updating " + symbol + " with double query");
              // console.log("TEST 3", payload);

              updateCacheFile(payload, symbol).then((res) => resolve(res));
            } else {
              reject("Stock " + symbol + " does not exist!");
            }
          });
          break;
        default:
          payload = {
            name: cache.name,
            open: stockData.o,
            high: stockData.h,
            low: stockData.l,
            price: stockData.c,
            previous: stockData.pc,
            updated: Date.now(),
          };
          console.log("Updating " + symbol + " with single query");
          // console.log("TEST 2", payload);
          updateCacheFile(payload, symbol).then((res) => resolve(res));
      }
    });
  });
}

function readCache(symbol) {
  return new Promise((resolve, reject) => {
    unirest(
      "GET",
      `${firebase_rtdb_url}stocks/${symbol}.json${firebase_rtdb_url_dev_suffix}?auth=${accessToken}`
    ).end(function (res) {
      if (res.error) reject(res.error);
      resolve(res.body);
    });
  });
}

exports.searchPrice = searchPrice;
exports.cacheStock = cacheStock;
exports.readCache = readCache;
