/// <reference path="../typings/index.d.ts" />
import {detectEnv} from './util'
if(detectEnv() === "webworker"){
    self['importScripts']('/libs.js');
} else if (detectEnv() == "node") {
    require('./libs.js');
}

import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {guid, int, getGlobal, getConfigVariable} from './util'
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './runtime'
import {MonteRunner, GreedyMonteNode, LCMonteNode, MonteNode, MoveGenerator, buildMoveGenerator} from './ai';

var ENV = detectEnv();
var global = getGlobal();

export class AiPlayer<T extends MonteNode>{
    public runtime:SlaughterRuntime
    public monteNodeClass:{new(moveIndex:number, moveGenerator:MoveGenerator): T; }
    constructor(runtime:SlaughterRuntime, monteNodeClass:{new(moveIndex:number, moveGenerator:MoveGenerator): T; }){
        this.runtime = runtime
        this.monteNodeClass = monteNodeClass
        this.runtime.simulator.game.on("change:currentTurn", this.takeTurn.bind(this))
        this.takeTurn()
    }
    public takeTurn(){
        let runtime = this.runtime;
        runtime.simulator.fixHouses();
        let currentTeam = runtime.game.currentTeam;
        if (currentTeam !== runtime.ourTeam) return; //its not actually our turn
        let territories = runtime.simulator.territories.filter((territory)=>territory.length>1 && territory[0].team == currentTeam)
        let moveGenerator = buildMoveGenerator(runtime.game.board, territories, null)
        let root = new this.monteNodeClass(-1, moveGenerator)
        let runner = new MonteRunner(root, runtime.simulator)
        runner.runIterations(1500);
        runner.getBestMoveSequence()
            .forEach((move)=>runtime.pendingMoves.add(move))
        runtime.sendMovesToServer();
    }
}

export function aimain() {
    console.log("worker starting");
    var serverAddress:string = getConfigVariable('serverAddress');
    if(!serverAddress) throw "ai worker must have server address";
    var team:number = int(getConfigVariable('team')) || null;
    var network = new WebsocketNetworkProvider(null);
    var game = new Game({id:serverAddress});
    var runtime:SlaughterRuntime = null;
    network.serverAddress = serverAddress;
    network.networkUp.then(()=>{
        console.log("Network is up");
        Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
        runtime = new SlaughterRuntime(network, game);
        return runtime.assignTeam(team)
    }).then((assignedTeam)=>{
        team = assignedTeam;
        console.log("Server says that we are team", team);
        runtime.game.ourTeam = team;
        var player;
        game.fetch().then(()=>{
            player = new AiPlayer(runtime, LCMonteNode)
        })
    })
}

if(detectEnv() === "webworker"){
    self.addEventListener("message", function(e) {
        if (e.data['method'] !== 'connect')  return;
        console.log('got connect message', e.data);
        global['env'] = e.data['data']; //this is where getConfigVariable gets its value
        aimain();
    });
} else {
    aimain();
}
