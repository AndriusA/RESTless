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

        userName = user.map(function (u){
            if (_.has(u, 'name')) return u.name 
        })
        userHandle = user.map(function (u){
            if (_.has(u, 'screen_name')) return u.screen_name 
        })
        tweetImage = user.map(function (u){
            if (_.has(u, 'profile_image_url')) return u.profile_image_url
        })

        // tweetImage.log("image")
        userName.assign($userName, "text")
        userHandle.assign($userHandle, "text")
        tweetImage.assign($tweetImage, "attr", "src")

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

        function appendTweet(tweetView) {

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

    function ConversationPreview(conversation) {
        console.log("conversation", conversation)
        var conversationTemplate = Handlebars.compile($("#conversation-template").html())
        convPreview = {peer_id: conversation.peer_id, preview_message: conversation.messages[0]}
        var conversationElement = $(conversationTemplate(convPreview))

        return {
            element: conversationElement
        }
    }

    function ConversationListView(listElement, model, hash, selectedList) {
        var repaint = Bacon.once()
        repaint.map(selectedList).map(render)
        model.allMessages.onValue(function(messages) {
            render(messages)
        })

        function render (conversations) {
            // console.log("render", conversations)
            listElement.children().remove()
            _.each(conversations, addConversation)
        }

        function addConversation (conv) {
            // console.log("conv: ", conv)
            var view = ConversationPreview(conv)
            listElement.prepend(view.element)
        }
    }

    function ChatView(listElement, model, hash) {

    }

    function FilterView(element, hash) {
        hash.onValue(function(hash) {
          element.find("a").each(function() {
            var link = $(this)
            link.toggleClass("selected", link.attr("href") == hash)
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
                newTweet['retweeted_status']['user_id_str'] = tweet['retweeted_status']['id_str'];
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
        function addItem(newItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === newItem.id_str}).concat([newItem]) }}
        function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        function retrieveItem(id) { return function(list) {return _.find(list, function(item){ return item.id_str == id}) }}
        function filterFriendsLists (message) { return _.has(message, 'friends') }
        function filterEvents (message) { return _.has(message, 'event') }

        this.twitterEvents = new Bacon.Bus()
        this.tweets = new Bacon.Bus()
        this.retrieveItem = retrieveItem

        retweetUserInfo = this.tweets.flatMap(function(tweet){
                // Is a retweet
                if (tweet.hasOwnProperty('retweeted_status'))
                    return Bacon.once(_.clone(tweet['retweeted_status']['user']))
                else
                    return Bacon.never();
            })
        tweetUserInfo = this.tweets.map(function(tweet) { return _.clone(tweet['user']) })
        events = this.twitterEvents.filter(filterEvents)
        followUserInfo = events.filter(function (event) { 
                return _.where([event], {'event': 'follow' }) 
            })
            .map(function (follow) { return _.clone(follow['target']) })

        this.userInfo = Bacon.mergeAll([followUserInfo, tweetUserInfo, retweetUserInfo]).map(addItem)
        this.allUsers = this.userInfo.scan([], function(users, f) { return f(users) })
        // this.allUsers.log("user")
    }

    function DMListModel() {
        // Model Direct Messages as a list of dictionaries (conversations), identified by ID of "the other" peer
        // [{peer_id, messages}, ...]
        function addMessage(newMessage) { 
            return function(list) {
                var searchID = isOwnID(newMessage.sender_id_str) ? newMessage.recipient_id_str : newMessage.sender_id_str
                // console.log("search:", searchID)
                
                if ( _.some(list, function (conv) { return conv.peer_id === searchID }) ) {
                    var unchanged = _.reject(list, function(conv){ return conv.peer_id === searchID })
                    var changed = _.map(_.where(list, function(conv){ return conv.peer_id === searchID }), 
                        function(conv) { return {peer_id: conv.peer_id, messages: [newMessage].concat(conv.messages)} })
                    return unchanged.concat(changed)
                }
                else
                    return list.concat([ {peer_id: searchID, messages: [newMessage]} ])
            }
        }
        // function removeItem(deletedItem) { return function(list) { return _.reject(list, function(item) { return item.id_str === deletedItem.delete.status.id_str}) }}
        // function retrieveItem(id) { return function(list) {return _.find(list, function(item){ return item.id_str == id}) }}
        function filterDirectMessages (message) { return _.has(message, 'direct_message') }
        function unwrap (message) { return message.direct_message }

        this.twitterEvents = new Bacon.Bus();
        this.directMessages = this.twitterEvents.filter(filterDirectMessages).map(unwrap).map(addMessage)
        this.allMessages = this.directMessages.scan([], function(messages, f) { return f(messages) })
    }


    function TwitterApp() {
        tweetsModel = new TweetListModel()
        usersModel = new UserListModel()
        messagesModel = new DMListModel()

        var hash = Bacon.UI.hash("#/")
        FilterView($("#filters"), hash)
        var selectedList = hash.decode({
            "#/": tweetsModel.allTweets,
            "#/dm": messagesModel.allMessages,
            "#/users": usersModel.allUsers
        })

        ItemCountView($("#tweet-count"), hash, selectedList)

        hash.onValue(function (h) {
            console.log(h)
            if (h === "#/")
                TweetListView($("#tweet-list"), tweetsModel, usersModel, hash, selectedList)
            else if (h === "#/users")
                UserListView($("#tweet-list"), usersModel, hash, selectedList)
            else if (h === "#/dm")
                // UserListView($("#tweet-list"), usersModel, hash, selectedList)
                ConversationListView($("#tweet-list"), messagesModel, hash, selectedList)
        })
        
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
