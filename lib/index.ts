/// <reference path="../typings/index.d.ts" />
declare var global:any;
var win:any = window || global;
win['Snap'] = require('snapsvg');
win['$'] = require('jquery');
win['_'] = require('underscore');
win['Backbone'] = require('backbone');

import * as j from './fun'
j.log();
