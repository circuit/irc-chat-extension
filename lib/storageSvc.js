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

// AWS sdk for dynamo db access
var AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
var dynamodb = new AWS.DynamoDB();

// dynamo tbl, hash, key, index for tenant settings
var TENANT_SETTINGS_TBL = 'CircuitExtTenantSettings';
var TENANT_SETTINGS_TBL_HASH = 'tenantId';
var TENANT_SETTINGS_TBL_KEY = 'extType';

// dynamo tbl, hash, key, index for user settings
var USER_SETTINGS_TBL = 'CircuitExtUserSettings';
var USER_SETTINGS_TBL_HASH = 'userId';
var USER_SETTINGS_TBL_KEY = 'extType';

var logger = require('./loggerSvc').appLogger;

//*********************************************************************
//* Storage
//*********************************************************************
var StorageSvc = function() {

    if(!( this instanceof StorageSvc)) { 
        return new StorageSvc(); 
    }

    //*********************************************************************
    //* Storage - Public interfaces
    //*********************************************************************
    this.setLogger = function setLogger(storageLogger) {
        logger = storageLogger;
    };

    //*********************************************************************
    //* getBotsByTenantId
    //*********************************************************************
    this.getTenantSettings = function (tenantId, extType) {
        logger.info('[Storage]: getBotsByTenantId', tenantId, extType);
        var keyValues = [
            {key: TENANT_SETTINGS_TBL_HASH, values:[{S: tenantId}]},
            {key: TENANT_SETTINGS_TBL_KEY, values:[{S: extType}]}
        ];
        var query = createQuery(TENANT_SETTINGS_TBL, keyValues);
        return executequery(query);
    };

    //*********************************************************************
    //* putTenantSettings
    //*********************************************************************
    this.putTenantSettings = function (tenantId, extType, settings) {
        logger.info('[Storage]: putTenantSettings', tenantId, extType, settings.email);
        settings.extType = extType;
        return new Promise(function (resolve, reject) {
            var dbFormat = toDbFormat(TENANT_SETTINGS_TBL, settings);
            dynamodb.putItem(dbFormat, function putTenantSettingsCb(err, res) {
                if (err) {
                    logger.error('[Storage]: putTenantSettings error', err, tenantId, extType, settings.email);
                    reject(err);
                    return;
                }
                logger.debug('[Storage]: putTenantSettings success',tenantId, extType, settings.email);
                resolve(res); 
            });
        });
    };

    //*********************************************************************
    //* deleteTenantSettings
    //*********************************************************************
    this.deleteTenantSettings = function  (tenantId, extType) {
        logger.info('[Storage]: deleteTenantSettings', tenantId, extType);
        return new Promise(function (resolve, reject) {
            var params = {
                TableName: TENANT_SETTINGS_TBL,
                key: {
                    tenantId: {'S': tenantId},
                    extType: {'S': extType}
                }
            };
            dynamodb.deleteItem(params, function deleteTenantSettingsCb (err, res) {
                if (err) {
                    logger.error('[Storage]: deleteTenantSettings error', err, tenantId, extType);
                    reject(err);
                    return;
                }
                logger.debug('[Storage]: deleteTenantSettings success',tenantId, extType);
                resolve(res); 
            });
        });
    };

    //*********************************************************************
    //* getUserSettings
    //*********************************************************************
    this.getUserSettings = function getUserSettings(userId, extType) {
        logger.info('[Storage]: getUserSettings', userId, extType);
        var keyValues = [
            {key: USER_SETTINGS_TBL_HASH, values:[{S: userId}]},
            {key: USER_SETTINGS_TBL_KEY,  values:[{S: extType}]}
        ];
        var query = createQuery(USER_SETTINGS_TBL, keyValues);
        return executequery(query);
    };

    //*********************************************************************
    //* putUserSettings
    //*********************************************************************
    this.putUserSettings = function putUserSettings(userId, extType, settings) {
        logger.info('[Storage]: putUserSettings', userId, extType, settings);
        settings.extType = extType;
        return new Promise(function (resolve, reject) {
            var dbFormat = toDbFormat(USER_SETTINGS_TBL, settings);
            dynamodb.putItem(dbFormat, function putUserSettingsCb (err, res) {
                if (err) {
                    logger.error('[Storage]: putUserSettings error', err, userId, extType /*, settings*/);
                    reject(err);
                    return;
                }
                logger.debug('[Storage]: putUserSettings success',userId, extType /*, settings*/);
                resolve(res); 
            });
        });
    };

    //*********************************************************************
    //* deleteUserSettings
    //*********************************************************************
    this.deleteUserSettings = function deleteUserSettings (userId, extType) {
        logger.info('[Storage]: deleteUserSettings', userId, extType);
        return new Promise(function (resolve, reject) {
            var params = {
                TableName: USER_SETTINGS_TBL,
                key: {
                    userId:{'S': userId},
                    extType:{'S': extType}
                }
            };
            dynamodb.deleteItem(params, function deleteUserSettingsCb (err, res) {
                if (err) {
                    logger.error('[Storage]: deleteUserSettings error', err, userId, extType /*, settings*/);
                    reject(err);
                    return;
                }
                logger.debug('[Storage]: deleteUserSettings success',userId, extType /*, settings*/);
                resolve(res); 
            });
        });
    };

    //*********************************************************************
    //* createQuery -- private EQ | LE | LT | GE | GT | BEGINS_WITH | BETWEEN
    //*********************************************************************
    function createQuery(table, keyValues, idx){
        logger.info('[Storage]: createQuery', table, keyValues);
        var  keyConditions = {};
        keyValues.forEach(function (element) {
            keyConditions[element.key] = { ComparisonOperator: 'EQ', AttributeValueList: element.values};
        });

        var query = {
            TableName: table,
            KeyConditions: keyConditions,
            Limit: 100,
            Select: 'ALL_ATTRIBUTES'
        };

        if (idx){
            query.IndexName = idx;
        }

        logger.debug('[Storage]: created query ', JSON.stringify(query));
        return query;
    }

    //*********************************************************************
    //* executequery -- private
    //*********************************************************************
    function executequery(query){
        logger.info('[Storage]: executequery');
        return new Promise(function (resolve, reject) {
            dynamodb.query(query, function executequeryCb(err, data) {
                if (err) {
                    logger.error('[Storage]: dynamo db error', err);
                    reject(err);
                    return;                
                }
                if (!data){
                    logger.error('[Storage]: dynamo db error, no data object', err);
                    reject(err);
                    return;     
                }
                logger.debug('[Storage]: query success');
                var items = toObjFormat(data.Items);
                resolve(items);
            });
        });
    }

    //*********************************************************************
    //* toDbFormat -- private
    //*********************************************************************
    function toDbFormat(tableName, obj) {
        logger.info('[Storage]: toDbFormat', tableName /*, JSON.stringify(obj, null, 2)*/);
        var dbFormat = {
            TableName: tableName,
            Item: {}
        };    
        for (var prop in obj) {
            if ( typeof(prop) === 'function' ){
                continue;
            }
            if (prop) {
                dbFormat.Item[prop] = {S: obj[prop]};
            }
        }
        logger.debug('[Storage]: dbFormat', JSON.stringify(dbFormat,null, 2));
        return dbFormat;
    } 

    //*********************************************************************
    //* toObjFormat -- private
    //*********************************************************************
    function toObjFormat(rows) {
        logger.info('[Storage]: toObjFormat', JSON.stringify(rows, null, 2));
        var obj = [];
        rows.forEach(function (row){
            var objRow = {};
            for (var prop in row) {
                if (row[prop].S) {
                    objRow[prop] = row[prop].S;
                }
                if (row[prop].N){
                    objRow[prop] = row[prop].N;
                }
            }
            obj.push(objRow);
        });
        logger.debug('[Storage]: obj', JSON.stringify(obj, null, 2));
        return obj;
    }
};

// *********************************************************************
// * exports
// *********************************************************************
module.exports = new StorageSvc();



