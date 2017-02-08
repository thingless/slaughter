import {Game, Move, Tenant, Board, Hex, Moves} from './models'
import {GameView, setupDraggable} from './views'
import * as hexops from './hexops'
import {getConfigVariable, guid, int, getGlobal} from './util'
import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './runtime'
import {detectEnv} from './util'

var global:any = getGlobal();

export function main():Promise<SlaughterRuntime> {
    var serverAddress = getConfigVariable('serverAddress') || null;
    var numberOfTeams = int(getConfigVariable('numberOfTeams'), 2);
    var mapSeed = int(getConfigVariable('seed'), parseInt((Math.random()*1000).toString()));
    var mapSize = int(getConfigVariable('size'), 32);
    var render = !!(getConfigVariable('render') || serverAddress);
    var team = int(getConfigVariable('team')) || null;
    var game = new Game({
        id:serverAddress || guid(),
        numberOfTeams:numberOfTeams,
    });
    var network = new WebsocketNetworkProvider(null);
    network.serverAddress = serverAddress;
    return network.networkUp.then(()=>{
        console.log("Network is up");
        Backbone.sync = network.syncReplacement.bind(network); //override default backbone network
        var runtime = new SlaughterRuntime(network, game);
        // We are the server
        if(serverAddress === null) {
            game.set('id', network.address);
            network.serverAddress = network.address;
            game.board = hexops.mapGen(mapSize, numberOfTeams, mapSeed)
            runtime.simulator.handleInitialUpkeep();
            if(detectEnv() == 'browser') {
                if (render) {
                    runtime.initBrowser();
                }
                else {
                    document.write("Server Online! <a href='" + location.href + "&serverAddress=" + network.address + "'>Tell your friends!</a>");
                }
            }
            console.log(`Server has generated a map with seed ${mapSeed} and size ${mapSize}. Map is online at ${network.address}`);
        } else {
            // Figure out which team we are
            network.send({'from': network.address, 'to': network.serverAddress, 'method': 'assignTeam', 'data': {'team': team}}).then((resp)=>{
                team = resp['data']['team'];
                console.log("Server says that we are team", team);
                runtime.ourTeam = team;

                // Load the game from the server & render
                game.fetch();
                if(detectEnv() == 'browser')
                    runtime.initBrowser();
            });
        }
        global['runtime'] = runtime;
        global['hexops'] = hexops;
        global['Move'] = Move;
        return runtime;
    })
}
global['main'] = main;