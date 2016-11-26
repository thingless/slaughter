/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board, Hex} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, StorageEventNetworkProvider, Router} from './network';
import {getQueryVariable, guid, svgToCanvas} from './util'

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
    var numberOfTeams = getQueryVariable('numberOfTeams') || 2;
    var mapSeed:number = parseInt(getQueryVariable('mapSeed')) || 666;
    var mapSize:number = parseInt(getQueryVariable('mapSize')) || 32;
    var game = new Game({
        id:gameId,
        numberOfTeams:numberOfTeams,
    });
    var network = new StorageEventNetworkProvider(address);
    Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
    var runtime = new SlaughterRuntime(network, game);
    if(address === 'server'){
        hexops.svgGen(mapSize, mapSeed).then((board)=>{
          game.board = board
          runtime.initBrowser();
        })
        //game.board = hexops.dumbGen(30);
    } else {
        game.fetch()
        runtime.initBrowser();
    }
    window['runtime'] = runtime;
    window['hexops'] = hexops;
    window['Move'] = Move;
    window['svgToCanvas'] = svgToCanvas
}

$(document).ready(main)
