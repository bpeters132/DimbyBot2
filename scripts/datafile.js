const path = require("path");
const fs = require("fs");

function readDataFile() {
    return new Promise((resolve, reject) => {
        const rawdata = fs.readFileSync(
            path.join(__dirname, "../", "data", "balances.json")
        );
        resolve((jsondata = JSON.parse(rawdata)));
    });
}

function updateDataFile(jsondata) {
        const updatedjson = JSON.stringify(jsondata, null, 2);
        fs.writeFileSync(
            path.join(__dirname, "../", "data", "balances.json"),
            updatedjson
        );
}

function createUser(authorID) {
    return new Promise((resolve, reject) => {
        const jsondata = readDataFile();
        jsondata[authorID] = {
            balance: 7500,
            daily: 0,
            stocks: [],
        };
        updateDataFile(jsondata);
        resolve();
    });
}

exports.createUser = createUser;
exports.readDataFile = readDataFile;
exports.updateDataFile = updateDataFile;
