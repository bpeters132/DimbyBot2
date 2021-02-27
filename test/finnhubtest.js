const finnhub = require("finnhub");

const api_key = finnhub.ApiClient.instance.authentications['api_key'];
api_key.apiKey = "" // Replace this
const finnhubClient = new finnhub.DefaultApi()

//Quote
finnhubClient.quote("BLDR", (error, data, response) => {
    if (error) console.log(error)
    console.log(JSON.stringify(data.c, 2, null))
});
