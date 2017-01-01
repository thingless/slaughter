import {Simulator} from './simulator';
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import {GameView, setupDraggable} from './views'

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
