/// <reference path="../typings/index.d.ts" />
self['importScripts']('/libs.js');

import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {getQueryVariable, guid, int, detectEnv} from './util'
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './index';
import {MonteRunner, GreedyMonteNode, MonteNode, MoveGenerator, buildMoveGenerator} from './ai';

var ENV = detectEnv();
declare var global:any;
var win = self || window || global;

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
        runtime.simulator.recomputeCachedState();
        let currentTeam = runtime.game.currentTeam;
        if (currentTeam !== runtime.ourTeam) return; //its not actually our turn
        let territories = runtime.simulator.territories.filter((territory)=>territory.length>1 && territory[0].team == currentTeam)
        let moveGenerator = buildMoveGenerator(runtime.game.board, territories)
        let root = new this.monteNodeClass(-1, moveGenerator)
        let runner = new MonteRunner(root, runtime.simulator)
        runner.runIterations(500);
        runner.getBestMoveSequence()
            .forEach((move)=>runtime.pendingMoves.add(move))
        runtime.sendMovesToServer();
    }
}

export function aimain() {
    console.log("worker starting");
    self.addEventListener("message", function(e) {
        console.log('got message', e.data);
        if (e.data['method'] !== 'connect')  return;
        var serverAddress:string = e.data['data']['serverAddress'];
        if(!serverAddress) throw "ai worker must have server address";
        var team:number = e.data['data']['team'] || null;
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
            runtime.ourTeam = team;
            game.fetch();
            var player = new AiPlayer(runtime, GreedyMonteNode)
            player.takeTurn() //just to make sure its not our turn
        })
    })
}
aimain();
