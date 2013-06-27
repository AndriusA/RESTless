$(function() {
    function nonEmpty(xs) {
        return !_.isEmpty(xs)
    }

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

    // VIEWS
    // user gets passed as a property - hook up the changes to template here
    function TweetView(tweet, user) {
        var tweetTemplate = Handlebars.compile($("#tweet-template").html())
        var tweetElement = $(tweetTemplate(_.extend(tweet, {'user': user}) ))
        var $header = tweetElement.find(".tweetHeader")
        var $userName = $header.find(".userName")
        var $userHandle = $header.find(".userHandle")
        var $tweetImage = tweetElement.find(".tweetImage img")

        user.map('.name').assign($userName, "text")
        user.map('.scree_name').assign($userHandle, "text")
        user.map('.profile_image_url').assign($tweetImage, "attr", "src")

        // console.log(tweetElement)

        return {
            element: tweetElement,
        }
    }

    function TweetListView(listElement, model, usersModel, hash, selectedList) {
        var repaint = model.deletedTweets
        repaint.merge(Bacon.once()).map(selectedList).onValue(render)

        model.tweets.onValue(function(tweet) {
            addTweet(tweet)
        })

        function render(tweets) {
            listElement.children().remove()
            _.each(tweets, addTweet)
        }

        function addTweet(tweet) {
            get = usersModel.retrieveItem(tweet.user_id_str)
            var user = usersModel.allUsers.map(get).skipDuplicates()
            
            var view = TweetView(tweet, user)
            listElement.prepend(view.element)
            // model.tweetDeleted.plug(view.destroy.takeUntil(repaint))
        }

    }

    function UserView(user) {
        var userTemplate = Handlebars.compile($("#user-template").html())
        var userElement = $(userTemplate(user))
        return {
            element: userElement
        }
    }

    function UserListView(listElement, model, hash, selectedList) {
        var repaint = Bacon.once()
        repaint.merge(Bacon.once()).map(selectedList).map(render)

        model.allUsers.onValue(function(users) {
            render(users)
        })

        function render(users) {
            listElement.children().remove()
            // console.log("render", users)
            _.each(users, addUser)
        }

        function addUser(user) {
            var view = UserView(user)
            listElement.prepend(view.element)
        }
    }

    function ConversationPreview(conversation, peer) {
        // console.log("conversation", conversation)
        var conversationTemplate = Handlebars.compile($("#conversation-template").html())
        // Create an "empty" element - will populate later and automatically as conversation property changes
        convPreview = {peer_id: conversation.peer_id, preview_message: {}}
        var conversationElement = $(conversationTemplate(convPreview))

        // Get the elements that are bound to properties dynamically
        var $message = conversationElement.find(".conversation .message-text")
        var $sender = conversationElement.find(".conversation .sender")
        var $userName = conversationElement.find(".conversation .user-header .userName")
        var $userHandle = conversationElement.find(".conversation .user-header .userHandle")
        var $tweetImage = conversationElement.find(".conversation .user-avatar img")

        // Map the properties to HTML elements
        peer.map('.name').assign($userName, "text")
        peer.map('.screen_name').assign($userHandle, "text")
        peer.map('.profile_image_url').assign($tweetImage, "attr", "src")
        conversation.property.map('.preview_message').map('.text').onValue(function (v) { $message.text(v) })
        peer.map('.screen_name').assign($sender, "text")

        return {
            element: conversationElement,
            chosen: conversationElement.asEventStream("click")
        }
    }

    function ConversationListView(listElement, model, usersModel, hash, selectedList) {
        console.log("Conversation List View")
        var repaint = Bacon.once()
        repaint.map(selectedList).log("selected").onValue(render)
        model.addedConversations.onValue(addConversation)
        model.allMessages.onValue(render)

        model.allMessages.onValue(function(v){
            _.each(v, function(c) {
                c.property.log("m?")
            })
        })

        function render (conversations) {
            console.log("render", conversations)
            listElement.children().remove()
            _.each(conversations, addConversation)
        }

        function addConversation (conv) {
            console.log("add conversation", conv)
            // Also get the user from the usersModel to bind to view dynamically
            get = usersModel.retrieveItem(conv.peer_id)
            var user = usersModel.allUsers.map(get)
            // conv.property.onValue(function(c) { console.log("aa", c) })
            var view = ConversationPreview(conv, user)
            listElement.prepend(view.element)
            model.showConversation.plug(view.chosen.takeUntil(repaint).map(conv))
        }
    }

    function MessageView(message) {
        var messageTemplate = Handlebars.compile($("#message-template").html())
        var messageElement = $(messageTemplate(message))

        return {
            element: messageElement,
        }
    }

    function ChatView(listElement, chatElement, model, usersModel, hash) {
        var repaint = model.showConversation
        repaint.onValue(selectConversation)
        hash.onValue(function(){ chatElement.addClass("invisible") })

        function selectConversation(conversation) {
            conversation.property.log("property").map('.messages').log("m").onValue(render)    
        }

        function render (messages) {
            console.log("Render messages:", messages)
            listElement.children().remove()
            chatElement.removeClass("invisible")
            _.each(messages, addMessage)
        }

        function addMessage(message) {
            var view = MessageView(message)
            listElement.prepend(view.element)
        }
    }

    function FilterView(element, hash) {
        hash.onValue(function(hash) {
          element.find("a").each(function() {
            var link = $(this)
            link.toggleClass("selected", link.attr("href") == hash)
          })
        })
    }

    function SelectView(element, hash) {
        var selectedView = hash.decode({
            "#/": "tweet-list",
            "#/dm": "conversation-list",
            "#/users": "user-list"
        })
        selectedView.onValue(function(id) {
          element.find("ul").each(function() {
            var view = $(this)
            view.toggleClass("invisible", view.attr("id") !== id)
          })
        })
    }

    function ItemCountView(element, hash, selectedList) {
        selectedList.onValue(render)

        function render(items) {
            Bacon.once(items).map(".length").map(function(count) {
                return "<strong>" + count + "</strong>" + ((count == 1) ? " item" : " items")
            }).assign(element, "html")
        }
    }

    // MODELS

    function TweetListModel() {
        function addItem(newItem) { return function(list) { return list.concat([newItem]) }}
        function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        var irrelephantTweetFields = ['id', 'source', 'truncated', 'filter_level', 'lang', 'possibly_sensitive']
        function removeTweetIrrelephantFields(irrelephantTweetFields, tweet) { return _.omit(tweet, irrelephantTweetFields) }
        var removeIrrelevant = _.partial(removeTweetIrrelephantFields, irrelephantTweetFields)
        function filterTweets (message) { return _.has(message, 'retweeted') }
        function filterTweetDeletions (message) { return _.has(message, 'delete') && _.has(message['delete'], 'status') }
        // Compose functions - chain the functions so that one is applied to the results of the other
        var cleanupTweet = _.compose(compactObject, removeIrrelevant, removeTweetUserInfo, _.clone)

        function removeTweetUserInfo (tweet) {
            var newTweet = _.clone(tweet);
            if (_.has(tweet, 'user') && _.has(tweet['user'], 'id_str')) {
                newTweet['user_id_str'] = tweet['user']['id_str'];
                newTweet['user'] = null;
            }
            return newTweet;
        }

        function cleanupRetweet (tweet) {
            var newTweet = _.clone(tweet);
            if (_.has(tweet, 'retweeted_status')) {
                newTweet.retweeted_status = _.clone(tweet.retweeted_status)
                newTweet.retweeted_status.user_id_str = tweet.retweeted_status.id_str;
                newTweet['retweeted_status']['user'] = null;
                newTweet['retweeted_status'] = cleanupTweet(tweet['retweeted_status']);
            }
            return newTweet;
        }

        this.twitterEvents = new Bacon.Bus()
        this.deletedTweets = new Bacon.Bus()

        this.onlyTweets = this.twitterEvents.filter(filterTweets)
        this.tweets = this.twitterEvents.filter(filterTweets)
                        .map(cleanupTweet)
                        .map(cleanupRetweet)
        this.deletedTweets.plug(this.twitterEvents.filter(filterTweetDeletions))
        tweetChanges = this.tweets.map(addItem)
                        .merge(this.deletedTweets.map(removeItem))

        this.allTweets = tweetChanges.scan([], function(tweets, f) { return f(tweets) })
        // this.allTweets.changes().onValue(storage.writeTweets)
    }

    function UserListModel() {
        function addItem(newItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === newItem.id_str }).concat([newItem]) }}
        function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        function retrieveItem(id) { return function(list) {return _.find(list, function(item){ return item.id_str == id}) }}
        function filterFriendsLists (message) { return _.has(message, 'friends') }
        function filterEvents (message) { return _.has(message, 'event') }

        this.twitterEvents = new Bacon.Bus()
        this.tweets = new Bacon.Bus()
        this.retrieveItem = retrieveItem

        retweetUserInfo = this.tweets.flatMap(function(tweet){
            if (tweet.hasOwnProperty('retweeted_status')) return Bacon.once(tweet.retweeted_status.user) // Is a retweet
            else return Bacon.never();
        })
        tweetUserInfo = this.tweets.map(function(tweet) { return _.clone(tweet['user']) })
        events = this.twitterEvents.filter(filterEvents)
        followUserInfo = events.filter(function (event) { return _.where([event], {'event': 'follow' }) })
            .map(function (follow) { return _.clone(follow['target']) })
        dmUserInfo = this.twitterEvents.filter(function (event) { return _.has(event, 'direct_message') })
            .flatMap(function (dm){ return Bacon.fromArray([dm.direct_message.sender, dm.direct_message.recipient]) })

        this.userInfo = Bacon.mergeAll([followUserInfo, tweetUserInfo, retweetUserInfo, dmUserInfo]).map(addItem)
        this.allUsers = this.userInfo.scan([], function(users, f) { return f(users) })
        // this.allUsers.log("user")
    }

    function DMListModel() {
        function matchConversation(peer_id, message) { return message.sender_id_str === peer_id || message.recipient_id_str === peer_id }
        function prependItem(list, newItem) { return [newItem].concat(list) }
        // Model Direct Messages as a list of dictionaries (conversations), identified by ID of "the other" peer
        // [{peer_id, messages}, ...]
        function addMessage(model, newMessage) { 
            return function(list) {
                var searchID = isOwnID(newMessage.sender_id_str) ? newMessage.recipient_id_str : newMessage.sender_id_str
                // console.log("search:", searchID)
                if ( _.every(list, function (conv) { return conv.peer_id !== searchID }) ) {
                    var conversation = { peer_id: searchID, 
                        property: Bacon.combineTemplate({
                            peer_id: searchID,
                            preview_message: DMs.filter(matchConversation, searchID).toProperty(),
                            messages: DMs.filter(matchConversation, searchID).scan([newMessage], prependItem)
                        })
                    }
                    console.log("adding new conversation")
                    model.addedConversations.plug(Bacon.once(conversation))
                    return list.concat([ conversation ])
                }
                return list
            }
        }
        // function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        // function retrieveItem(id) { return function(list) {return _.find(list, function(item){ return item.id_str == id}) }}
        function filterDirectMessages (message) { return _.has(message, 'direct_message') }
        function unwrap (message) { return message.direct_message }

        this.twitterEvents = new Bacon.Bus();
        this.addedConversations = new Bacon.Bus();
        this.showConversation = new Bacon.Bus();

        // this.showConversation.plug(this.addedConversations)

        var DMs = this.twitterEvents.filter(filterDirectMessages).map(unwrap)
        this.directMessages = DMs.map(addMessage, this)
        this.allMessages = this.directMessages.scan([], function(messages, f) { return f(messages) })
        // this.allMessages.onValue(function(v){
        //     _.each(v, function(c) {
        //         c.property.log("m?")
        //     })
        // })
    }


    function TwitterApp() {
        tweetsModel = new TweetListModel()
        usersModel = new UserListModel()
        messagesModel = new DMListModel()

        var hash = Bacon.UI.hash("#/")
        FilterView($("#filters"), hash)
        SelectView($("#views"), hash)

        var selectedList = hash.decode({
            "#/": tweetsModel.allTweets,
            "#/dm": messagesModel.allMessages,
            "#/users": usersModel.allUsers
        })

        ItemCountView($("#tweet-count"), hash, selectedList)
        hash.onValue(function (h) {
            if (h === "#/")
                TweetListView($("#tweet-list"), tweetsModel, usersModel, hash, selectedList)
            else if (h === "#/users")
                UserListView($("#user-list"), usersModel, hash, selectedList)    
            else 
                ConversationListView($("#conversation-list"), messagesModel, usersModel, hash, selectedList)
        })

        ChatView($("#message-list"), $("#chat"), messagesModel, usersModel, hash)
        
        
        // Connect to
        var ws = new WebSocket("ws://127.0.0.1:6969")
        ws.onopen = function() { console.log("Websocket connection opened"); }

        tweetsModel.twitterEvents.plug(Bacon.fromEventTarget(ws, "message").map(".data").map(JSON.parse))
        // Plug both complete twitter stream (for follows/unfollows, etc.)
        // and filtered only tweets - this model should not have to know how to filter for tweets
        usersModel.twitterEvents.plug(tweetsModel.twitterEvents)
        usersModel.tweets.plug(tweetsModel.onlyTweets)

        messagesModel.twitterEvents.plug(tweetsModel.twitterEvents)

        // tweetsModel.allTweets.map(nonEmpty).assign($("#main,#footer"), "toggle")
    }

    TwitterApp()

})


// List of friends of a user, only seen sent at the beginning of the session
// var friends = twitterEvents.filter(filterFriendsLists)//.log("Friends:");
// var directMessages = twitterEvents.filter(filterDirectMessages)//.log("DM:");
// Events include follows, unfollows, favorites, retweets, etc.
// var events = twitterEvents.filter(filterEvents)//.log("Event:")

//     // A stream of compressed tweets as strings, at the moment just to compare size savings
//     var compressed = tweets.flatMap(function(v){
//             return Bacon.fromNodeCallback(zlib.deflate, v)      // deflate using zlib
//         })
//         .map(function (b) { return b.toString() })          // convert to a string
//         .map(".length").log("Zipped length:")
