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

var crypto = require('crypto');
var assert = require('assert');

var MIN = -9007199254740991;
var MAX = +9007199254740991;


//*********************************************************************
//* generateUniqueKey
//*********************************************************************
var generateUniqueKey = function() {
    var sha = crypto.createHash('sha256');
    sha.update(Math.random(MIN, MAX).toString() + new Date().getTime());
    var key = sha.digest('hex')
    console.log('[Utils]: generateUniqueKey', key);
    return key;
};

//*********************************************************************
//* promisify
//*********************************************************************
function promisify (callbackBasedApi) { 
    //Casciaro, Mario (2014-12-30). Node.js Design Patterns 
    return function promisified() {
        var args = [].slice.call( arguments); 

        return new Promise( function (resolve, reject) { 
            args.push( function (err, result) {
                if( err) { 
                    return reject( err); 
                } 
                if( arguments.length <= 2) { 
                    resolve( result); 
                } else { 
                    resolve([].slice.call(arguments, 1)); 
                } 
            }); 
            callbackBasedApi.apply( null, args); 
        }); 
    };
};

// *********************************************************************
// * exports
// *********************************************************************
module.exports.generateUniqueKey = generateUniqueKey;
module.exports.promisify = promisify;
