/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';

function main() {
    setupDraggable();
    var game = new Game()
    game.board = hexops.dumbGen(30);
    hexops.annotateTerritories(game.board);
    var gameView = new GameView({model:game})
    window['game'] = game
    window['gameView'] = gameView;
    window['sim'] = new Simulator(game.board);
    window['Move'] = Move;
    window['hexops'] = hexops;
    window['getHex'] = (row, col) => window['sim'].board.get(hexops.locToId(hexops.offsetCoordsToCubic(row, col)));
    window['Tenant'] = Tenant;
}

$(document).ready(main)
