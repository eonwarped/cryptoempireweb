const steem = require('steem');

var delegation_transactions = [];

async function loadDelegations(account) {
  return getTransactions(account, -1);
}

async function getTransactions(account, start) {
  var last_trans = start;

  try {
    const result = await steem.api.getAccountHistoryAsync(account, start, (start < 0) ? 10000 : Math.min(start, 10000)); 
    result.reverse();

    result.forEach(function(trans) {
      var op = trans[1].op;

      if(op[0] == 'delegate_vesting_shares' && op[1].delegatee == account) {
        console.log(trans);
        delegation_transactions.push({ id: trans[0], data: op[1] });
      }

      // Save the ID of the last transaction that was processed.
      last_trans = trans[0];
    });

    if(last_trans > 0 && last_trans != start) {
      return await getTransactions(account, last_trans);
    } else {
      if (last_trans > 0) {
        console.log('Missing account history.... last trans: ' + last_trans);
      }
      return processDelegations();
    }
  } catch (e) {
    console.log(e);
  }
}

function processDelegations() {
  var delegations = [];

  // Go through the delegation transactions from oldest to newest to find the final delegated amount from each account
  delegation_transactions.reverse();

  for(var i = 0; i < delegation_transactions.length; i++) {
    var trans = delegation_transactions[i];

    // Check if this is a new delegation or an update to an existing delegation from this account
    var delegation = delegations.find(d => d.delegator == trans.data.delegator);

    if(delegation) {
      delegation.vesting_shares = trans.data.vesting_shares;
    } else {
      delegations.push({ delegator: trans.data.delegator, vesting_shares: trans.data.vesting_shares });
    }
  }

  delegation_transactions = [];

  // Return a list of all delegations (and filter out any that are 0)
  return delegations.filter(function(d) { return parseFloat(d.vesting_shares) > 0; });
}

module.exports = {
  loadDelegations: loadDelegations
};
