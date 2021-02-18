const path = require("path");
const fs = require("fs");
const unirest = require("unirest");

function searchSymbol(symbol, callback) {
    unirest(
        "GET",
        "https://alpha-vantage.p.rapidapi.com/query?function=GLOBAL_QUOTE&symbol=" +
            symbol +
            "&datatype=json"
    )
        .headers({
            "x-rapidapi-key":
                "a204e3a3ebmshfa26fe8cd83c110p189835jsnf974dfc15017",
            "x-rapidapi-host": "alpha-vantage.p.rapidapi.com",
            useQueryString: "true",
        })
        .end(function (res) {
            if (res.error) throw new Error(res.error);
            callback(res.body);
        });
}

function searchName(keyword, callback) {
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
            if (res.error) throw new Error(res.error);
            callback(res.body);
        });
}

function updateCacheFile(jsondata) {
    const updatedjson = JSON.stringify(jsondata, null, 2);
    fs.writeFileSync(
        path.join(__dirname, "../", "data", "stocks.json"),
        updatedjson
    );
}

function cacheStock(stockQuote) {
    const rawdata = fs.readFileSync(
        path.join(__dirname, "../", "data", "stocks.json")
    );
    var jsondata = JSON.parse(rawdata);

    if (jsondata[stockQuote["01. symbol"]]) {
        jsondata[stockQuote["01. symbol"]] = {
            name: jsondata[stockQuote["01. symbol"]].name,
            open: stockQuote["02. open"],
            high: stockQuote["03. high"],
            low: stockQuote["04. low"],
            price: stockQuote["05. price"],
            "previous close": stockQuote["05. previous close"],
            updated: Date.now(),
        };
        console.log(
            "Updating " + stockQuote["01. symbol"] + " with single query"
        );
        updateCacheFile(jsondata);
    } else {
        searchName(stockQuote["01. symbol"], (res) => {
            jsondata[stockQuote["01. symbol"]] = {
                name: res["bestMatches"][0]["2. name"],
                open: stockQuote["02. open"],
                high: stockQuote["03. high"],
                low: stockQuote["04. low"],
                price: stockQuote["05. price"],
                "previous close": stockQuote["05. previous close"],
                updated: Date.now(),
            };
            console.log(
                "Updating " + stockQuote["01. symbol"] + " with double query"
            );
            updateCacheFile(jsondata);
        });
    }
}

function readCache(symbol) {
    const rawdata = fs.readFileSync(
        path.join(__dirname, "../", "data", "stocks.json")
    );
    jsondata = JSON.parse(rawdata);
    return jsondata[symbol];
}

exports.searchSymbol = searchSymbol;
exports.cacheStock = cacheStock;
exports.readCache = readCache;
