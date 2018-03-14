const express = require('express');
const steem = require('steem');
const app = express();
const MongoClient = require('mongodb').MongoClient
const marky = require("marky-markdown");

const uri = 'mongodb://steemit:steemit@mongo1.steemdata.com:27017/SteemData' 
const port=3001;

const rpc_node = 'https://api.steemit.com';

steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });

app.set('view engine', 'pug');
app.set('views', './views');
app.get('/game/payouts', (req, res) => {
  MongoClient.connect(uri, function(err, db) {
    console.log("Connected successfully to mongo server");
    d = db.db('SteemData');
    console.log(d.collection('Operations'));
    var match = {'from': 'cryptoempire', 'type': 'transfer', 'memo': /^#.*/};
    if ('from' in req.query || 'to' in req.query) {
      match['timestamp'] = {};
    }
    if ('from' in req.query) {
      match['timestamp']['$gte'] = new Date(req.query.from);
    }
    if ('to' in req.query) {
      match['timestamp']['$lte'] = new Date(req.query.to);
    }
    if ('user' in req.query) {
      match['to'] = req.query.user;
    }
    d.collection('Operations').aggregate([{'$match': match}, {'$group': { '_id': {'day': {'$dateToParts': { 'date' : '$timestamp'}}, 'to': '$to', 'asset': '$amount.asset'}, 'total': {'$sum': '$amount.amount'}}}]).sort({'_id': -1})
      .toArray(function(err, ops) {
	res.render('payouts', {
	  values: ops,
	});
	db.close()
	console.log("Disconnected successfully from mongo server")
      })
  });
});


app.get('/game/play', (req, res) => {
  steem.api.getContent('cryptoempire', req.query.pl, function(err, result) {
    console.log(result);
    const body = result.body;
    var userData = body.substring(body.indexOf(`## @${req.query.user}`));
    userData = userData.substring(0, userData.indexOf('##', 2));
    var imperialOutpostData = body.substring(body.indexOf('## The Imperial Outpost'));
    imperialOutpostData = imperialOutpostData.substring(0, imperialOutpostData.indexOf('__', 2));
    
    res.render('game', { post: marky(userData + "\n" + imperialOutpostData) });
  });
});

app.listen(port, () => console.log('Payouts route running on port ' + port));


