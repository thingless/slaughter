/// <reference path="../typings/index.d.ts" />
declare var global:any;
var win:any = window || global;
win['Snap'] = require('snapsvg');
win['$'] = require('jquery');
win['_'] = require('underscore');
win['Backbone'] = require('backbone');
win['THREE'] = require('three');

import {Game, Move} from './models'
import {GameView} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';

function main() {
    var game = new Game()
    game.board = hexops.dumbGen(30);
    var gameView = new GameView({model:game})
    window['game'] = game
    window['gameView'] = gameView;
    window['sim'] = new Simulator(game.board);
    window['Move'] = Move;
    window['hexops'] = hexops;
}

$(document).ready(main)
