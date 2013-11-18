(function() {
    this.TwitterViews = {};

    TwitterViews.RenderEntities = function (tweet) {
        // console.debug(tweet)
        var newTweet = _.clone(tweet)
        newTweet = _.reduce(tweet.entities.urls, function(tweet, url) { return renderURL(tweet, url) }, newTweet)
        newTweet = _.reduce(tweet.entities.user_mentions, function(tweet, mention) { return renderUserMentions(tweet, mention) }, newTweet)
        newTweet = _.reduce(tweet.entities.hashtags, function(tweet, hash) { return renderHash(tweet, hash) }, newTweet)
        newTweet = _.reduce(tweet.entities.media, function(tweet, media) { return renderMedia(tweet, media) }, newTweet)
        return newTweet;
    
        function renderURL(tweet, url) {
            return _.extend(_.clone(tweet), 
                {text: tweet.text.replace(url.url, "<a href='"+url.expanded_url+"'>"+url.display_url+"</a>")})
        }

        function renderMedia(tweet, media) {
            return _.extend(_.clone(tweet), 
                {text: tweet.text.replace(media.url, "<a href='"+media.media_url_https+"'>"+media.display_url+"</a>")})
        }

        function renderHash(tweet, hash) {
             return _.extend(_.clone(tweet), 
                {text: tweet.text.replace("#"+hash.text, "<a href='https://twitter.com/search?q=%23"+hash.text+"&src=hash'>#"+hash.text+"</a>")})
        }

        function renderUserMentions(tweet, user) {
            // Need the damn regexp because twitter is not consistent in the json representation of mentions and in text
            var re = new RegExp("@"+user.screen_name, "gi")
            return _.extend(_.clone(tweet), 
                {text: tweet.text.replace(re, "<a href='https://twitter.com/"+user.screen_name+"'>@"+user.screen_name+"</a>")})
        }
    }

    function renderAll(allTweets) {
        // return allTweets;
        return _.map(allTweets, TwitterViews.RenderEntities);
    }

    // ViewModel for the TweetsList
    // merges together information from the tweets list and user list
    TwitterViews.TweetsListViewModel = function (tweetsModel, usersModel){
        function updateUser(allTweets, allUsers) {
            function findUser(tweet) {
                //FIXME: should use "find" to return a single item, but find does not work
                var user = _.where(allUsers, {'id_str': tweet.user_id_str})[0]
                return _.extend(tweet, {user: user});
            }
            return _.map(allTweets, findUser);
        }
        var viewModel = Bacon.combineWith(updateUser, tweetsModel.allTweets.map(renderAll), usersModel.allUsers);
        // viewModel.log("View Model");
        return viewModel;
    }

    // this.TwitterViews.ChatView = function ChatView(listElement, chatElement, model, usersModel, hash) {
    //     var repaint = model.showConversation
    //     repaint.onValue(selectConversation)
    //     hash.onValue(function(){ chatElement.addClass("invisible") })

    //     function selectConversation(conversation) {
    //         console.log("conversation", conversation)    
    //         render(conversation.conversation, conversation.peer_id)
    //         model.messageReceived.takeUntil(repaint).filter(
    //             function(message){
    //                 // console.log(message, conversation, _.first(conversation), _.first) 
    //                 return message.peer_id === conversation.peer_id 
    //             }).onValue(addMessage)
    //     }

    //     function render (messages, peer_id) {
    //         console.log("Render messages:", messages)
    //         listElement.children().remove()
    //         chatElement.removeClass("invisible")
    //         chatElement.find('#chat-form [name="peer_id"]').val(peer_id)

    //         _.each(messages, addMessage)

    //         // Inject a new message into the model upon clicking "send"
    //         var sendMessage = chatElement.find('#chat-send').asEventStream('click').doAction(".preventDefault")
    //         sendMessage.onValue(function(){
    //             console.log("sendMessage value", chatElement.find('#chat-form [name="peer_id"]').val())
    //             model.sendMessages.plug(Bacon.once({
    //                 text: chatElement.find('#chat-form [name="message-content"]').val(),
    //                 peer_id: chatElement.find('#chat-form [name="peer_id"]').val(),
    //                 recipient: { screen_name: chatElement.find('#chat-form [name="peer_id"]').val() },
    //                 sender_screen_name: "AndriusAuc",
    //                 id_str: "0AndriusAuc"
    //             }))                
    //         })
    //     }
}).call(this);