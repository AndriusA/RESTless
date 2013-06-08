var Bacon = require('baconjs')
var Stream = require('user-stream');
var prettyjson = require('prettyjson');
var zlib = require('zlib');
var _ = require('underscore');

var twitterConfig = {
    consumer_key: 'Gs1rHqW1dwXEopN711mQFA',
    consumer_secret: '0l6DpoGEjruOH7fYWRCjvWOdHzFXHSqBRbTIBax7T6I',
    access_token_key: '82142104-Jfa0l5APzBnV2KenIMDfzpfWvlXuvDFdRUyo8w00D',
    access_token_secret: 'tnQy4PZMSNWC7kSy4MvFmCf1qiuYdC8FsPmghYzOs'    
}

var irrelephantTweetFields = ['id', 'source', 'truncated', 'filter_level', 'lang', 'possibly_sensitive'];

// Only need this to swap the arguments around for _.omit
function removeTweetIrrelephantFields(irrelephantTweetFields, tweet) {
    return _.omit(tweet, irrelephantTweetFields);
}

function filterDirectMessages (message) {
    return _.has(message, 'direct_message');
}

function filterFriendsLists (message) {
    return _.has(message, 'friends');
}

function filterEvents (message) {
    return _.has(message, 'event');
}

function filterTweets (message) {
    return !filterDirectMessages(message) && !filterEvents(message) && !filterFriendsLists(message);
}

function removeTweetUserInfo (tweet) {
    var newTweet = _.clone(tweet);
    if (tweet.hasOwnProperty('user')) {
        newTweet['user_id_str'] = tweet['user']['id_str'];
        newTweet['user'] = null;
    }
    if (tweet.hasOwnProperty('retweeted_status')) {
        newTweet['retweeted_status']['user_id_str'] = tweet['retweeted_status']['id_str'];
        newTweet['retweeted_status']['user'] = null;
    }
    return newTweet;
}

// Compose functions - chain the functions so that one is applied to the results of the other
// (first in the list gets applied last)
var cleanupTweet = _.compose(compactObject, 
    _.partial(removeTweetIrrelephantFields, irrelephantTweetFields), 
    removeTweetUserInfo,
    _.clone)

// Recursively remove null or empty (arrays or objects) fields
function compactObject(o) {
    _.each(o, function(v, k){
        // Remove all fields that are either null or empty (empty arrays/objects)
        if (_.isNull(v) || (_.isEmpty(v) && !(_.isNumber(v) || _.isBoolean(v))))
            delete o[k];
        else if (_.isObject(v))
            o[k] = compactObject(v);
    })
    return o;
}



//create Twitter stream using Twitter Stream API
var stream = new Stream(twitterConfig);
stream.stream();
//Create twitter events EventStream (Bus)
var twitterEvents = Bacon.fromEventTarget(stream, "data");
// twitterEvents.log("ALL:");

// List of friends of a user, only seen sent at the beginning of the session
var friends = twitterEvents.filter(filterFriendsLists)//.log("Friends:");
var directMessages = twitterEvents.filter(filterDirectMessages)//.log("DM:");
// Events include follows, unfollows, favorites, retweets, etc.
var events = twitterEvents.filter(filterEvents)//.log("Event:")

// Tweets themselves, with unnecessary information removed
var tweets = twitterEvents.filter(filterTweets)
                          .map(cleanupTweet)
                          .map(prettyjson.render).log("Tweet:")

// A stream of compressed tweets as strings, at the moment just to compare size savings
var compressed = tweets.flatMap(function(v){
                            return Bacon.fromNodeCallback(zlib.deflate, v)      // deflate using zlib
                        })
                        .map(function (b) { return b.toString() })          // convert to a string
                        // .log("Zipped:")

var retweetUserInfo = twitterEvents.filter(filterTweets)
                                    .flatMap(function(tweet){
                                        // Is a retweet
                                        if (tweet.hasOwnProperty('retweeted_status'))
                                            return Bacon.once(_.clone(tweet['retweeted_status']['user']))
                                        else
                                            return Bacon.never();
                                    })
var tweetUserInfo = twitterEvents.filter(filterTweets)
                                .map(function(tweet) { return _.clone(tweet['user']) })
var followUserInfo = events.filter(function (event) { return _.where([event], {'event': 'follow' }) })
                            .map(function (follow) { return _.clone(follow['target']) })

// User info as obtained from 'follow' events and tweets - 
// no need to include in every message, so collect and process separately
var userInfo = Bacon.mergeAll([followUserInfo, tweetUserInfo, retweetUserInfo]);
                     // .map(prettyjson.render).log("userInfo:")