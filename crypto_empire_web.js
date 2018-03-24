const express = require('express');
const steem = require('steem');
const app = express();
const MongoClient = require('mongodb').MongoClient;
const marky = require('marky-markdown');
const del = require('./delegators');

const uri = 'mongodb://steemit:steemit@mongo1.steemdata.com:27017/SteemData' ;
const port=3001;

const rpc_node = 'https://api.steemit.com';

steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });

app.set('view engine', 'pug');
app.set('views', './views');
app.get('/game/payouts', (req, res) => {
  MongoClient.connect(uri, function(err, db) {
    console.log('Connected successfully to mongo server');
    var d = db.db('SteemData');
    console.log(d.collection('Operations'));
    var group = { '_id': {'to': '$to', 'asset': '$amount.asset'}, 'total': {'$sum': '$amount.amount'}};
    if (!('summary' in req.query)) {
      group._id.day = {'$dateToParts': { 'date' : '$timestamp'}};
    }
    var match = {'from': 'cryptoempire', 'type': 'transfer', 'memo': /^#.*/};
    if ('from' in req.query || 'to' in req.query) {
      match.timestamp = {};
    }
    if ('from' in req.query) {
      match.timestamp.$gte = new Date(req.query.from);
    }
    if ('to' in req.query) {
      match.timestamp.$lte = new Date(req.query.to);
    }
    if ('user' in req.query) {
      match.to = req.query.user;
    }
    d.collection('Operations').aggregate([{'$match': match}, {'$group': group}]).sort({'_id': -1})
      .toArray(function(err, ops) {
        res.render('payouts', {
          values: ops,
        });
        db.close();
        console.log('Disconnected successfully from mongo server');
      });
  });
});


app.get('/game/dash', async (req, res, next) => {
  try {
    const delegators = await del.loadDelegations('cryptoempire');
    console.log(delegators);
    const vestTotal = delegators.reduce((sofar, val) => sofar + parseFloat(val.vesting_shares), 0);
    for (var i = 0; i < delegators.length; i++) {
      delegators[i].percent_vests = parseFloat(delegators[i].vesting_shares) / vestTotal;
    }
    res.render('dash', {
      values: delegators,
      vestTotal: vestTotal,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/game/play', async (req, res, next) => {
  try {
    const user = req.query.user;
    const post = await steem.api.getContentAsync('cryptoempire', req.query.pl);
    console.log(post);
    const replies = await steem.api.getContentRepliesAsync('cryptoempire', req.query.pl);
    console.log(replies);
    const body = post.body;
    var userData = body.substring(body.indexOf(`## @${user}`));
    userData = userData.substring(0, userData.indexOf('##', 2));
    var imperialOutpostData = body.substring(body.indexOf('## The Imperial Outpost'));
    imperialOutpostData = imperialOutpostData.substring(0, imperialOutpostData.indexOf('__', 2));
    var userReplyData = '# User Replies \n';
    replies.filter((r) => r.author === user.toLowerCase())
      .forEach((r) => {userReplyData += r.body + '\n<hr>\n';});
    
    res.render('game', {
      userData: marky(userData),
      imperialOutpostData: marky(imperialOutpostData),
      userReplyData: marky(userReplyData),
    });
  } catch (e) {
    next(e);
  }
});

app.listen(port, () => console.log('Payouts route running on port ' + port));


