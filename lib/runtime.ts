import {Simulator} from './simulator';
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import {GameView, setupDraggable} from './views'

export class SlaughterRuntime {
    public simulator:Simulator;
    public network:NetworkProvider;
    public router:Router;
    public game:Game;
    constructor(network:NetworkProvider, game:Game) {
        this.game = game
        this.network = network;
        this.simulator = new Simulator(game)
        this.router = new Router(network)
        SlaughterRuntime.instance = this;
    }
    public initBrowser():void{
        setupDraggable();
        new GameView({model:this.game});
    }
    public get board():Board { return this.game.board; }
    public get ourTeam():number { return this.game.ourTeam; }
    public static instance:SlaughterRuntime; //singleton
    public sendMovesToServer():void {
        let msg:NetMessage = {
            'from': this.network.address,
            'to': this.network.serverAddress,
            'method': 'submitMoves',
            'data': {'moves': this.game.pendingMoves.toJSON()},
        };
        this.network.send(msg).then((res)=>{
            console.log("Moves submitted");
            this.game.pendingMoves.reset();
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
            return team;
        })
    }
    public startAiWorker(team?:number):Promise<Worker>{
        return Promise.resolve().then(()=>{
            let worker = new Worker('/aiworker.js')
            worker.postMessage({
                method:'connect',
                data:{
                    serverAddress:this.network.serverAddress,
                    team:team || null,
                }
            })
            return worker;
        })
    }
}
