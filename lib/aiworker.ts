/// <reference path="../typings/index.d.ts" />
self['importScripts']('/libs.js');

import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import * as hexops from './hexops'
import {Simulator} from './simulator';
import {getQueryVariable, guid, int, detectEnv} from './util'
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './index';
import {getRandomMoves} from './ai'

var ENV = detectEnv();
declare var global:any;
var win = self || window || global;

export function aimain() {
    console.log("worker starting");
    self.addEventListener("message", function(e) {
        console.log('got message', e.data);
        if (e.data['method'] === 'connect') {
            var serverAddress:string = e.data['data']['serverAddress'];
            var team:number = e.data['data']['team'] || null;
            var network = new WebsocketNetworkProvider(null);
            var game = new Game({
                id:serverAddress || guid(),
            });
            network.serverAddress = serverAddress;
            network.networkUp.then(()=>{
                console.log("Network is up");
                Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
                var runtime = new SlaughterRuntime(network, game);
                network.send({'from': network.address, 'to': network.serverAddress, 'method': 'assignTeam', 'data': {'team': team}}).then((resp)=>{
                    team = resp['data']['team'];
                    console.log("Server says that we are team", team);
                    runtime.ourTeam = team;
                    game.fetch();
                    let onChangeTeam = function() {
                        if (game.currentTeam === runtime.ourTeam) {
                            console.log("It's our turn!");

                            // Make one legal move per territory
                            getRandomMoves(game, runtime.ourTeam).forEach((move)=>runtime.pendingMoves.add(move));

                            runtime.sendMovesToServer();
                        }
                    };
                    game.on("change:currentTurn", onChangeTeam);
                    onChangeTeam();
                });
            })

        }
    }, false);
}
aimain();
