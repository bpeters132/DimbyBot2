const path = require("path");
const fs = require("fs");
const unirest = require("unirest");
const finnhub = require("finnhub");
const { finnhubAPI } = require("../config.json");

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
                "x-rapidapi-key":
                    "a204e3a3ebmshfa26fe8cd83c110p189835jsnf974dfc15017",
                "x-rapidapi-host": "alpha-vantage.p.rapidapi.com",
                useQueryString: "true",
            })
            .end(function (res) {
                if (res.error) reject(res.error);
                resolve(res.body);
            });
    });
}

function updateCacheFile(jsondata) {
    return new Promise((resolve, reject) => {
        const updatedjson = JSON.stringify(jsondata, null, 2);
        fs.writeFileSync(
            path.join(__dirname, "../", "data", "stocks.json"),
            updatedjson
        );
        resolve();
    });
}

function cacheStock(stockPrice, symbol) {
    return new Promise((resolve, reject) => {
        const rawdata = fs.readFileSync(
            path.join(__dirname, "../", "data", "stocks.json")
        );
        var jsondata = JSON.parse(rawdata);
        // console.log("TEST 1", jsondata);

        if (jsondata[symbol]) {
            jsondata[symbol] = {
                name: jsondata[symbol].name,
                open: Math.floor(stockPrice.o),
                high: Math.floor(stockPrice.h),
                low: Math.floor(stockPrice.l),
                price: Math.floor(stockPrice.c),
                previous: Math.floor(stockPrice.pc),
                updated: Date.now(),
            };
            console.log("Updating " + symbol + " with single query");
            // console.log("TEST 2", jsondata);
            updateCacheFile(jsondata);
            resolve();
        } else {
            searchName(symbol).then((res) => {
                if (typeof res["bestMatches"][0] !== "undefined") {
                    // console.log("TEST 4", res)
                    jsondata[symbol] = {
                        name: res["bestMatches"][0]["2. name"],
                        open: Math.floor(stockPrice.o),
                        high: Math.floor(stockPrice.h),
                        low: Math.floor(stockPrice.l),
                        price: Math.floor(stockPrice.c),
                        previous: Math.floor(stockPrice.pc),
                        updated: Date.now(),
                    };
                    console.log("Updating " + symbol + " with double query");
                    // console.log("TEST 3", jsondata);

                    updateCacheFile(jsondata);
                    resolve();
                } else {
                    reject("Stock " + symbol + " does not exist!");
                }
            });
        }
    });
}

function readCache(symbol) {
    return new Promise((resolve, reject) => {
        const rawdata = fs.readFileSync(
            path.join(__dirname, "../", "data", "stocks.json")
        );
        jsondata = JSON.parse(rawdata);

        if (!jsondata) {
            reject("Jsondata not defined");
        } else {
            resolve(jsondata[symbol]);
        }
    });
}

exports.searchPrice = searchPrice;
exports.cacheStock = cacheStock;
exports.readCache = readCache;
