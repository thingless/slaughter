/// <reference path="../typings/index.d.ts" />
import {Game} from './models'
import {Dictionary, guid} from './util'

export interface NetMessage {
    data?:any
    path?:string
    method?:string
    to:string
    from?:string
    id?:string
    error?:any
}

//base class for network providers. providers need to implement
// _send and call _onMessage when they receive a message
export abstract class NetworkProvider extends Backbone.Model {
    private _currentId:number
    private pendingMessages:Dictionary<(message:NetMessage)=>void>
    public address:string;
    public serverAddress?:string;
    public networkUp:Promise<boolean>;
    protected _networkUpAccept:any;
    constructor(address:string){
        super()
        this._currentId = 0;
        this.pendingMessages = {};
        this.address = address;
        this.networkUp = new Promise((accept)=>this._networkUpAccept = accept);
    }
    protected _onMessage(message:NetMessage){
        if(this.pendingMessages[message.id]){
            //the message is a response to a message we sent
            this.pendingMessages[message.id](message)
        } else {
            //the message is a new message to me! :)
            console.log('message received', message);
            this.trigger('message', message);
        }
    }
    protected _nextId():string{
        return this.address+'_'+(this._currentId+=1)
    }
    protected abstract _send(message:NetMessage);
    public send(message:NetMessage):Promise<NetMessage> {
        message.from = message.from || this.address;
        message.id = message.id || this._nextId(); //make sure msg has id
        if(!message.to) throw "Message needs to be sent to someone";
        return new Promise<NetMessage>((resolve, reject)=>{
            this.pendingMessages[message.id] = (retMessage)=>{ //register for callback
                console.log('message response', retMessage);
                if(retMessage.error) reject(retMessage);
                else resolve(retMessage);
                delete this.pendingMessages[message.id] //cleanup
            }
            var optionalPromise:Promise<NetMessage> = this._send(message); //start things off
            if(optionalPromise !== undefined)
                optionalPromise.catch(reject);
        })
    }
    public syncReplacement(method: string, model: Backbone.Model, options?: JQueryAjaxSettings) {
        options.context = options.context || options;
        let msg:NetMessage = {
            data: method==="read" ? null : model.toJSON(options),
            path:_.result(model,'url') as string,
            method:method,
            id:this._nextId(),
            from: this.address,
            to:this.serverAddress || this.address,
        }
        model.trigger('request', model, null, options);
        return this.send(msg)
            .then(function(res:NetMessage) {
                if(options.success){
                    options.success(res.data, 'success', null)
                }
            },function(error:any) {
                if(options.error){
                    throw 'not implemented';
                }
            })
    }
}

export class StorageEventNetworkProvider extends NetworkProvider {
    initialize(attributes?: any, options?: any){
        window.addEventListener("storage", this._messageReceive.bind(this), false);
    }
    private _messageReceive(event:StorageEvent){
        if(event.key != this.address.toString()){ return; } //if its not for us ignore it
        let message = JSON.parse(event.newValue);
        this._onMessage(message);
    }
    public _send(message:NetMessage) {
        message['rnd'] = Math.random(); //make sure its not the same as what is already stored in local storage
        let messageStr = JSON.stringify(message);
        console.log('message sent', JSON.parse(messageStr));
        if(message.to == this.address){ //we are sending msg to ourselves and the storage event wont fire
            this._messageReceive({key:message.to, newValue:messageStr} as any)
        } else {
            window.localStorage.setItem(message.to.toString(), messageStr);
        }
    }
}

export class WebsocketNetworkProvider extends NetworkProvider {
    private ws:WebSocket;

    initialize(attributes?: any, options?: any){
        this.address = null;
        // XXX: Set this to wss if we're on https
        this.ws = new WebSocket("ws://" + location.host + "/ws");
        this.ws.addEventListener("message", this._messageReceive.bind(this), false);

        // We need to ask the server to send us our address
        var connectionOpen = ()=>{
            console.log("Asking for our address");
            this.ws.send(JSON.stringify({'method': 'simonWhatsMyAddress'}));
        }
        this.ws.addEventListener("open", connectionOpen, false);
        if(this.ws.readyState === WebSocket.OPEN)
            connectionOpen();
    }

    private _messageReceive(event:MessageEvent){
        var msg:NetMessage = JSON.parse(event.data);
        if(msg.method === 'simonSaysSetYourAddress') {
            // An init message from the server - we have a new address
            console.log("WS server says that we are now user", msg.to);
            this.address = msg.to;
            this._networkUpAccept();
            return;
        }

        if(msg.to !== this.address.toString()) {
            return;
        }

        this._onMessage(msg);
    }

    public _send(message:NetMessage) {
        if (this.address === null) {
            throw "Not yet connected to the server";
        }

        let messageStr = JSON.stringify(message);
        this.ws.send(messageStr);

        // Always reject after 5 seconds, but if it's already resolved this will be ignored
        return new Promise((resolve, reject)=>{
            setTimeout(()=>reject(_.extend({}, message, {"error": "Timeout"})), 5000);
        });
    }
}

export class Router extends Backbone.Model {
    game:Game
    network:NetworkProvider
    constructor(game:Game, network:NetworkProvider){
        super()
        this.game = game
        this.network = network
        this.listenTo(this.network, 'message', this.route)
    }
    public route(message:NetMessage){
        //lookup method
        let method:(message:NetMessage)=>any = {
            'read':this._rpcRead,
            'ping':this._ping,
        }[message.method]
        if(!method){
            console.error("Method not found: "+ message.method, message)
            return; //bail
        }
        //call method & handle result
        Promise.resolve()
            .then(()=>method.call(this, message)) //if we make call inside of promise we get promise error handling
            .then((data)=>this.network.send({
                data:data,
                to:message.from,
                from:this.network.address,
                id:message.id,
            }))
            .catch((reason)=>this.network.send({
                to:message.from,
                from:this.network.address,
                id:message.id,
                error:reason,
            }))
    }
    private _parseModelUrl(message:NetMessage):Backbone.Model|Backbone.Collection<any>{
        let parts = message.path.split(/\//g).filter((p)=>!!p)
        parts.shift() //game prefix
        if(this.game.id != parts[0]){ //validate game id
            console.error("unknown game" + parts[0]);
        }
        parts.shift();
        let model:any = this.game;
        while (parts.length>0) {
            if(model instanceof Backbone.Model){
                model = (model as Backbone.Model).get(parts[0])
            } else if(model instanceof Backbone.Collection){
                model = (model as Backbone.Collection<any>).get(parts[0])
            } else{
                throw "Unknown type in _parseModelUrl";
            }
            if(!model){ return null; }
            parts.shift();
        }
        return model;
    }
    private _rpcRead(message:NetMessage):Promise<any>{
        let model = this._parseModelUrl(message);
        if(!model){ return null; }
        return Promise.resolve(model);
    }
    private _ping(message:NetMessage):Promise<any>{
        return Promise.resolve({'pong':true});
    }
}
