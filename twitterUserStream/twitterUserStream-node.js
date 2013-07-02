var Stream = require('user-stream')
var twitterConfig = require('./twitterConfig-node')
var $ = require("jquery")
var _ = require("underscore")
var oauth = require('oauth')

console.log(twitterConfig)

var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({port: 6969});

//create Twitter stream using Twitter Stream API
var stream = new Stream(twitterConfig)
stream.stream()

var collectedMessages = []
stream.on('data', function(json) {
    collectedMessages.push(json)
})

stream.on('error', function(e){
    console.log("error", e)
}) 

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


wss.on('connection', function(ws) {
    console.log("Connection established");
    // Send all buffered stuff
    for (i in collectedMessages)
        ws.send(JSON.stringify(collectedMessages[i]))

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
                    console.log(error, data, response);
                }
            );
        }

    });
    stream.on('data', function(json){
        console.log("Received from twitter:", json);
        try {
            ws.send(JSON.stringify(json))
        } catch (err) {
            // do nothing
        }
    })
});