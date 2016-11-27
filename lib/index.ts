/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board, Hex} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {NetworkProvider, WebsocketNetworkProvider, Router} from './network';
import {getQueryVariable, guid, svgToCanvas, int, detectEnv} from './util'

var ENV = detectEnv();
declare var global:any;
var win = self || window || global;

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

export function main() {
    var serverAddress = getQueryVariable('serverAddress') || null;
    var numberOfTeams = int(getQueryVariable('numberOfTeams'), 2);
    var mapSeed = int(getQueryVariable('seed'), 666);
    var mapSize = int(getQueryVariable('size'), 32);
    var render = !!(getQueryVariable('render') || serverAddress);
    var game = new Game({
        id:serverAddress || guid(),
        numberOfTeams:numberOfTeams,
    });
    var network = new WebsocketNetworkProvider(null);
    network.serverAddress = serverAddress;
    network.networkUp.then(()=>{
        console.log("Network is up");
        Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
        var runtime = new SlaughterRuntime(network, game);
        if(serverAddress === null) {
            game.set('id', network.address);
            hexops.svgGen(mapSize, numberOfTeams, mapSeed).then((board)=>{
                game.board = board;
                runtime.simulator.handleInitialUpkeep();
                if(ENV == 'browser') {
                    if (render) {
                        runtime.initBrowser();
                    }
                    else {
                        document.write("Server Online! <a href='" + location.href + "&serverAddress=" + network.address + "'>Tell your friends!</a>");
                    }
                }
                console.log("Server has generated a map and is online at", network.address);
            })
        } else {
            game.fetch();
            if(ENV == 'browser') runtime.initBrowser();
        }
        win['runtime'] = runtime;
        win['hexops'] = hexops;
        win['Move'] = Move;
        win['svgToCanvas'] = svgToCanvas
    })
}

if (win.document) {
    $(document).ready(main);
}
