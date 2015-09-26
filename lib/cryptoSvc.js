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

/*

encrypt your secrets with the aws command line

aws kms encrypt \
--key-id "ARN of key" \
--plaintext "This is the secret you want to encrypt" \
--query CiphertextBlob \
--output text > ./encrypted-secret 

use the encrypted secret in your conf files

*/

var AWS = require('aws-sdk');
var kms = new AWS.KMS({region:'us-east-1'});

// configure the ARN of your asw key in config.json
var config = require('../conf/config.json');

//*********************************************************************
//* CryptoSvc
//*********************************************************************
var CryptoSvc = function(){
    if(!( this instanceof CryptoSvc)) { 
        return new ConfigSvc(); 
    }
}

/**
 * decrypt
 * @method decrypt
 * @memberof CryptoSvc
 * @param {secret} base64 encoded secret
 * @returns Promise 
 */
CryptoSvc.prototype.decrypt = function(secret) {
	var params = {
	  CiphertextBlob: new Buffer(secret,'base64')
	};
    return new Promise (function (resolve, reject) {
		kms.decrypt(params, function(err, data) {
			if (err) {
				reject (err);
				return;
			}
			resolve(data.Plaintext.toString());
		});
    });
};

/**
 * encrypt
 * @method encrypt
 * @memberof CryptoSvc
 * @param {text} text to encrypt
 * @returns Promise with base64 encrypted secret
 */
 CryptoSvc.prototype.encrypt = function(text) {
	var params = {
	  KeyId: config.awsKeyARN,
	  Plaintext: text
	};
	return new Promise (function (resolve, reject) {
		kms.encrypt(params, function(err, data) {
			if (err) {
				reject (err);
				return;
			}
			resolve(data.CiphertextBlob.toString('base64'));
		});
	});
};

//*********************************************************************
//* exports
//*********************************************************************
module.exports = new CryptoSvc();

