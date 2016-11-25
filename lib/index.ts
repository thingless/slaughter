/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, StorageEventNetworkProvider, Router} from './network';
import {getQueryVariable, guid} from './util'

export class SlaughterRuntime {
    public simulator:Simulator;
    public network:NetworkProvider;
    public router:Router;
    public game:Game;
    constructor(network:NetworkProvider, game:Game) {
        this.game = game
        this.network = network;
        this.simulator = new Simulator(game)
        this.router = new Router(game, network)
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
    var address = getQueryVariable('address') || 'server';
    var gameId = getQueryVariable('gameId') || guid();
    var game = new Game({id:gameId});
    var network = new StorageEventNetworkProvider(address);
    Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
    var runtime = new SlaughterRuntime(network, game);
    if(address === 'server'){
        game.board = hexops.dumbGen(30);
    } else {
        game.fetch()
    }
    runtime.initBrowser();
    window['runtime'] = runtime;
    window['hexops'] = hexops;
}

$(document).ready(main)
