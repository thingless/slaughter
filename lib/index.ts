/// <reference path="../typings/index.d.ts" />
import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {getQueryVariable, guid, int, detectEnv} from './util'
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';

var ENV = detectEnv();
declare var global:any;
var win = self || window || global;

export class SlaughterRuntime {
    public simulator:Simulator;
    public network:NetworkProvider;
    public router:Router;
    public game:Game;
    public ourTeam:number;
    public pendingMoves:Moves;
    constructor(network:NetworkProvider, game:Game) {
        this.game = game
        this.network = network;
        this.simulator = new Simulator(game)
        this.router = new Router(network)
        this.ourTeam = null;
        this.pendingMoves = new Moves();
        SlaughterRuntime.instance = this;
    }
    public initBrowser():void{
        setupDraggable();
        new GameView({model:this.game});
    }
    public get board():Board { return this.game.board; }
    public static instance:SlaughterRuntime; //singleton
    public sendMovesToServer():void {
        let msg:NetMessage = {
            'from': this.network.address,
            'to': this.network.serverAddress,
            'method': 'submitMoves',
            'data': {'moves': this.pendingMoves.toJSON()},
        };
        this.network.send(msg).then((res)=>{
            console.log("Moves submitted");
            this.pendingMoves.reset();
        });
    }
    public assignTeam(team:number):Promise<number>{
        let network = this.network;
        return network.send({
            'from': network.address,
            'to': network.serverAddress,
            'method': 'assignTeam',
            'data': {'team': team}
        }).then((resp)=>{
            team = resp['data']['team'];
            console.log("Server says that we are team", team);
            return team;
        })
    }
}

export function main() {
    var serverAddress = getQueryVariable('serverAddress') || null;
    var numberOfTeams = int(getQueryVariable('numberOfTeams'), 2);
    var mapSeed = int(getQueryVariable('seed'), 666);
    var mapSize = int(getQueryVariable('size'), 32);
    var render = !!(getQueryVariable('render') || serverAddress);
    var team = int(getQueryVariable('team')) || null;
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
        // We are the server
        if(serverAddress === null) {
            game.set('id', network.address);
            game.board = hexops.mapGen(mapSize, numberOfTeams, mapSeed)
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
        } else {
            // Figure out which team we are
            network.send({'from': network.address, 'to': network.serverAddress, 'method': 'assignTeam', 'data': {'team': team}}).then((resp)=>{
                team = resp['data']['team'];
                console.log("Server says that we are team", team);
                runtime.ourTeam = team;

                // Load the game from the server & render
                game.fetch();
                if(ENV == 'browser')
                    runtime.initBrowser();
            });
        }
        win['runtime'] = runtime;
        win['hexops'] = hexops;
        win['Move'] = Move;
    })
}
win['main'] = main;

if (win.document) {
    $(document).ready(main);
}
