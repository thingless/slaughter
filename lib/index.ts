/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, StorageEventNetworkProvider, Router} from './network';
import {getQueryVariable} from './util'

export class SlaughterRuntime {
    public simulator:Simulator;
    public network:NetworkProvider;
    public router:Router;
    public game:Game;
    constructor(network:NetworkProvider, game:Game) {
        this.game = game
        this.network = network;
        this.simulator = new Simulator(game.board)
        //this.router = new Router(game, network)
        hexops.annotateTerritories(game.board); //XXX: move
        SlaughterRuntime.instance = this;
    }
    public initBrowser():void{
        setupDraggable();
        new GameView({model:this.game});
    }
    public get board():Board { return this.game.board; }
    public static instance:SlaughterRuntime; //singleton
}

function main() {
    //init game
    var game = new Game()
    game.board = hexops.dumbGen(30);
    //XXX: network stuff
    var runtime = new SlaughterRuntime(null, game)
    runtime.initBrowser();
    window['runtime'] = runtime;
}

$(document).ready(main)
