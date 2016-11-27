/// <reference path="../typings/index.d.ts" />
declare var global:any;

(function normalizeGlobalScope() {
    var self = self || {}
    self.window = self;
    var global = global || {}
    global.window = global
})()

global.window = global
window['$'] = require('jquery');
window['_'] = require('underscore');
window['Backbone'] = require('backbone');
window['THREE'] = require('three');
try {
window['interact'] = require('interact.js');
} catch(ex) {}
try {
    window['Snap'] = require('snapsvg');
} catch(ex) {}