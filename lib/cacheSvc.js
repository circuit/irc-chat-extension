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

    var _userIdToSessionMap = new Map();       // circuit userId -> irc session
    var _sessionTosessionDataMap = new Map();  // irc session -> session & channel data 

    //*********************************************************************
    //* getSessionItem
    //*********************************************************************
    this.getSessionItem = function getSessionItem(session){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        return sessionData.item;
    };

    //*********************************************************************
    //* setSessionItem - creates new session & cahhenl data for session
    //*********************************************************************
    this.setSessionItem = function setSessionItem(session, item){
        var channels = new Map();
        var sessionData = { item: item, channels: channels };
        _sessionTosessionDataMap.set(session, sessionData);
    };

    //*********************************************************************
    //* clearSession - clears sessionData & userId map
    //*********************************************************************
    this.clearSession = function clearSession (session, userId){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (sessionData){
            sessionData.channels.clear();
            _sessionTosessionDataMap.delete(session); 
        }
        _userIdToSessionMap.delete(userId);
    };

    //*********************************************************************
    //* getChannelItem
    //*********************************************************************
    this.getChannelItem =  function getChannelItem(session, ChannelName){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        var channel = sessionData.channels.get(ChannelName);
        if (!channel){
            return null;
        }
        return channel.item;
    };


    //*********************************************************************
    //* getChannelName
    //*********************************************************************
    this.getChannelName =  function getChannelName(session, channelItemId){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        var channelName = null;
        sessionData.channels.forEach( function (value) {
            if (value.item.itemId === channelItemId){
                channelName = value.channel;
            }
        });
        return channelName;
    };    
    
    //*********************************************************************
    //* setChannelItem
    //*********************************************************************
    this.setChannelItem =  function setChannelItem(session, channelName, item){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        //TODO limit number of channels that can be set
        sessionData.lastJoined = channelName;
        sessionData.channels.set(channelName, {channel: channelName, item: item, time: Date.now() } );
    };

    //*********************************************************************
    //* setLastJoinedChannel
    //*********************************************************************
    this.setLastJoinedChannel = function setLastJoinedChannel(session, channelName){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        session.lastJoined = channelName;
    };    
    
    //*********************************************************************
    //* getLastJoinedChannel
    //*********************************************************************
    this.getLastJoinedChannel = function getLastJoinedChannel(session){
        var sessionData = _sessionTosessionDataMap.get(session);
        if (!sessionData){
            return null;
        }
        return sessionData.lastJoined;
    };

    //*********************************************************************
    //* getSessionWithUserId
    //*********************************************************************
    this.getSessionForUserId =  function getSessionWithUserId(userId){
        return _userIdToSessionMap.get(userId);
    };

    //*********************************************************************
    //* setChannelItem
    //*********************************************************************
    this.setSessionForUserId =  function setSessionForUserId(userId, session){
        return _userIdToSessionMap.set(userId, session);
    };


    //*********************************************************************
    //* dumpClients
    //*********************************************************************
    this.dumpSessions  = function dumpSessions (){
        //TODO rename clients & sessions to ircClients 
        var dump = 'userIds\n';
        _userIdToSessionMap.forEach(function (value, key) {
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
        _sessionTosessionDataMap.forEach(function (value, key) {
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

