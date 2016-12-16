/// <reference path="../typings/index.d.ts" />
import {detectEnv} from './util';
declare var global:any;
if(detectEnv() === "browser"){
    var win = window as any;
} else if(detectEnv() === "webworker"){
    var win = self as any;
} else if(detectEnv() === "node"){
    var win = global as any;
}

win['$'] = require('jquery');
win['_'] = require('underscore');
win['Backbone'] = require('backbone');
win['THREE'] = require('three');
win['ROT'] = require('./rot')

if(detectEnv() === "browser"){
    win['interact'] = require('interact.js');
    win['Snap'] = require('snapsvg');
}
