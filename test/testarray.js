var item = {
    "symbol": "GOOG",
    "count": 4
}

var stocks = [
    {
      "symbol": "TSLA",
      "count": 1
    },
    {
      "symbol": "GME",
      "count": 2
    }
  ]

var foundIndex = stocks.findIndex(element => element.symbol == item.symbol)

console.log(foundIndex)

if (foundIndex == -1){
    console.log('none')
}else{
    console.log('found')
}

// var newvalue = stocks[foundIndex].count += item.count

// console.log(newvalue)
// console.log(stocks.length)