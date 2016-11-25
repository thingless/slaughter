/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, StorageEventNetworkProvider, Router} from './network';

export class SlaughterRuntime {
    public simulator:Simulator;
    public network:NetworkProvider;
    public router:Router;
    public game:Game;
    constructor(network:NetworkProvider, game:Game) {

    }
    public get board():Board { return this.game.board; }
}

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
