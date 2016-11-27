/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board, Hex} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, WebsocketNetworkProvider, Router} from './network';
import {getQueryVariable, guid, svgToCanvas, int, detectEnv} from './util'

var ENV = detectEnv();
(function normalizeGlobalScope() {
    var self = self || {}
    self.window = self;
    var global = global || {}
    global.window = global
})()

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
    var numberOfTeams = int(getQueryVariable('numberOfTeams'), 2);
    var mapSeed = int(getQueryVariable('seed'), 666);
    var mapSize = int(getQueryVariable('size'), 32);
    var game = new Game({
        id:gameId,
        numberOfTeams:numberOfTeams,
    });
    var network = new WebsocketNetworkProvider(address);
    Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
    var runtime = new SlaughterRuntime(network, game);
    if(address === 'server'){
        hexops.svgGen(mapSize, numberOfTeams, mapSeed).then((board)=>{
            game.board = board;
            runtime.simulator.handleInitialUpkeep();
            if(ENV == 'browser') runtime.initBrowser();
        })
        //game.board = hexops.dumbGen(30);
    } else {
        game.fetch();
        if(ENV == 'browser') runtime.initBrowser();
    }
    window['runtime'] = runtime;
    window['hexops'] = hexops;
    window['Move'] = Move;
    window['svgToCanvas'] = svgToCanvas
}

$(document).ready(main)
