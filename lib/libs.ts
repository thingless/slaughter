/// <reference path="../typings/index.d.ts" />
import {getGlobal, detectEnv} from './util';
var win = getGlobal();

win['$'] = require('jquery');
win['_'] = require('underscore');
win['Backbone'] = require('backbone');
win['THREE'] = require('three');
win['ROT'] = require('./rot')

if(detectEnv() === "browser"){
    win['interact'] = require('interact.js');
    win['Snap'] = require('snapsvg');
}
