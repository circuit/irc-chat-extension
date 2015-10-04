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

// node modules
var fs = require('fs');
var https = require('https');
var EventEmitter = require('events');
var util = require('util');

// lib modules
var logger = require('./loggerSvc').appLogger;
var storage = require('./storageSvc');
var crypto = require('./cryptoSvc');

// xpress & xpress-session for web session management
var session = require('express-session');
var express = require('express');

// redis to store web session data
var redisUrl = config.redisUrl;
var Redis = require('ioredis');
var redis = new Redis(redisUrl);
var RedisStore = require('connect-redis')(session);
var redisStore = new RedisStore({client: redis});

/*********************************************************************
ConfigSvc

this is the configuration application for the irc extension. 

the configuration service serves the urls configured in the 
extension manifest

"extensionConfigurationUrl" : "https://host/irc/extension"
 actions: enabledByUser, disabledByUser
 actions: enabledByTenant, disabledByTenant, removedByTenant

"tenantConfigurationUrl"    : "https://host/irc/tenant"
tenant settings

"userConfigurationUrl"      : "https://host/irc/user"
user settings
 
other application components can register for configuration change 
notifications using registerListener

*********************************************************************/

//*********************************************************************
//* ConfigSvc
//*********************************************************************
var ConfigSvc = function(){

    if(!( this instanceof ConfigSvc)) { 
        return new ConfigSvc(); 
    }

    var self = this;
    EventEmitter.call(self);

    //public
    self.circuitDomain = config.domain;

    //private
    var botEmail = config.botEmail;
    var encryptedBotPassword = config.encryptedBotPassword;

    //*********************************************************************
    //* getCredentials
    //*********************************************************************
    this.getCredentials = function getCredentials(){
        return new Promise( function (resolve, reject){
            var credentials = {};
            credentials.email = botEmail;
            crypto.decrypt(encryptedBotPassword)
            .then(function (result){
                credentials.password = result;
                resolve(credentials);
            })
            .catch(function (err) {
                logger.error('[Config]: getCredentials failed', err);
                reject(err);
            });
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
            if (!req.query[parameter] || req.query[parameter] === ''){
                logger.warn('[config]: request is missing parameter', parameter);
                result = null;
            }
        });
        return result;
    }

    //*********************************************************************
    //* validateExtensionParameters
    //*********************************************************************
    // check if parameters are present for extension requests
    function validateExtensionParameters(req){
        if (!req.query.reason || req.query.reason === ''){
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
            res.status(200).send('missing parameters'); 
            return;
        }
        //create and save tenant session
        logger.debug('[Config]: session', req.session);

        req.session[sessionName] = parameters;
        req.session.save(function(err) {
            if (err){
                logger.warn('[Config]: cannot save session', sessionName, err);
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
            res.status(401).send();
            return; 
        }
        var parameters = validateRequestParameters(req);
        if (!parameters){
            res.status(200).send('missing required fields');
            return;
        }

        var tenantSettings = {
            tenantId: req.session.tenant.tenantId,
            extensionId: req.session.tenant.extensionId,
            extType: appName(req),
            email: req.query.email
        };

        logger.debug('[config]: encrypt password');
        crypto.encrypt(req.query.password)
        .then(function(encryptedPassword){
            tenantSettings.encryptedPassword = encryptedPassword;
            logger.debug('[config]: store tenantSettings', tenantSettings);
            return storage.putTenantSettings(
                tenantSettings.tenantId, 
                tenantSettings.extType, 
                tenantSettings);
        })
        .then(function(){
            res.status(200).send('changes have been applied');
            // TODO implement support for multiple tenants
            // meanwhile overwrite the user from the static config file
            self.botEmail = tenantSettings.email;
            self.encryptedBotPassword = tenantSettings.encryptedPassword;

            //notify listeners of configuration change
            self.emit('tenantSettings',tenantSettings);
        })
        .catch(function(err){
            logger.error('[config]: failed to store tenantSettings', err, err.stack);
            res.status(200).send('failed to store tenantSettings');
        });
    }

    //*********************************************************************
    //* getTenantSettings - get tenant settings from storage
    //*********************************************************************
    function getTenantSettings (req,res) {
        logger.info('[Config]: GET ', fullUrl(req));
        if (!sessionExists(req, res, 'tenant')) {
            res.status(401).send();
            return; 
        }
        if (!req.session.tenant.tenantId ||
            !req.session.tenant.extensionId){
            res.status(401).send();
            return false;
        }

        logger.debug('[Config]: session data ', req.session);

        storage.getTenantSettings(req.session.tenant.tenantId, appName(req))
        .then(function (settings){
            if (settings.length > 0) {
                var response = {};
                response.data = settings;
                res.status(200).send(response);
                return;
            }
            res.status(200).send(null);
        })
        .catch(function(err){
            logger.info('[Config]: error cannot get tenant settings from storage ', err);
            res.status(500).send('error: cannot read tenant settings');
        });
    }

    //*********************************************************************
    //* postUserSettings - store user settings
    //*********************************************************************
    function postUserSettings (req,res) {
        logger.info('[Config]: POST ', fullUrl(req));
        if (!sessionExists(req, res, 'user')) {
            res.status(401).send();
            return; 
        }
        var parameters = validateRequestParameters(req);
        if (!parameters){
            res.status(200).send('missing required fields');
            return;
        }

        var userSettings = {
            network: req.query.network,
            nick: req.query.nick,
            tenantId: req.session.user.tenantId,
            extensionId: req.session.user.extensionId,
            userId: req.session.user.userId
        };

        var password = 'NOT_SET';
        if (req.query.password && req.query.password !== ''){
            password = req.query.password;
        }

        crypto.encrypt(req.query.password)
        .then(function(encryptedPassword){
            userSettings.encryptedPassword = encryptedPassword;
            logger.debug('[config]: store userSettings', userSettings);
            return storage.putUserSettings(
                userSettings.userId, appName(req), userSettings);
        })
        .then(function(){
            res.status(200).send('changes have been applied');
        })
        .catch(function(err){
            logger.error('[config]: failed to store userSettings', err, err.stack);
            res.status(200).send('failed to store userSettings');
        });
    }

    //*********************************************************************
    //* getUserSettings - get user settings from storage
    //*********************************************************************
    function getUserSettings (req,res) {
        logger.info('[Config]: GET ', fullUrl(req));
        if (!sessionExists(req, res, 'user')) {
            res.status(401).send();
            return; 
        }
        if (!req.session.user.userId ||
            !req.session.user.extensionId){
            res.status(401).send();
            return;
        }

        logger.debug('[Config]: session data ', req.session);

        storage.getUserSettings(req.session.user.userId, appName(req))
        .then(function (userSettings){
            if (userSettings.length > 0) {
                var response = {};
                response.data = userSettings;
                res.status(200).send(response);
                return;
            }
            res.status(200).send(null);
        })
        .catch(function(err){
            logger.info('[Config]: error cannot get user settings from storage ', err);
            res.status(500).send('error: cannot read user settings');
        });
    }

    //*********************************************************************
    //* getSessionSecret
    //*********************************************************************
    this.getSessionSecret = function(){
        return crypto.decrypt(config.encryptedSessionSecret);
    };

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
        //* IRC_USER_EP - entry point from circuit extension user settings
        //*********************************************************************
        app.get(IRC_USER_EP, function (req, res) {
            redirectToPage(req, res, IRC_USER_SETTINGS_PAGE, 'user');
        });

        //*********************************************************************
        //* IRC_USER_SETTINGS_PAGE - user settings page (after session is established)
        //*********************************************************************
        app.get(IRC_USER_SETTINGS_PAGE, function (req, res) {
            servePage(req, res, 'user');
        });

        //*********************************************************************
        //* IRC_USER_SETTINGS_EP - ajax post to set user data
        //*********************************************************************
        app.post(IRC_USER_SETTINGS_EP, function (req, res) {
            postUserSettings(req, res);
        });        

        //*********************************************************************
        //* IRC_USER_SETTINGS_EP - ajax get to fetch user data
        //*********************************************************************
        app.get(IRC_USER_SETTINGS_EP, function (req, res) {
            getUserSettings(req, res);
        }); 

        //*********************************************************************
        //* IRC_TENANT_EP - entry point from circuit extension tenant settings
        //*********************************************************************
        app.get(IRC_TENANT_EP, function (req, res) {
            redirectToPage(req, res, IRC_TENANT_SETTINGS_PAGE, 'tenant');
        });

        //*********************************************************************
        //* IRC_TENANT_SETTINGS_PAGE - tenant settings page after session is established
        //*********************************************************************
        app.get(IRC_TENANT_SETTINGS_PAGE, function (req, res) {
            servePage(req, res, 'tenant');
        });

        //*********************************************************************
        //* IRC_TENANT_SETTINGS_EP - ajax post to set tenant data
        //*********************************************************************
        app.post(IRC_TENANT_SETTINGS_EP, function (req, res) {
            postTenantSettings(req, res);
         });       

        //*********************************************************************
        //* IRC_TENANT_SETTINGS_EP - ajax get to get tenant data
        //*********************************************************************
        app.get(IRC_TENANT_SETTINGS_EP, function (req, res) {
            getTenantSettings(req, res);
         });  


        //*********************************************************************
        //* IRC_EXTENSION_EP - entry point from circuit when enabling the extension
        //*********************************************************************
        app.get(IRC_EXTENSION_EP, function (req, res) {
            // TODO check session
            var parameters = validateRequestParameters(req);
            if (!parameters){
                res.status(500).send('missing parameters'); //TODO generate error resp
                return;
            }

            if (parameters.reason === 'enabledByUser'){
                //self.notifyListeners('enabledByUser', parameters);
                self.emit('enabledByUser', parameters);
            }

            // TODO generate page for action parameters.reason
            res.redirect(IRC_EXTENSION_PAGE);
        });

        //*********************************************************************
        //* IRC_EXTENSION_PAGE - redirection from IRC_EXTENSION_EP
        //*********************************************************************
        app.get(IRC_EXTENSION_PAGE, function (req, res) {
            res.sendFile(req.path, {root: './public'});
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
//* make ConfigSvc observable
//*********************************************************************
util.inherits( ConfigSvc, EventEmitter);

//*********************************************************************
//* start config service
//*********************************************************************
var configSvc = new ConfigSvc();

configSvc.getSessionSecret()
.then(configSvc.start)
.catch(function (err) {
    logger.error('[Config]: failed for start config service', err);
});

//*********************************************************************
//* exports
//*********************************************************************
module.exports = configSvc;


