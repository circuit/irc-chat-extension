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

'use strict';
/*global console, resizeWindow, DONE */
var app = document.getElementById('app');

//*********************************************************************
//* dom-change events
//*********************************************************************
app.addEventListener('dom-change', function() {
    console.log('DOM is ready');
    resizeWindow(450, 400); 
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
                app.network = (settings.network) ? settings.network : app.network;
                app.nick = (settings.nick) ? settings.nick : app.nick;
            }
        }
    };

    xmlhttp.open('GET', 'userSettings',true);
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
    console.log(app.network);
    console.log(app.nick);

    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function(){
        if (xmlhttp.readyState == DONE && xmlhttp.status == 200) {
            console.log(xmlhttp.responseText);
            app.status = xmlhttp.responseText;
        }
    };

    xmlhttp.open('POST', 'userSettings?' + 
        'network='   + app.network   + '&' +
        'nick='      + app.nick      + '&' +
        'password='  + app.password,
        true);

    xmlhttp.send();
    app.status = 'waiting for server response';
};
