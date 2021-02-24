const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

exports.updateTreasure = functions.https.onRequest(async (req, res) => {
  switch (req.method) {
    case "POST":
      await admin.database().ref("/GME").set(req.body);
      res.status(200).send()
      break;
    default:
      res.status(405).send({error: "ONLY_POST_REQUESTS_ALLOWED"});
      break;
  }
});
