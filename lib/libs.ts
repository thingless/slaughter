/// <reference path="../typings/index.d.ts" />
declare var global:any;

var win = self || global || window;
var hasDom = false;
try{
    hasDom = !!window.document;
}catch(err){}

win['$'] = require('jquery');
win['jQuery'] = win['$'];
win['_'] = require('underscore');
win['Backbone'] = require('backbone');
require('bootstrap');
win['THREE'] = require('three');
win['ROT'] = require('./rot');

if(hasDom){
    win['interact'] = require('interact.js');
    win['Snap'] = require('snapsvg');
}
