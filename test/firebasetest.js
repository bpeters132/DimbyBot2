const unirest = require("unirest");

function getStockData(symbol) {
    return new Promise((resolve, reject) => {
        unirest(
            "GET",
            `https://dimbybot-default-rtdb.firebaseio.com/stocks/${symbol}.json`
        ).end((res) => {
            if (res.error) reject(res.error);
            resolve(JSON.parse(res.raw_body));
        });
    });
}

function saveStockData(symbol, data) {
    return new Promise((resolve, reject) => {
        unirest(
            "POST",
            `https://dimbybot-default-rtdb.firebaseio.com/stocks/${symbol}.json`
        )
            .headers({
                "Content-Type": "application/json",
            })
            .send(JSON.stringify(data))
            .end(function (res) {
                if (res.error) reject(res.error);
                resolve(res.raw_body);
            });
    });
}

async function printStockData(symbol) {
    data = await getStockData(symbol);
    if (data != null) {
        console.log(data);
    } else {
        console.log("Stock not cached");
    }
}

// printStockData("GME");

var newstockdata = {
    high: 54879 
}

// saveStockData("GME", newstockdata)

