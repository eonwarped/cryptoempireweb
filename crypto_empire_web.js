const express = require('express');
const steem = require('steem');
const app = express();
const trans = require('./transfers');

const port=3001;

//const rpc_node = 'https://api.steemit.com';
//const rpc_node = 'https://gtg.steem.house:8090';
//const rpc_node = 'https://steemd.minnowsupportproject.org';
const rpc_node = 'wss://steemd.privex.io';
steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });

app.set('view engine', 'pug');
app.set('views', './views');

app.get('/game/bots', async (req, res, next) => {
  try {
    const account = req.query.account;
    const payoutData = await trans.computeBidBotReturns(account);
    res.render('bots', {
      values: payoutData,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/game/posts', (req, res) => {
  res.redirect(`https://eonwarped.github.io/steem/allposts.html?account=${req.query.account}` + (req.query.tags ? `&tags=${req.query.tags}` : ''));
});

var server = app.listen(port, () => console.log('Routes running on port ' + port));
server.setTimeout(1000*60*10);
