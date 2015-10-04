

'use strict';
/*global console, resizeWindow, DONE */

var app = document.getElementById('app');

//*********************************************************************
//* dom-change
//*********************************************************************
app.addEventListener('dom-change', function() {
    console.log('DOM is ready');
    resizeWindow(400, 350); 
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