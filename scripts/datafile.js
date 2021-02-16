const path = require("path");
const fs = require("fs");

function readDataFile() {
    const rawdata = fs.readFileSync(
        path.join(__dirname, "../", "data", "balances.json")
    );
    return (jsondata = JSON.parse(rawdata));
}

function updateDataFile(jsondata) {
    const updatedjson = JSON.stringify(jsondata, null, 2);
    fs.writeFileSync(
        path.join(__dirname, "../", "data", "balances.json"),
        updatedjson
    );
}

function createUser(authorID) {
    const jsondata = readDataFile();
    jsondata[authorID] = {
        balance: 100,
        daily: 0,
        stocks: {},
    };
    updateDataFile(jsondata);
}

exports.createUser = createUser;
exports.readDataFile = readDataFile;
exports.updateDataFile = updateDataFile;
