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
/*global require */
'use strict';

var config = require('../conf/config.json');

// node utils
var fs = require('fs');
var https = require('https');

// lib modules
// var extensionUtils = require('./extensionUtils');
var logger = require('./loggerSvc').appLogger;
var storage = require('./storageSvc');
var crypto = require('./cryptoSvc');

// configuration change listeners
var listeners = []; 

// xpress & xpress-session for web session management
var session = require('express-session');
var express = require('express');

// redis to store web session data
var redisUrl = config.redisUrl;
var Redis = require('ioredis');
var redis = new Redis(redisUrl);
var RedisStore = require('connect-redis')(session);
var redisStore = new RedisStore({client: redis});

//*********************************************************************
// ConfigSvc
// 
// This is the configuration application for the irc extension. 
//
// The configuration service serves the URLs configured in the 
// extension manifest
//
// "extensionConfigurationUrl" : "https://host/irc/extension"
//  actions: enabledByUser, disabledByUser
//  actions: enabledByTenant, disabledByTenant, removedByTenant
//
// "tenantConfigurationUrl"    : "https://host/irc/tenant"
// tenant settings
// 
// "userConfigurationUrl"      : "https://host/irc/user"
// user setings
//  
// Other application componenets can register for configuration change 
// notifications using registerListener
// 
//*********************************************************************

//*********************************************************************
//* ConfigSvc
//*********************************************************************
var ConfigSvc = function(){

    if(!( this instanceof ConfigSvc)) { 
        return new ConfigSvc(); 
    }

    var self = this;

    //public
    self.domain = config.domain;

    //private
    var encryptedBotEmail = config.encryptedBotEmail;
    var encryptedBotPassword = config.encryptedBotPassword;

    //*********************************************************************
    //* getCredentials
    //*********************************************************************
    this.getCredentials = function getCredentials(){
        return new Promise( function (resolve, reject){
            var credentials = {};
            crypto.decrypt(encryptedBotEmail)
            .then(function (result){
                credentials.email = result;
                return crypto.decrypt(encryptedBotPassword);
            })
            .then(function (result){
                credentials.password = result;
                resolve(credentials);
            })
            .catch(function (err) {
                logger.error('[Config]: getCredentials failed', err);
            });
        });
    };

    //*********************************************************************
    //* registerListener - for config changes
    //*********************************************************************
    this.registerListener = function registerListener(listener){
        logger.info('[config]: registerListener');
        if (typeof(listener) !== 'function'){
            logger.warn('[config]: trying to register a listener that is not a function');
            return listeners.length;
        }
        listeners.push(listener);
        return listeners.length;
    };

    //*********************************************************************
    //* unregisterListener - for config changes
    //*********************************************************************
    this.unRegisterListener = function unRegisterListener(listener){
        logger.info('[config]: unRegisterListener');
        if (typeof(listener) !== 'function'){
            logger.warn('[config]: trying to unregister a listener that is not a function');
            return listeners.length;
        }
        var listenerIdx = null;
        listeners.some(function(element, index){
            if (element === listener){
                listenerIdx = index;
                return true;
            }
            return false;
        });
        if (listenerIdx){
            listeners.splice(listenerIdx,1);            
        }
        return listeners.length;
    };

    //*********************************************************************
    //* notifyListeners - notify listeners with evt type and data
    //*********************************************************************
    this.notifyListeners = function notifyListeners(type,data){
        logger.info('[config]: notifyListeners');
        listeners.forEach(function(listener){
             listener(type,data);
        });
    };

    //*********************************************************************
    //* mapping of enpoints defined in manifest.json
    //*********************************************************************
    var PING_EP = '/ping';

    //enable, disable, remove extension
    var IRC_EXTENSION_EP = '/irc/extension';
    var IRC_EXTENSION_PAGE = '/irc/extension.html';

    //tenant settings
    var IRC_TENANT_EP = '/irc/tenant';
    var IRC_TENANT_SETTINGS_PAGE = '/irc/tenant.html';
    var IRC_TENANT_SETTINGS_EP = '/irc/tenantSettings';

    //user settings
    var IRC_USER_EP = '/irc/user';
    var IRC_USER_SETTINGS_PAGE = '/irc/user.html';
    var IRC_USER_SETTINGS_EP = '/irc/userSettings';

    // required parameters table for each request type
    var requiredParameters = new Map();
    requiredParameters.set('enabledByUser',    ['reason', 'extensionId', 'tenantId', 'userId']);
    requiredParameters.set('disabledByUser',   ['reason', 'extensionId', 'tenantId', 'userId']);
    requiredParameters.set('enabledByTenant',  ['reason', 'extensionId', 'tenantId', 'apiKey']);
    requiredParameters.set('disabledByTenant', ['reason', 'extensionId', 'tenantId']);
    requiredParameters.set('removedByTenant',  ['reason', 'extensionId', 'tenantId']);
    requiredParameters.set(IRC_TENANT_EP,      ['extensionId', 'tenantId']);
    requiredParameters.set(IRC_TENANT_SETTINGS_EP, ['email', 'password']);
    requiredParameters.set(IRC_USER_EP,        ['extensionId', 'tenantId', 'userId']);
    requiredParameters.set(IRC_USER_SETTINGS_EP, ['network', 'nick']);

    //*********************************************************************
    //* validateExtensionParameters - check if parameters are present in request
    //*********************************************************************
    function validateParameters(req, parameters){
        var result = req.query;
        parameters.some(function (parameter) {
            if (!req.query[parameter] || req.query[parameter] !== ''){
                logger.warn('[config]: request is missing parameter', parameter);
                result = null;
                return true;            
            }
        });
        return result;
    }

    //*********************************************************************
    //* validateExtensionParameters
    //*********************************************************************
    // check if parameters are present for extension requests
    function validateExtensionParameters(req){
        if (!req.query.reason || req.query.reason !== ''){
            logger.warn('[config]: reason is missing for', req.path);
            return null;            
        }
        var parameters = requiredParameters.get(req.query.reason);
        if (!parameters){
            logger.warn('[config]: reason is unknown', req.query.reason);
            return null;            
        }
        return validateParameters(req, parameters);
    }

    //*********************************************************************
    //* validateRequestParameters
    //*********************************************************************
    // check if path is supported & required parameters are sent
    function validateRequestParameters (req){
        if (req.path === IRC_EXTENSION_EP){
            return validateExtensionParameters(req);
        }
        var parameters = requiredParameters.get(req.path);
        if (!parameters){
            logger.warn('[config]: path is unknow', req.path);
            return null;            
        }
        return validateParameters(req, parameters);
    }

    //*********************************************************************
    //* fullUrl - get full url of request
    //*********************************************************************
    function fullUrl(req){
        return req.protocol + '://' + req.get('host') + req.originalUrl;
    }

    //*********************************************************************
    //* getPing - respond to ping requests
    //*********************************************************************
    function getPing (req,res){
        logger.info('[Config]: GET ', fullUrl(req));
        res.send('pong');
    }

    //*********************************************************************
    //* redirectToPage - redirect to config page
    //*********************************************************************
    function redirectToPage (req, res, page, sessionName) {
        logger.info('[Config]: GET ', fullUrl(req));
        var parameters = validateRequestParameters(req);
        if (!parameters){
            res.send('missing parameters'); //TODO generate error resp
            return;
        }
        //create and save tenant session
        logger.debug('[Config]: session', req.session);

        req.session[sessionName] = parameters;
        req.session.save(function(err) {
            if (err){
                logger.warn('[Config]: cannot save tenant session', err);
                res.send('cannot save session');
                return;
            }
            res.redirect(page);
        });
    }

    //*********************************************************************
    //* servePage - check if session exists before serving a page 
    //*********************************************************************
    function servePage (req, res, name) {
        logger.info('[Config]: GET ', fullUrl(req));
        if (!sessionExists(req, res, name)){
            return; 
        } 
        res.sendFile(req.path, {root: './public'});
    }

    //*********************************************************************
    //* sessionExists - check if web session exists
    //*********************************************************************
    function sessionExists(req, res, name){
        if (!req.session && !req.session[name]){
            logger.warn('[Config]: %s session does not exist', name);
            res.status(200).send('access denied'); //TODO error handling
            return false;
        }
        return true;
    }

    //*********************************************************************
    //* get app name from path - path is /app-name/...
    //*********************************************************************
    function appName(req){
        return req.path.split('/')[1];
    }

    //*********************************************************************
    //* postTenantSettings - store tenant settings
    //*********************************************************************
    function postTenantSettings (req,res) {
        logger.info('[Config]: POST ', fullUrl(req));
        if (!sessionExists(req, res, 'tenant')) {
            return; 
        }
        var parameters = validateRequestParameters(req);
        if (!parameters){
            res.status(200).send('missing required fields');
        }

        var tenantSettings = {
            email: req.query.email,
            password: req.query.password,
            tenantId: req.session.tenant.tenantId,
            extensionId: appName(req) + req.session.tenant.extensionId
        };

        logger.debug('[config]: store botSettings', tenantSettings);
        storage.putBot(tenantSettings.tenantId, tenantSettings.extensionId, tenantSettings)
        .then(function(){
            res.status(200).send('changes have been applied');
            // TODO implement support for multiple tenants
            // meanwhile overwrite the user from the static config file
            self.botUser = tenantSettings.email;
            self.botPassword = tenantSettings.password;
            self.notifyListeners('botSettings', tenantSettings);
        })
        .catch(function(e){
            logger.error('[config]: failed to store botSettings', e, e.stack);
            res.status(200).send('failed to store botSettings', e, e.stack);
        });
    }

    //*********************************************************************
    //* postUserSettings - store user settings
    //*********************************************************************
    function postUserSettings (req,res) {
        logger.info('[Config]: POST ', fullUrl(req));
        if (!sessionExists(req, res, 'user')) {
            return; 
        }
        var parameters = validateRequestParameters(req);
        if (!parameters){
            res.status(200).send('missing required fields');
        }

        var userSettings = {
            network: req.query.network,
            nick: req.query.nick,
            tenantId: req.session.user.tenantId,
            extensionId: appName(req) + req.session.user.extensionId,
            userId: req.session.user.userId
        };

        if (req.query.password && req.query.password !== ''){
            userSettings.password = req.query.password; //TODO cannot store empty fields in dynamo
        }
 
        logger.debug('[config]: store userSettings', userSettings);
        storage.putUserSettings(userSettings.userId, userSettings.extensionId, userSettings)
        .then(function(){
            res.status(200).send('changes have been applied');
        })
        .catch(function(e){
            logger.error('[config]: failed to store userSettings', e, e.stack);
            res.status(200).send('failed to store userSettings', e, e.stack);
        });
    }

    //*********************************************************************
    //* getSessionSecret
    //*********************************************************************
    this.getSessionSecret = function(){
        return crypto.decrypt(config.encryptedSessionSecret);
    }

    //*********************************************************************
    //* start admin server
    //*********************************************************************
    this.start = function start (secret){
        logger.info('[Config]: starting configuration service');
        var app = express();
        var privateKey  = fs.readFileSync(config.sslKey, 'utf8');
        var certificate = fs.readFileSync(config.sslCrt, 'utf8');
        var options = {key: privateKey, cert: certificate};
        var server = https.createServer(options, app);

        //*********************************************************************
        //* tenant and user sessions
        //*********************************************************************
        var genid = crypto.generateUniqueKey;

        var userSessionRoutes = [IRC_USER_EP, IRC_USER_SETTINGS_PAGE, IRC_USER_SETTINGS_EP];
        var tenantSessionRoutes = [IRC_TENANT_EP, IRC_TENANT_SETTINGS_PAGE, IRC_TENANT_SETTINGS_EP];

        app.use(userSessionRoutes, session({
          secret: secret,  // secret used to sign the session cokie
          resave: false,   // forces save to session store event if no changes have been made 
          saveUninitialized: false, // do not save new unmodified sessions
          genid: genid, // generate the session cookie
          store: redisStore,  // use redis store via redisio
          name: 'uid', // wiil be uid or tid for user vs tenant sessions   
          unset: 'destroy',   
          cookie: { 
            secure: true,  //TODO change to secure for prod
            maxAge: 300000  //FOR Testing 5min keys
          }
        }));

        app.use(tenantSessionRoutes, session({
          secret: secret,  // secret used to sign the session cokie
          resave: false,   // forces save to session store event if no changes have been made 
          saveUninitialized: false, // do not save new unmodified sessions
          genid: genid, // generate the session cookie
          store: redisStore,  // use redis store via redisio
          name: 'tid', // wiil be uid or tid for user vs tenant sessions   
          unset: 'destroy',   
          cookie: { 
            secure: true,  //TODO change to secure for prod
            maxAge: 1800000
          }
        }));

        //*********************************************************************
        //* /ping
        //*********************************************************************
        app.get(PING_EP, function (req, res) {
            getPing(req, res);
        });

        //*********************************************************************
        //* /user - entry point from circuit user settings
        //*********************************************************************
        app.get(IRC_USER_EP, function (req, res) {
            redirectToPage(req, res, IRC_USER_SETTINGS_PAGE, 'user');
        });

        //*********************************************************************
        //* /user.html - redirection from /user after session is established
        //*********************************************************************
        app.get(IRC_USER_SETTINGS_PAGE, function (req, res) {
            servePage(req, res, 'user');
        });

        //*********************************************************************
        //* /userSettings - ajax post to set user data
        //*********************************************************************
        app.post(IRC_USER_SETTINGS_EP, function (req, res) {
            postUserSettings(req, res);
        });        

        //*********************************************************************
        //* /bot - entry point from circuit admin settings
        //*********************************************************************
        app.get(IRC_TENANT_EP, function (req, res) {
            redirectToPage(req, res, IRC_TENANT_SETTINGS_PAGE, 'tenant');
        });

        //*********************************************************************
        //* /bot.html - redirection from /admin after session is established
        //*********************************************************************
        app.get(IRC_TENANT_SETTINGS_PAGE, function (req, res) {
            servePage(req, res, 'tenant');
        });

        //*********************************************************************
        //* /bot - - ajax post to set admin data
        //*********************************************************************
        app.post(IRC_TENANT_SETTINGS_EP, function (req, res) {
            postTenantSettings(req, res);
         });

        //*********************************************************************
        //* IRC_EXTENSION_EP - entry point from circuit when enabling the extension
        //*********************************************************************
        app.get(IRC_EXTENSION_EP, function (req, res) {
            // TODO check session
            var parameters = validateRequestParameters(req);
            if (!parameters){
                res.send('missing parameters'); //TODO generate error resp
                return;
            }

            if (parameters.reason === 'enabledByUser'){
                self.notifyListeners('enabledByUser', parameters);
            }

            // TODO generate page for action parameters.reason
            res.redirect(IRC_EXTENSION_PAGE);
        });

        //*********************************************************************
        //* enable.html - redirection from /enable with reason enable
        //*********************************************************************
        app.get(IRC_EXTENSION_PAGE, function (req, res) {
            res.sendFile(req.path, {root: './public'});
            // TODO implement support for multiple tenants
        });

        //*********************************************************************
        //* serve static files (polymer, paper, ...)
        //*********************************************************************
        app.use(express.static('public'));

        //*********************************************************************
        //* start the server
        //*********************************************************************
        server.listen(config.configSvcPort, function () {
            logger.info('[Config]: Management app listening at https://%s:%s', 
                server.address().address, 
                server.address().port);
        });

    };

};

//*********************************************************************
//* exports
//*********************************************************************
var configSvc = new ConfigSvc();

configSvc.getSessionSecret()
.then(configSvc.start)
.catch(function (error) {
    logger.error('[Config]: failed for start config service', err);
});

module.exports = configSvc;


