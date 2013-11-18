var twitterConfig = require('./twitterConfig-node')
console.log(twitterConfig)

// Libs
var Stream = require('user-stream')
var $ = require('jquery')
var _ = require('underscore')
var oauth = require('oauth')
var Bacon = require('baconjs')

var user_stream_url     = 'https://userstream.twitter.com/1.1/user.json',
    request_token_url   = 'https://api.twitter.com/oauth/request_token',
    access_token_url    = 'https://api.twitter.com/oauth/access_token';

oauth = new oauth.OAuth(
    request_token_url,
    access_token_url,
    twitterConfig.consumer_key,
    twitterConfig.consumer_secret,
    '1.0', 
    null, 
    'HMAC-SHA1'
);

var WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({port: 6969});

function removeTweetUserInfo (tweet) {
    var newTweet = _.clone(tweet);
    if (_.has(tweet, 'user') && _.has(tweet.user, 'id_str')) {
        newTweet.user_id_str = tweet.user.id_str;
        newTweet.user = null;
    }
    if (_.has(tweet, 'retweeted_status')) {
        newTweet.retweeted_status.user_id_str = tweet.retweeted_status.id_str;
        newTweet.retweeted_status.user = null;
    }
    return newTweet;
}

//create Twitter stream using Twitter Stream API
var stream = new Stream(twitterConfig)
var rawEvents = Bacon.fromEventTarget(stream, 'data')
var retweetUserInfo = rawEvents.filter(function(d){ return _.has(d, 'retweeted_status')})
                                .map('.retweeted_status.user')
var tweetUserInfo = rawEvents.filter(function(d){ return _.has(d, 'user')})
                                .map(function(tweet) { return _.clone(tweet['user']) })

tweetUserInfo.merge(retweetUserInfo).log("USERINFO")

var twitterEvents = rawEvents.map(removeTweetUserInfo).merge(tweetUserInfo).merge(retweetUserInfo);
stream.stream()
stream.on('error', function(e){
    console.log("error", e)
})

function append(list, element){
    return list.concat([element]);
}

var collectedMessages = twitterEvents.scan([], append);


wss.on('connection', function(ws) {
    console.log("Connection established");
    // Send all buffered stuff
    collectedMessages.log("THE PROPERTY").sampledBy(Bacon.once()).onValue(function(collected){
        console.log("buffered?")
        for (i in collected)
            if (ws.readyState === 1) {
                ws.send(JSON.stringify(collected[i]))
                console.log("sent", collected[i].id_str)
            }
            else {
                console.log("ws not ready")
            }
    })
    

    ws.on('message', function(message) {
        var data = JSON.parse(message)
        console.log('received:', data)
        if (_.has(data, "url")){
            console.log("doing an ajax post to twitter")
            var request = oauth.post(
                data.url,
                twitterConfig.access_token_key,
                twitterConfig.access_token_secret,
                data.data,
                function (error, data, response) {
                    // console.log(error, data, response);
                }
            );
        }
    });

    ws.on('close', function() {
      ws = null;
    });

    twitterEvents.map(JSON.stringify).log("Received from twitter:").onValue(function(d){
        if (ws && ws.readyState === 1){
            console.log("sending");
            ws.send(d);
        }
    })
});