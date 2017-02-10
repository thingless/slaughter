/// <reference path="../typings/index.d.ts" />
import {getGlobal, detectEnv} from './util';
var win = getGlobal();

win['$'] = require('jquery');
win['jQuery'] = win['$']
win['_'] = require('underscore');
win['Backbone'] = require('backbone');
win['THREE'] = require('three');
win['ROT'] = require('./rot')

if(detectEnv() === "browser"){
    require('bootstrap')
    win['interact'] = require('interact.js');
    win['Snap'] = require('snapsvg');
}
