(function() {
    // var Bacon = BaconTracer.proxyObject(window.Bacon);
    Bacon.BaconName = "TopBacon";
    // console.debug = function() {};
    // Recursively remove null or empty (arrays or objects) fields
    function compactObject(o) {
        _.each(o, function(v, k){
            // Remove all fields that are either null or empty (empty arrays/objects)
            if (_.isNull(v) || (_.isEmpty(v) && !(_.isNumber(v) || _.isBoolean(v))))
                delete o[k]
            else if (_.isObject(v))
                o[k] = compactObject(v)
        })
        return o;
    }

    // FIXME: Nasty hack, hardcoded
    function isOwnID(id) {
        return id === "82142104"
    }

    // MODELS
    function TweetListModel(networkEvents) {
        function addItem(newItem) { 
            return function(list) { return [newItem].concat(list) }
        }
        function removeItem(deletedItem) { 
            return function(list) { 
                return _.reject(list, function(item) { 
                    return item.id_str === deletedItem.delete.status.id_str
                }) 
            }
        }
        function removeTweetIrrelevantFields(irrelevantTweetFields, tweet) { 
            return _.omit(tweet, irrelevantTweetFields) 
        }
        var irrelevantTweetFields = [
            'id', 
            'source',
            'truncated',
            'filter_level',
            'lang',
            'possibly_sensitive'
        ]
        var removeIrrelevant = _.partial(removeTweetIrrelevantFields, irrelevantTweetFields)
        function filterTweets (message) { 
            return _.has(message, 'retweeted') 
        }
        function filterTweetDeletions (message) { 
            return _.has(message, 'delete') && _.has(message['delete'], 'status')
        }
        // Compose functions - chain the functions so that one is applied to the results of the other
        var cleanupTweet = _.compose(compactObject, removeIrrelevant, _.clone)
        function postTweet(message) {
            return {
                type: "post",
                url: "https://api.twitter.com/1.1/statuses/update.json",
                data: {
                    status: message.status,   //required
                    in_reply_to_status_id: message.in_reply_to_status_id, //optional
                    lat: null,      //optional
                    long: null,     //optional
                    place_id: null, //optional  A place in the world. These IDs can be retrieved from GET geo/reverse_geocode
                    display_coordinates: null,  //optional
                    trim_user: true,    //optional - When set to either true, t or 1, each tweet returned in a timeline will include a user object including only the status authors numerical ID.
                }
            }
        }

        function cleanupRetweet (tweet) {
            var newTweet = _.clone(tweet);
            if (_.has(tweet, 'retweeted_status')) {
                newTweet.retweeted_status = _.clone(tweet.retweeted_status);
                newTweet['retweeted_status'] = cleanupTweet(tweet['retweeted_status']);
            }
            return newTweet;
        }

        // Set up data flows between EventStreams and Properties
        this.twitterEvents = networkEvents;
        this.deletedTweets = this.twitterEvents.filter(filterTweetDeletions);

        this.postedTweets = new Bacon.Bus();
        this.networkRequests = this.postedTweets.map(postTweet);

        this.onlyTweets = this.twitterEvents.filter(filterTweets);
        this.tweets = this.onlyTweets
                        .map(cleanupTweet)
                        .map(cleanupRetweet);
        var tweetChanges = this.tweets.map(addItem)
                        .merge(this.deletedTweets.map(removeItem))

        this.allTweets = tweetChanges.scan([], function(tweets, f) { return f(tweets) })
        
        // this.allTweets.log("allTweets");
        // this.allTweets.changes().onValue(storage.writeTweets)

        // Assigning names for Bacon EventStreams and Properties in the BaconProxy
        this.twitterEvents.BaconName = "twitterEvents";
        this.deletedTweets.BaconName = "deletedTweets";
        this.postedTweets.BaconName = "postedTweets";
        this.networkRequests.BaconName = "networkRequests";
        this.onlyTweets.BaconName = "onlyTweets";
        this.tweets.BaconName = "tweets";
        tweetChanges.BaconName = "tweetChanges";
        this.allTweets.BaconName = "allTweets";
    }

    function UserListModel(networkEvents) {
        function addItem(newItem) { return function(list) { 
            return _.reject(list, function(item) { return item.id_str === newItem.id_str }).concat([newItem]) 
        }}
        // function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        function retrieveItem(id) { return function(list) {return _.find(list, function(item){ return item.id_str === id}) }}
        function addNew(newItem) { 
            return function(list) {
                if (_.isEqual(_.omit(retrieveItem(newItem.id_str)(list), 'statuses_count'), _.omit(newItem, 'statuses_count'))) {
                    // console.log("nothing changed")
                    return list
                }
                else {
                    // console.log("updating user", newItem.name)
                    return addItem(newItem)(list)
                }
            }
        }
        // function filterFriendsLists (message) { return _.has(message, 'friends') }
        function filterEvents (message) { return _.has(message, 'event') }
        function filterFollows (event) { return _.where([event], {'event': 'follow' }) }
        function getFollower (event) { return _.clone(follow['target']) }
        function filterDMs (event) { return _.has(event, 'direct_message') }
        function filterNetworkUserInfo (message) { return _.has(message, 'screen_name'); }
        
        function getUserInfo (user_id_str) { 
            return {
                type: "get", 
                url: "https://api.twitter.com/1.1/users/show.json?screen_name=rsarver", 
                data: { user_id: user_id_str } 
            };
        }

        this.twitterEvents = networkEvents
        this.retrieveItem = retrieveItem

        this.getUserInfo = new Bacon.Bus()
        this.getUserInfo.BaconName = "getUserInfo"
        this.networkRequests = this.getUserInfo.map(getUserInfo)
        this.networkRequests.BaconName = "networkRequests";

        
        var events = this.twitterEvents.filter(filterEvents)
        var followUserInfo = events.filter(filterFollows)
            .map(getFollower)
        
        var dmUserInfo = this.twitterEvents.filter(filterDMs) 
            .flatMap(function (dm){ 
                return Bacon.fromArray([dm.direct_message.sender, dm.direct_message.recipient]) 
            })
        
        var userInfoPackets = networkEvents.filter(filterNetworkUserInfo)
        this.userAdded = followUserInfo
                            .merge(userInfoPackets)
                            .merge(dmUserInfo)
        this.userChanges = this.userAdded.map(addNew)
        this.allUsers = this.userChanges.scan([], function(users, f) { return f(users) })

        events.BaconName = "events";
        followUserInfo.BaconName = "followUserInfo";
        dmUserInfo.BaconName = "dmUserInfo";
        this.userAdded.BaconName = "userAdded";
        this.userChanges.BaconName = "userChanges";
        this.allUsers.BaconName = "allUsers"
    }

    function DMListModel(networkEvents) {
        function addPeer(message) {
            var peer_id = isOwnID(message.sender_id_str) ? message.recipient_id_str : message.sender_id_str
            return _.extend(_.clone(message), {peer_id: peer_id})
        }
        function addMessage(newMessage) { return function(list) { 
            return _.reject(list, function(item) { 
                return item.id_str === "0" && item.peer_id === newMessage.peer_id && item.text === newMessage.text 
            }).concat([newMessage]) 
        } }
        function notOwnMessage(message) { return !isOwnID(message.sender_id_str) }
        function filterDirectMessages (message) { return _.has(message, 'direct_message')}
        function unwrap (message) { return message.direct_message }
        function sendMessage(message) {
            console.log("Send message", message)
            var rMessage = _.extend(_.clone(message), {user_id: message.peer_id})
            return {
                type: "post", 
                url: "https://api.twitter.com/1.1/direct_messages/new.json", 
                data: _.pick(rMessage, 'user_id', 'text')
            }
        }
        // Previewing message locally before sending to the API and receiving a reply
        function previewMessage (message) {
            console.log("preview message", message);
            return _.extend(_.clone(message), 
                    {created_at: null,//moment().format("ddd MMM DD HH:mm:ss Z YYYY"), 
                     sender: {screen_name: "AndriusAuc"}})
        }

        function newConversationMessage (messageReceived, allMessages) {
            var peer;
            if (messageReceived.sender_id_str === messageReceived.peer_id)
                peer = messageReceived.sender;
            else
                peer = messageReceived.recipient;
            var messagePreview = {
                peer_id: messageReceived.peer_id,
                peer: peer, 
                messagePreview: messageReceived
            }     
            return function (list) {
                return [messagePreview]
                    // Reject automatically ignores the case when there is no
                    // previous conversationw with the peer
                    .concat(_.reject(list, function(item) { 
                        return item.peer_id === messageReceived.peer_id
                    }))
            }
        }
        function filterConversation(allMessages, showConversation) {
            return _.where(allMessages, {peer_id: showConversation.peer_id});
        }

        // networkEvents.map(".direct_message").log("netevent")
        this.showConversation = new Bacon.Bus();
        this.sendMessages = new Bacon.Bus();
        this.networkRequests = this.sendMessages.map(sendMessage)

        var messageReceived = networkEvents
            .filter(filterDirectMessages)
            .map(unwrap)
            .map(addPeer)//.filter(notOwnMessage)
            .merge(this.sendMessages.map(previewMessage))
        var messageChanges = messageReceived.map(addMessage)
        this.allMessages = messageChanges.scan([], function(messages, f) { return f(messages) })

        var conversationChanges = Bacon.combineWith(newConversationMessage, messageReceived, this.allMessages)
        this.conversations = conversationChanges.scan([], function(conversations, f) { return f(conversations) })
        this.currentConversation = Bacon.combineWith(
            filterConversation, 
            this.allMessages, 
            this.showConversation.toProperty({peer_id: null})   // The peer_id === null when no conversation is shown
        );


        this.showConversation.BaconName = "showConversation";
        this.sendMessages.BaconName = "SendMessages";
        this.networkRequests.BaconName = "networkRequests";
        messageReceived.BaconName = "messageReceived";
        messageChanges.BaconName = "messageChanges";
        this.allMessages.BaconName = "allMessages";
    }

    function TwitterApp() {
        // Initialize the connection
        var connection = wsConnection();
        var netEvents = networkEvents(connection);
        // Initialise the three models
        var tweetsModel = new TweetListModel(netEvents)
        var usersModel = new UserListModel(netEvents)
        var messagesModel = new DMListModel(netEvents)
        var tweetsViewModel = TwitterViews.TweetsListViewModel(tweetsModel, usersModel)

        // The ViewModel values derived from the model
        var hash = new Bacon.Bus();
        var hashValue = hash.toProperty("#/");
        var selectedListLength = hashValue.decode({
            "#/": tweetsModel.allTweets,
            "#/dm": messagesModel.conversations,
            "#/users": usersModel.allUsers
        }).map(".length")
        selectedListLength.BaconName = "selectedListLength";
        var currentlyVisible = hashValue.decode({
            "#/": "tweets",
            "#/dm": "conversations",
            "#/users": "users"
        })

        // The full data ViewModel as it maps to the HTML template
        var appViewModel = Bacon.combineTemplate({
            tweets: tweetsViewModel,
            conversations: messagesModel.conversations,
            currentConversation: messagesModel.currentConversation,
            currentConversationId: messagesModel.showConversation.toProperty({peer_id: null}).map(".peer_id"),
            users: usersModel.allUsers,
            sectionItemCount: selectedListLength,
            currentlyVisible: currentlyVisible,
        }).debounce(1); // Do the debouncing just for the scheduler to avoid firing events too often

        console.debug("Start ractive");
        var ractive = new Ractive({
            el: '#twitterApp',
            template: "#twitterAppTemplate",
            data: appViewModel,
            monitorChanges: false,
        });
        console.log(JSON.stringify(ractive.template));

        // Need to hook into the bus due to the nature of "Functional" programming
        // (unidirectional flows)
        // TODO: better mapping to paradigm of FRP than pushing to Buses
        ractive.on({
            "selectList": function(event){
                hash.push(event.node.hash);
            },
            "tweetSend": function(event){
                event.original.preventDefault();
                tweetsModel.postedTweets.push({status: this.get("tweetText")});
            },
            "showConversation": function(event){
                var peer_id = event.node.id;
                messagesModel.showConversation.push({peer_id: peer_id});
            },
            "chatSend": function(event){
                event.original.preventDefault();
                console.log(event);
                messagesModel.sendMessages.push({
                    peer_id: this.get("currentConversationId"),
                    text: this.get("chatText")
                })
            }
        })
        messagesModel.showConversation.plug(hash.map({peer_id: null}));

        // Plug the network requests back into the same (not necessarily though) connection
        var netRequests = networkRequests(connection, 
            tweetsModel.networkRequests, 
            usersModel.networkRequests, 
            messagesModel.networkRequests
        )
    }


    // The block that deals with connectivity - hopefully easily swappable with anything else    
    function wsConnection() {
        var ws = new WebSocket("ws://127.0.0.1:6969")
        ws.onopen = function() { console.log("Websocket connection opened"); }
        return ws;
    }

    // Somewhat network specific as to how the connection is turned into an EventStream
    function networkEvents(ws) {
        var i = 0;
        function delayEvent(event) {
            i = i + 1;
            return Bacon.later(i*0, event);
        }
        // @wsEvents
        var wsEvents = Bacon.fromEventTarget(ws, "message")
            .map(".data")
            .map(JSON.parse)
            .flatMap(delayEvent)
        wsEvents.BaconName = "Websocket Events"
        return wsEvents;
    }
    function networkRequests(ws, net1, net2, net3) {
        var requests = net1.merge(net2).merge(net3)
        requests.BaconName = "Requests";
        requests.map(JSON.stringify).onValue(function(request){
            console.debug("request", request);
            // ws.send(request);
        })
    }

    TwitterApp()
    // setTimeout(function(){
    //     BaconTracer.drawRelationshipsForce("#graph")    
    // }, 1000)

}).call(this);