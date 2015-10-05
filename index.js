/*
    Copyright (c) 2015 Unify Inc.

    Permission is hereby granted, free of charge, to any person obtaining
    a copy of this software and associated documentation files (the "Software"),
    to deal in the Software without restriction, including without limitation
    the rights to use, copy, modify, merge, publish, distribute, sublicense,
    and/or sell copies of the Software, and to permit persons to whom the Software
    is furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
    EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
    OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
    CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
    OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/*jshint node:true */
/*global require, Promise */
'use strict';

// node utils
var util = require('util');
var assert = require('assert');
var fs = require('fs');

// dependencies
var htmlToText = require('html-to-text');
var irc = require('irc');

// load services
var logger = require('./lib/loggerSvc').appLogger;
var sdkLogger = require('./lib/loggerSvc').sdkLogger;
var cache = require('./lib/cacheSvc');
var storage = require('./lib/storageSvc');
var config = require('./lib/configSvc');
var crypto = require('./lib/cryptoSvc');

// Circuit SDK    
var Circuit = require('circuit');
Circuit.setLogger(sdkLogger);

/*********************************************************************
IrcBot

this is the main application that manages interactions between a
circuit user and the irc bot.

the circuit user and the irc bot communicate through a direct conversation
that the irc bot initiates when the circuit user enables the irc chat client 
through the circuit settings interface

once enabled the user can can send commands to the bot and irc bot
will execute these commands
 
an irc session is created when a user logs on
an irc channel is created when a user joins a channel

irc sessions and irc channels for a user are stored in transient cache storage
managed by ./lib/cacheSvc

persistent storage for user and bot settings are stored in persistent storage
by ./lib/storageSvc

implementations of cacheSvc & storageSvc to use different storage engines

the default implementation uses EC2 dynamoDB for persistent storage and a
local cache for transient data

a circuit user or circuit tenant administrator can configure the bot
through the web interface provided by ./lib/configSvc

the nomenclature used in irc bot is
command -> the command sent by the user /help /logon /join /leave /logoff /list
session -> the irc session created when a user logs on
channel -> the irc channel a user joins
bot     -> the circuit SDK client for the IrcBot 

*********************************************************************/

//*********************************************************************
//* IrcBot
//*********************************************************************
var IrcBot = function(){

    var self = this;
    var bot = null;             // circuit SDK client for the bot
    var botUserId = null;       // circuit userId of bit user
    var commands = new Map();   // maps bot commands to functions executing commands

    var SESSION_EXISTS_TEXT = 'logon session exists';
    var NEW_SESSION_TEXT = 'loggin in ...';
    var IRC_REGISTERED_TEXT = 'logged in';
    var JOIN_USAGE_TEXT = 'use /join channel';
    var LOGON_FIRST_TEXT = 'please login before joining a channel';
    var NEW_JOIN_TEXT = 'joining ...';
    var PLEASE_CONFIGURE_EXTENSION_TEXT = 'please configure the extension in settings under the extensions tab';
    var LEAVE_FROM_CHANNEL_THREAD_TEXT = 'please leave a channel from the channel thread';
    var SEND_FROM_CHANNEL_THREAD_TEXT = 'please send a message from a channel thread';
    var LEFT_CHANNEL_TEXT = 'left channel ';
    var LEFT_SESSION_TEXT = 'logged off';
    var USER_SETTINGS_ERROR_TEXT = 'error: could not read user settings';
    var HELP_TEXT = fs.readFileSync('./conf/help.txt', 'utf8');
    var CHANNEL_LIST_TEXT = fs.readFileSync('./conf/channelList.txt', 'utf8');

    //*********************************************************************
    //* start IrcBot
    //*********************************************************************
    this.start = function start(){
        logger.info('[APP]: start');
        logger.debug('[APP]: create a circuit client for the bot');
        bot = new Circuit.Client({domain: config.circuitDomain});
        self.addEventListeners(bot);
        return config.getCredentials()
        .then(self.logonBot);
    };

    //*********************************************************************
    //* logon to circuit
    //*********************************************************************
    this.logonBot = function logonBot(credentials){
        return new Promise ( function (resolve, reject) {
            logger.info('[APP]: logonBot', credentials.email);
            bot.authenticate(credentials)
            .then(function loggedOn() {
                logger.debug('[APP]: loggedOn', credentials.email);
                logger.debug('[APP]: getLoggedOnUser');
                return bot.getLoggedOnUser();
            })
            .then(function loggedOnUser(user){
                logger.debug('[APP]: loggedOnUser', user);
                botUserId = user.userId;
            })
            .catch(reject);
        });
    };

    //*********************************************************************
    //* addEventListeners to circuit bot client 
    //*********************************************************************
    this.addEventListeners = function addEventListeners(client){
        logger.info('[APP]: addEventListeners');

        client.addEventListener('connectionStateChanged', function (evt) {
            self.logEvent(evt);
            if (evt.state === 'Disconnected'){
                logger.info('[APP]: logon after receiving a disconnect');
                config.getCredentials()
                .then(self.logonBot)
                .catch (function (err) {
                    logger.error('[APP]: failed to logon after disconnect', err);
                });
            }    
        });

        client.addEventListener('registrationStateChanged', function (evt) {
            self.logEvent(evt);
        });
        client.addEventListener('reconnectFailed', function (evt) {
            self.logEvent(evt);
        });
        client.addEventListener('itemAdded', function (evt) {
            self.logEvent(evt);
            self.processItem(evt.item);            
        });
        client.addEventListener('itemUpdated', function (evt) {
            self.logEvent(evt);
        });
    };

    //*********************************************************************
    //* logEvent from circuit
    //*********************************************************************
    this.logEvent = function logEvent(evt){
        logger.info('[APP]: Circuit event', evt.type);
        logger.debug('[APP]:', util.inspect(evt, { showHidden: true, depth: null }));
    };

    //*********************************************************************
    //* isCommand checks if event from circuit is a command
    //*********************************************************************
    this.isCommand = function isCommand(text){
        logger.info('[APP]: isCommand', text);
        var pattern = /^\s*\/([\w]+)\s*/;
        logger.debug('[APP]: pattern', pattern);
        var matches = text.match(pattern);
        var command = null;
        if (matches){
            logger.debug('[APP]: recognized', matches[1]);
            command = commands.get(matches[1]);
        }
        return command;
     };
  
    //*********************************************************************
    //* processItem - proceses text item received from circuit
    //*********************************************************************
    this.processItem = function (item) {
        logger.info('[APP]: processItem', item.itemId);
        if (item.type !== 'TEXT' || self.sentByMe(item)) {
            logger.debug('[APP]: skip it is not text or I sent it');
            return;
        }
        if (!item.text || !item.text.content) {
            logger.debug('[APP]: skip it does not have text');
            return;
        }
        var text = htmlToText.fromString(item.text.content);
        var command = self.isCommand(text);
        if (command) {
            command(item, text);
        }

        //to support sending without entering a /send command in circuit
        if (self.isMessageFromChannelThread(item)){
            self.send(item);
        }
    };

    //*********************************************************************
    //* isMessageFromChannelThread
    //*********************************************************************
    // helper to check if a received text item from circuit should be sent
    // to an irc channel (without a /send command)
    // If the received item is from a user with an irc session and
    // - that session joined a channel
    // - the circuit user posted the item to the channel thread
    // the posted circuit item can be sent to the irc channel
    this.isMessageFromChannelThread = function (item) {
        //to support sending an irc message without entering a /send command
        if (!item.parentItemId){
            return false;  // item has not been posted in a thread
        }
        var session = cache.getSessionForUserId(item.creatorId);
        if (!session){
            return false; // there is no irc session for this thread
        } 
        if (cache.getChannelName(session, item.parentItemId)){
            return true; // there is an active channel for this thread
        }  
        return false;
    };

    //*********************************************************************
    //* respondToTextItem - repsond (comment) to a circuit conversion item
    //*********************************************************************
    this.respondToTextItem = function respondToTextItem(item, text){
        logger.info('[APP]: respondToTextItem', item.itemId, text);
        var response = { 
            convId: item.convId, 
            parentId: (item.parentItemId) ? item.parentItemId : item.itemId, 
            content: text
        };
        bot.addTextItem(item.convId, response)
        .then(function postedResponse(){
            logger.debug('[APP]: postedResponse', response.state);
        })
        .catch(function respondError(e){
            logger.warn('[APP]: respondError',e);
        });
    };

    //*********************************************************************
    //* addTextItem - post a new circuit conversation item
    //*********************************************************************
    this.addTextItem = function addTextItem(convId, subject, text){
        logger.info('[APP]: addTextItem', convId, subject, text);
        return new Promise (function (resolve, reject) {
            var message = { 
                convId: convId, 
                subject: subject,
                content: text
            };
            bot.addTextItem(convId, message)
            .then(function postedMessage(item){
                logger.debug('[APP]: postedMessage', message.content);
                return resolve(item);
            })
            .catch(reject);
        });
    };


    //*********************************************************************
    //* sentByMe - check if the received circuit event was sent by me
    //*********************************************************************
    this.sentByMe = function sentByMe (item){
        return (botUserId === item.creatorId);
    };   

    //*********************************************************************
    //* postIrcMessageToCircuit - post received irc message to circuit
    //*********************************************************************
    this.postIrcMessageToCircuit = function postIrcMessageToCircuit(session, channel, from, message){
        logger.info('[APP]: postIrcMessageToCircuit', channel, from, message);
        var item = cache.getChannelItem(session, channel);
        if (!item){
            logger.warn('[APP]: channel item not found in cache for session', session.opt.nick, channel);
            return;
        }
        self.respondToTextItem(item, from + ' : ' + message);
    };

    //*********************************************************************
    //* createSession - creates an irc session for a user
    //*********************************************************************
    this.createSession = function createSession (server, nick, options) {
        logger.info('[APP]: createSession', server, nick, options);

        // create an irc session
        var session = new irc.Client(server, nick, options); 

        // add listeners http://node-irc.readthedocs.org/en/latest/API.html#events
        session.addListener('message', function (from, to, message) {
            logger.info('[APP]: message', from, ' => ', to, ': ', message);
            self.postIrcMessageToCircuit(this, to.toLowerCase(), from , message); // to is the channel
        });

        session.addListener('message#channel', function (from, to, message) {
            logger.info('[APP]: message#channel', from, ' => ', to, ': ', message);
            self.postIrcMessageToCircuit(this, to.toLowerCase(), from , message); // to is the channel
        });

        session.addListener('join', function(channel, who) {
            logger.info('[APP]: ' + who + ' => joined ');
            if (who === this.opt.nick){
                logger.debug('[APP]: it\'s me, lookup last joined channel in cache');
                var lastJoinedChannel = cache.getLastJoinedChannel(this);
                if (!lastJoinedChannel){
                    logger.warn('[APP]: lastJoinedChannel not found in cache', this.opt.nick);
                    return;
                }
                logger.debug('[APP]: found lastJoinedChannel in cache', lastJoinedChannel);
                self.postIrcMessageToCircuit(this, lastJoinedChannel, who, 'joined');                
            }
        });

        session.addListener('error', function(message) {
            logger.error('[APP]: error', message);
        });

        session.addListener('registered', function(message) {
            logger.info('[APP]: registered: ', message);
            var item = cache.getSessionItem(this);
            if (!item){
                logger.warn('[APP]: could not find item for session in cache');
                return;
            }
            var text = (message.args && message.args.length >= 1) ?
                message.args[1] : IRC_REGISTERED_TEXT;
            self.respondToTextItem(item, text);
        });

        session.addListener('motd', function(motd) {
            logger.info('[APP]: received motd: ', motd);
            var item = cache.getSessionItem(this);
            if (!item){
                logger.warn('[APP]: could not find item for session in cache');
                return;
            }
            self.respondToTextItem(item, motd);
        });

        return session;
    };  

    //*********************************************************************
    //* sendWelcomeMessage 
    //*********************************************************************
    // message send by bot to user when user enables circuit extension
    this.sendWelcomeMessage = function sendWelcomeMessage(userId){
        logger.info('[APP]: sendWelcomeMessage',userId);
        bot.getDirectConversationWithUser(userId)
        .then( function checkIfConversationExists (conversation) {
            logger.info('[APP]: checkIfConversationExists',conversation);
            if (conversation){
                logger.info('[APP] conversation exists', conversation.convId);
                return Promise.resolve(conversation);
            } else {
                logger.info('[APP]: conversation does not exist, create new conversation');
                return bot.createDirectConversation(userId);
            }    
        })
        .then (function addTextItemToConversation (conversation){
            logger.info('[APP] addTextItemToConversation ', conversation.convId, 'help text');
            bot.addTextItem(conversation.convId, HELP_TEXT);
        })
        .catch(function (err) {
            logger.error(err);
        });
    };

    //*********************************************************************
    //* help command - display help
    //*********************************************************************
    this.help = function help(item){
        logger.info('[APP]: help', item.itemId);
        self.respondToTextItem(item, HELP_TEXT);
    };

    //*********************************************************************
    //* logon command - logon to IRC network configured in user settings 
    //*********************************************************************
    this.logon = function logon (item){
        logger.info('[APP]: logon');

        var session = cache.getSessionForUserId(item.creatorId);
        if (session){
            logger.debug('[APP]: found session for userId in cache', item.creatorId, session.opt.nick);
            self.respondToTextItem(item, SESSION_EXISTS_TEXT);
            return;
        }

        var userSettings = null;
        logger.debug('[APP]: try to find user settings in db for ', item.creatorId, 'irc');
        storage.getUserSettings(item.creatorId, 'irc')
        .then(function(settings){
            logger.debug('[APP]: got response from DB');
            if (settings.lentgh === 0){
                logger.debug('[APP]:  settings not found in DB', settings);
                self.respondToTextItem(item, PLEASE_CONFIGURE_EXTENSION_TEXT);
                return;
            }
            userSettings = settings[0];
            logger.debug('[APP]: decrypt password');
            return crypto.decrypt(userSettings.encryptedPassword);
        })
        .then(function(password){
            logger.info('[APP]: creating irc session', userSettings.network, userSettings.nick);
            var session = self.createSession(
                userSettings.network, 
                userSettings.nick, 
                {sasl: true, userName: 'user', password: password}); 

            logger.debug('[APP]: add irc session to cache for userId', item.creatorId, session.opt.nick);
            cache.setSessionForUserId(item.creatorId, session);

            logger.debug('[APP]: add conv item to cache for session', session.opt.nick, item.creatorId);
            cache.setSessionItem(session, item);

            self.respondToTextItem(item, NEW_SESSION_TEXT);
            return;            
        })
        .catch(function(e){
            logger.error('[APP]: could not get user settings', e, item.creatorId);
            self.respondToTextItem(item, USER_SETTINGS_ERROR_TEXT);
            return;
        });
    };

    //*********************************************************************
    //* join command - join an irc channel
    //*********************************************************************
    this.join = function join(item, text){
        logger.info('[APP]: join');

        // match /join channel
        var pattern = /^\s*\/([\w]+)\s+([\+\-#\w\.]+)\s*/;
        logger.debug('[APP]: pattern', pattern);
        logger.debug('[APP]: text', text);

        var matches = text.match(pattern);
        logger.debug('[APP]: matches', matches);
        if (!matches){
            self.respondToTextItem(item, JOIN_USAGE_TEXT);
            return;
        }

        logger.debug('[APP]: lookup session in cache with itemId ', matches[2]);
        var session = cache.getSessionForUserId(item.creatorId);
        if (!session){
            self.respondToTextItem(item, LOGON_FIRST_TEXT);
            return;
        }

        assert(matches.length >= 3,'[APP]: join parameter error');
        logger.info('[APP]: joining chanel ', matches[2]);
        session.join(matches[2]);
        logger.debug('[APP]: initiated join on', matches[2]);
        self.addTextItem(item.convId, matches[2], NEW_JOIN_TEXT)
        .then(function(channelItem){
            logger.debug('[APP]: setChannelItem in cache for session', matches[2], channelItem.itemId);
            cache.setChannelItem(session, matches[2], channelItem);
        })
        .catch(function sendError(e){
            logger.error('[APP]: could not send join text', e);
        });
    };

    //*********************************************************************
    //* leave command - leave an irc channel
    //*********************************************************************
    this.leave = function leave(item){
        logger.info('[APP]: leave', item.itemId);

        logger.debug('[APP]: lookup session in cache with itemId ', item.creatorId);
        var session = cache.getSessionForUserId(item.creatorId);
        if (!session){
            self.respondToTextItem(item, LOGON_FIRST_TEXT);
            return;
        }

        if (!item.parentItemId){
            self.respondToTextItem(item, LEAVE_FROM_CHANNEL_THREAD_TEXT);
            return;   
        }

        logger.debug('[APP]: lookup channelName in cache with parent itemId ', session.nick, item.parentItemId);
        var channelName = cache.getChannelName(session, item.parentItemId);        
        if (channelName){
            logger.debug('[APP]: found channelName in cache:', channelName, ', invoke part');
            session.part(channelName,function(result){
                logger.debug('[APP]: session.part result',result);
                self.respondToTextItem(item, LEFT_CHANNEL_TEXT + channelName);
            });
        }
    };    

    //*********************************************************************
    //* send - logoff from the irc session
    //*********************************************************************
    this.logoff = function logoff(item){
        logger.info('[APP]: logoff', item.itemId);

        // check if irc session exists for user
        logger.debug('[APP]: lookup session in cache with itemId ', item.creatorId);
        var session = cache.getSessionForUserId(item.creatorId);
        if (!session){
            self.respondToTextItem(item, LOGON_FIRST_TEXT);
            return;
        }

        session.disconnect(function(result){
            logger.debug('[APP]: session.disconnect result',result);
            self.respondToTextItem(item, LEFT_SESSION_TEXT);
            logger.debug('[APP]: cache.clearSession', session.nick, item.creatorId);
            cache.clearSession(session, item.creatorId);
        });
    };

    //*********************************************************************
    //* send - send a message on an irc channel
    //*********************************************************************
    this.send = function send(item){
        logger.info('[APP]: send', item.itemId);

        // check if irc session exists for user
        logger.debug('[APP]: lookup session in cache with itemId ', item.creatorId);
        var session = cache.getSessionForUserId(item.creatorId);
        if (!session){
            self.respondToTextItem(item, LOGON_FIRST_TEXT);
            return;
        }

        if (!item.parentItemId){
            self.respondToTextItem(item, SEND_FROM_CHANNEL_THREAD_TEXT);
            return;   
        }

        logger.debug('[APP]: lookup channelName in cache with parent itemId ', 
            session.nick, item.parentItemId);
        var channelName = cache.getChannelName(session, item.parentItemId);        
        if (channelName){
            logger.debug('[APP]: found channelName in cache:', channelName, ', invoke say');
            session.say(channelName, item.text.content);
        }
    };

    //*********************************************************************
    //* list - list popular irc channels
    //*********************************************************************
    this.list = function list(item){
        logger.info('[APP]: list', item.itemId);
        self.respondToTextItem(item, CHANNEL_LIST_TEXT);
    };  

    //*********************************************************************
    //* IrcBot - register commands with functions 
    //*********************************************************************    
    commands.set('help', this.help);
    commands.set('logon', this.logon);
    commands.set('logoff', this.logoff);
    commands.set('join', this.join);
    commands.set('leave', this.leave);
    commands.set('send', this.send);
    commands.set('list', this.list);

    //*********************************************************************
    //* onTenantSettingsChange
    //*********************************************************************    
    config.on('tenantSettings', function onTenantSettingsChange (tenantSettings){
        // for an account change logout & 
        // sign in again after receiving a disconnect event
        logger.info('[APP]: onTenantSettingsChange', tenantSettings);
        bot.logout();  
    });

    //*********************************************************************
    //* onEnabledByUser 
    //*********************************************************************    
    config.on('enabledByUser', function onEnabledByUser (userSettings){
        logger.info('[APP]: onEnabledByUser', userSettings);
        self.sendWelcomeMessage(userSettings.userId);
    });

};

//*********************************************************************
//* main
//*********************************************************************
var ircBot = new IrcBot();
  
ircBot.start()
.catch (function(e){
    logger.error('[APP]: start error', e);
});


