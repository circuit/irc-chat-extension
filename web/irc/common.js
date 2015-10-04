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
/* exported DONE, resizeWindow */

var DONE = 4;

//*********************************************************************
//* resizeWindow
//*********************************************************************
function resizeWindow(width, height){
    if (navigator.userAgent.toLowerCase().indexOf('chrome') > -1)
        setTimeout(resize, 10, width, height);
    else
        resize(width, height);
}

//*********************************************************************
//* resize
//*********************************************************************
function resize(width, height) {
    var innerWidth = 
      window.innerWidth || 
      document.documentElement.clientWidth || 
      document.body.clientWidth;

    var innerHeight = 
      window.innerHeight || 
      document.documentElement.clientHeight || 
      document.body.clientHeight;

    window.resizeBy(width-innerWidth, height-innerHeight);
}