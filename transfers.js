const steem = require('steem');

function getAmount(v) {
  return Number(v.split(' ')[0]);
}

/**
 * Should input a full steemit article link and return the permlink of the article
 * @param {string} steemitLink
 */
function extractPermlinkFromLink(steemitLink) {
  if (isValidSteemitLink(steemitLink)) {
    const usernamePos = steemitLink.search(/\/@.+\//);
    if (usernamePos === -1) {
      throw new Error('Cannot parse link ' + steemitLink);
    }

    const firstPart = steemitLink.slice(usernamePos + 1); // adding 1 to remove the first "/"
    return firstPart.slice(firstPart.search('/') + 1).replace('/', '').replace('#', '');
  }
  throw new Error('Cannot parse link ' + steemitLink);
}

function isValidSteemitLink(link) {
  return link.match(/^https?:\/\/(www\.)?(steemit\.com|busy\.org)\//i);
}

async function loadTransfers(account) {
  return getTransactions(account, -1);
}

async function getTransactions(account, start) {
  const transfer_transactions = [];
  var last_trans = start;

  let done = false;

  try {
    while (!done) {
      const start_trans = last_trans;
      const result = await steem.api.getAccountHistoryAsync(account, start_trans, (start_trans < 0) ? 10000 : Math.min(start_trans, 10000)); 
      result.reverse();

      result.forEach(function(trans) {
        var op = trans[1].op;

        if(op[0] == 'transfer') {
          //console.log(trans);
          transfer_transactions.push({ id: trans[0], data: op[1] });
        }

        // Save the ID of the last transaction that was processed.
        last_trans = trans[0];
      });

      if(last_trans > 0 && last_trans != start_trans) {
        //return await getTransactions(account, last_trans);
      } else {
        if (last_trans > 0) {
          console.log('Missing account history.... last trans: ' + last_trans);
        }
        done = true;
      }
    }
  } catch (e) {
    console.log(e);
  }
  return processTransfers(account, transfer_transactions);
}

function processTransfers(account, transfer_transactions) {
  // store map of post, bot, amount list
  const postTransfers = {};
  // store map of bot and amount to last promoted post, so we can subtract refunds
  const mostRecentPostTransfer = {};

  // get feed price
  

  // Go through the transfers from oldest to newest to find posts with memos and handle refunds properly
  transfer_transactions.reverse();
  for(var i = 0; i < transfer_transactions.length; i++) {
    const trans = transfer_transactions[i];
    const data = trans.data;
    if (data && data.from === account && data.memo && isValidSteemitLink(data.memo)) {
      //const author = extractAuthorFromLink(data.memo);
      const permlink = extractPermlinkFromLink(data.memo);
      const bot = data.to;
      if (!postTransfers[permlink]) {
        postTransfers[permlink] = {};
      }
      if (!postTransfers[permlink][bot]) {
        postTransfers[permlink][bot] = [];
      }
      postTransfers[permlink][bot].push(data.amount);
      mostRecentPostTransfer[bot] = permlink;
    } else if (data && data.to === account && getAmount(data.amount) > 0.001) {
      const permlink = mostRecentPostTransfer[data.from];
      if (permlink) {
        const amounts = postTransfers[permlink][data.from];
        // see if its one handled by minnowbooster
        let mbMatch;
        const mbRegex = /You got an upgoat that will be done by ([^.]*)\./;
        if (data.memo) {
          mbMatch = data.memo.match(mbRegex);
        }
        if (mbMatch) {
          const mbVoter = mbMatch[1];
          // subtract out amount and put it to voters own if not mb..
          if (amounts && amounts.length > 0) {
            const mbAmount = amounts[amounts.length - 1];
            const postRefundAmountSbd = (getAmount(mbAmount) - getAmount(data.amount)) + ' SBD';
            if (mbVoter !== 'minnowbooster') {
              amounts.splice(amounts.length - 1, 1);
              postTransfers[permlink][mbVoter] = [postRefundAmountSbd];
            } else {
              amounts[amounts.length - 1] = postRefundAmountSbd;
            }
            //console.log(amounts);
          }
        } else if (data.from === 'qustodian') {
          //deduct refund
          const lastAmount = amounts[amounts.length - 1];
          const postRefundAmountSbd = (getAmount(lastAmount) - getAmount(data.amount)) + ' SBD';
          amounts[amounts.length - 1] = postRefundAmountSbd;
          //console.log(amounts);
        } else {
          // see if it's one we transfered to recently
          //console.log('processing refund, deduct ' + data.amount + ' from ' + permlink + ' bot ' + data.from);
          if (amounts) {
            const idx = amounts.findIndex(elt => elt === data.amount);
            if (idx >= 0) {
              amounts.splice(idx, 1);
            }
            //console.log('found original send, refunded');
          }
        }
      }
    }
  }
  //console.log(postTransfers);
  return postTransfers;
}

async function loadPayoutData(account, postTransfers) {
  const payoutData = [];
  for (var permlink in postTransfers) {
    const botToAmounts = postTransfers[permlink];
    //console.log(botToAmounts);
    // let's fetch!
    try {
      const post = await steem.api.getContentAsync(account, permlink);
      //console.log(post);
      const total_sbd = getAmount(post.total_payout_value) + getAmount(post.curator_payout_value);
      //const curator_sbd = getAmount(post.curator_payout_value);
      //const author_sbd = total_sbd - curator_sbd;
      //console.log('total_sbd ' + total_sbd);
      //console.log('author sbd ' + author_sbd);
      //console.log('curator_sbd ' + curator_sbd);
      const votes = post.active_votes;
      var prevRshares = 0;
      const totalRshares = votes.reduce((amt, v) => amt + parseInt(v.rshares), 0);
      votes.sort((a,b) => Date.parse(a.time) - Date.parse(b.time)).forEach(vote => {
        //console.log(vote);
        const voteAgeMillis = Date.parse(vote.time) - Date.parse(post.created);
        const voteRshares = parseInt(vote.rshares);
        const voteValue = voteRshares * total_sbd / totalRshares;
        const authorCurationPortion = Math.max(0,Math.min((1000*60*30 - voteAgeMillis)/(1000*60*30), 1))*(Math.sqrt(voteRshares+prevRshares) - Math.sqrt(prevRshares))*total_sbd/(4*Math.sqrt(totalRshares));
        const authorVotePortion = 3*voteRshares*total_sbd / (4*totalRshares);
        const botVoter = vote.voter;
        let amountsFromBot = botToAmounts[botVoter];
        if (!amountsFromBot) {
          amountsFromBot = ['0 SBD'];
        }
        if (amountsFromBot) {
          //console.log('author curation portion of vote: ' + authorCurationPortion);
          //console.log('author vote portion of vote: ' + authorVotePortion);
          //console.log('author portion of vote: ' + (authorVotePortion + authorCurationPortion));
          //console.log('Age (ms): ' + voteAgeMillis);
          //console.log('rshares: ' + voteRshares);
          //console.log('prevRshares: ' + prevRshares);
          //console.log('total rshares: ' + totalRshares);
          //console.log('Amounts to bot ' + botVoter + ': ' + amountsFromBot);
          // now to compute actual SBD conversoin value of author vote portion.
          // Use current SBD value.
          const usdSbd = 1.28;
          const authorMarketSbd = (authorVotePortion + authorCurationPortion) * 0.5 * (1 + 1/usdSbd);
          //console.log('(current) market value of sbd from author: ' + authorMarketSbd);
          //console.log(`${permlink},${botVoter},${amountsFromBot},${authorVotePortion+authorCurationPortion},${usdSbd},${authorMarketSbd}`);
          payoutData.push({
            created: post.created,
            permlink, botVoter, amountsFromBot,
            voteAgeMillis,
            voteValue,
            authorVotePortion,
            authorCurationPortion,
            authorPortionSbd: authorVotePortion + authorCurationPortion
          });
        }
        prevRshares += voteRshares;
      });
      //console.log(votes);
    } catch (err) {
      console.log(err);
    }
  }
  return payoutData;
}

async function computeBidBotReturns(account) {
  const transfers = await loadTransfers(account);
  return await loadPayoutData(account, transfers);
}

module.exports = {
  loadTransfers: loadTransfers,
  loadPayoutData: loadPayoutData,
  computeBidBotReturns: computeBidBotReturns,
};
