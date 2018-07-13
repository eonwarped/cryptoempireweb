const steem = require('steem');

const rpc_node = 'wss://steemd.privex.io';

function loadPosts(account, callback) {
  return getPosts(account, -1, [], new Set(), callback);
}

function getPosts(account, start, posts, visitedPermlinks, callback) {
  let last_trans = start;

  console.log(`Fetching account history for ${account} at ${start}`);
  steem.api.setOptions({ transport: 'http', uri: rpc_node, url: rpc_node });
  steem.api.getAccountHistory(account, start, (start < 0) ? 10000 : Math.min(start, 10000), (err, result) => {
    let hasError = false;
    if (err) {
      console.log('error');
      console.log(err);
      hasError = true;
    }
    if (!hasError) {
      result.reverse();

      result.forEach(function(trans) {
        var op = trans[1].op;

        if(op[0] == 'comment') {
          /*
          if (posts.length <= 2) {
            console.log(trans);
            console.log(op);
            console.log(op[1]);
            console.log(trans[1].timestamp);
            console.log(JSON.parse(op[1].json_metadata).tags);
          }
          */
          const post = op[1];
          
          if (post.parent_author === '' && post.author === account && post.title) {
            if (!visitedPermlinks.has(post.permlink)) {
              visitedPermlinks.add(post.permlink);

              const jsonMetadata = JSON.parse(post.json_metadata);

              //console.log(post);
              posts.push({
                author: account,
                timestamp: trans[1].timestamp,
                title: post.title,
                permlink: post.permlink,
                tags: jsonMetadata.tags,
              });
            }
          }
        }
        // Save the ID of the last transaction that was processed.
        last_trans = trans[0];
      });

      if(last_trans > 0 && last_trans != start) {
        return getPosts(account, last_trans, posts, visitedPermlinks, callback);
      } else {
        if (last_trans > 0) {
          console.log('Missing account history.... last trans: ' + last_trans);
          hasError = true;
        }
      }
    }

    if (hasError) {
      // add indication that loading failed
      posts.unshift({
        author: account,
        timestamp: 'Error while loading',
        title: '',
        permlink: '',
        tags: '',
      });
    }
    callback(posts.reverse());
  }); 
}

module.exports = {
  loadPosts: loadPosts,
};
