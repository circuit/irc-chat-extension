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

// 'use strict';
// /*global console */

var DONE = 4;
var app = document.getElementById('app');

//*********************************************************************
//* dom-change
//*********************************************************************
app.addEventListener('dom-change', function() {
    console.log('DOM is ready');
});

//*********************************************************************
//* WebComponentsReady
//*********************************************************************
window.addEventListener('WebComponentsReady', function() {
    console.log('WebComponentsReady raised');
    var xmlhttp = new XMLHttpRequest();

    xmlhttp.onreadystatechange = function(){
        if (xmlhttp.readyState == DONE && xmlhttp.status == 200) {
            console.log(xmlhttp.responseText);
            var response = JSON.parse(xmlhttp.responseText);
            if (response.data && response.data.length > 0){
                var settings = response.data[0];
                app.email = (settings.email) ? settings.email : app.email;
            }
        }
    };

    xmlhttp.open('GET', 'tenantSettings',true);
    xmlhttp.send();
});

//*********************************************************************
//* onInputChange
//*********************************************************************
app.onInputChange = function (e) {
    console.log(e);
};

//*********************************************************************
//* apply settings
//*********************************************************************
app.apply = function () {
    console.log(app.email);
    console.log(app.password);

    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function(){
        if (xmlhttp.readyState == DONE && xmlhttp.status == 200) {
            console.log(xmlhttp.responseText);
            app.status = xmlhttp.responseText;
        }
    };

    xmlhttp.open('POST', 'tenantSettings?' + 
        'email='   + app.email   + '&' +
        'password='  + app.password,
        true);
    xmlhttp.send();

    app.status = 'waiting for server response';
};