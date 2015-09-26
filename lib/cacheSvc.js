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
/*global require, Map */
'use strict';

var util = require('util');

// var logger = require('./loggerSvc').appLogger;

//*********************************************************************
//* Cache
//*********************************************************************
var CacheSvc = function() {

    if(!( this instanceof CacheSvc)) { 
        return new CacheSvc(); 
    }

    var _clients = new Map();      // circuit userId -> irc Client
    var _sessions = new Map();     // irc client -> irc session 

    //*********************************************************************
    //* getSessionItem
    //*********************************************************************
    this.getSessionItem = function getSessionItem(client){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        return session.item;
    };

    //*********************************************************************
    //* setSessionItem
    //*********************************************************************
    this.setSessionItem = function setSessionItem(client, item){
        var channels = new Map();
        var session = { item: item, channels: channels };
        _sessions.set(client, session);
    };

    //*********************************************************************
    //* setSessionItem
    //*********************************************************************
    this.clearSession = function clearSession (client, userId){
        console.log(_sessions.delete(client)); //TODO deep delete for channels?
        console.log(_clients.delete(userId));
    };

    //*********************************************************************
    //* getChannelItem
    //*********************************************************************
    this.getChannelItem =  function getChannelItem(client, ChannelName){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        var channel = session.channels.get(ChannelName);
        if (!channel){
            return null;
        }
        return channel.item;
    };


    //*********************************************************************
    //* getChannelName
    //*********************************************************************
    this.getChannelName =  function getChannelName(client, ChannelItemId){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        var channelName = null;
        session.channels.forEach( function (value) {
            if (value.item.itemId === ChannelItemId){
                channelName = value.channel;
            }
        });
        return channelName;
    };    
    
    //*********************************************************************
    //* setChannelItem
    //*********************************************************************
    this.setChannelItem =  function setChannelItem(client, channelName, item){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        //TODO limit number of channels that can be set
        session.lastJoined = channelName;
        session.channels.set(channelName, {channel: channelName, item: item, time: Date.now() } );
    };

    //*********************************************************************
    //* setLastJoinedChannel
    //*********************************************************************
    this.setLastJoinedChannel = function setLastJoinedChannel(client, channel){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        session.lastJoined = channel;
    };    
    
    //*********************************************************************
    //* getLastJoinedChannel
    //*********************************************************************
    this.getLastJoinedChannel = function getLastJoinedChannel(client){
        var session = _sessions.get(client);
        if (!session){
            return null;
        }
        return session.lastJoined;
    };

    //*********************************************************************
    //* getSessionWithUserId
    //*********************************************************************
    this.getSessionForUserId =  function getSessionWithUserId(userId){
        return _clients.get(userId);
    };

    //*********************************************************************
    //* setChannelItem
    //*********************************************************************
    this.setSessionForUserId =  function setSessionForUserId(userId, session){
        return _clients.set(userId, session);
    };


    //*********************************************************************
    //* dumpClients
    //*********************************************************************
    this.dumpClients  = function dumpClients (){
        //TODO rename clients & sessions to ircClients 
        var dump = 'userIds\n';
        _clients.forEach(function (value, key) {
            dump += key + ' -> ' + value.nick + '\n';
        });
        return dump;
    };

    //*********************************************************************
    //* dumpChannels
    //*********************************************************************
    this.dumpChannels = function dumpChannels (){
        //TODO rename clients & sessions to ircClients 
        var dump = 'sessions\n';
        _sessions.forEach(function (value, key) {
            dump += '\n' + key.nick + ' -> ' + value.item + ', ' + value.lastJoined + '\n';
            value.channels.forEach(function (channelValue, channelKey){
                dump += channelKey + '->' + util.inspect(channelValue, false, null) + '\n';
            });
        });
        return dump;
    };
};

// *********************************************************************
// * exports
// *********************************************************************
module.exports = new CacheSvc();

