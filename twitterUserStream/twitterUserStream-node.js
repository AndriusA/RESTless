var Stream = require('user-stream');
var twitterConfig = require('./twitterConfig-node');

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


wss.on('connection', function(ws) {
    console.log("Connection established");
    // Send all buffered stuff
    for (i in collectedMessages)
        ws.send(JSON.stringify(collectedMessages[i]))

    ws.on('message', function(message) {
        console.log('received: %s', message);
    });
    stream.on('data', function(json){
        console.log("Received from twitter:", json);
        try {
            ws.send(JSON.stringify(json));
        } catch (err) {
            // do nothing
        }
    })
});