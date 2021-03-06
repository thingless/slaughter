/// <reference path="../typings/index.d.ts" />
require('./libs.js');
var spawn:any = require('child_process').spawn;
var colors:any = require('colors/safe');

import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './runtime'
import {Game} from './models'
import {main} from './main'

colors.setTheme({
    '1':'green',
    '2':'blue',
    '3':'yellow',
    '4':'purple',
    '5':'orange',
    'server':'grey'
})

export interface AiConfig {
    team:number
    serverAddress:string
    //after playoff this is populated with result of playoff
    boardRatio?:number
}

export interface AiPlayoff {
    ais:Array<AiConfig>
    host:string
}

function _log(team:number|string, data:string){
    if(team){
        data = colors[team](team+": ") + data;
    }
    console.warn(data.trim()); //write to std error
}

export function startAi(config:AiConfig) {
    var log = _log.bind(null, config.team);
    var child = spawn(process.execPath, ['./src/aiworker.js'], {env:config});
    child.stdout.on('data', log);
    child.stderr.on('data', log);
    child.on('exit', function (code) {
        log('ai process exited with code ' + code);
        if(code !== 0) process.exit(code);
    });
    return child;
}


declare var process:any;
export function aiplayoffMain(aiOptions:AiPlayoff):Promise<AiPlayoff> {
    var startTime = Date.now()/1000;
    process.env.numberOfTeams = aiOptions.ais.length;
    process.env.host = aiOptions.host;
    process.env.size = 16; //XXX: does this need to be configurable?
    return main().then((runtime:SlaughterRuntime)=>{
        var options:Array<AiConfig> = aiOptions.ais.map((aiConfig, index)=>
            _.extend({}, aiConfig, {team:index+1, host:aiOptions.host, serverAddress:runtime.network.address})
        )
        var ais:Array<any>; //array of ai processes
        return new Promise((resolve, reject)=>{
            //reg for currentTurn change event
            runtime.simulator.game.on("change:currentTurn", ()=>{
                console.warn("change:currentTurn")
                if(runtime.game.currentTeam != 1) return; //only check end conditions on first players turn
                var winningTeam = runtime.simulator.teamsByRatioOfBoard()[0];
                var gameRound = (runtime.game.currentTurn-1) / (runtime.game.numberOfTeams+1);
                if(winningTeam.ratio > .8 || gameRound >= 500 || (Date.now()/1000)-startTime > 15*60){
                    ais.forEach((ai)=>ai.kill()) //stop all the ais
                    console.warn(`winner is team ${winningTeam.team} on game round #${gameRound} with ratio ${(winningTeam.ratio).toFixed(2)}`)
                    //update boardRatios
                    runtime.simulator.teamsByRatioOfBoard().forEach((ratio)=>{
                        options[ratio.team-1].boardRatio = ratio.ratio;
                    })
                    //return results
                    resolve({ais:options})
                }
                else {
                    console.warn(`no winner on game round #${gameRound} best candidate is team ${winningTeam.team} with ratio ${(winningTeam.ratio).toFixed(2)}`)
                }
            })
            //start the ais!
            ais = options.map((option)=>startAi(option))
        })
    }) as any;
}

function getPort(startPort?:number):Promise<number> {
    startPort = startPort || 8000;
    return new Promise((resolve,reject)=>{
        var server = require('net').createServer();
        var port = parseInt(Math.random()*1000 as any) + startPort;
        server.listen(port, function (err) {
            server.once('close', resolve.bind(null, port));
            server.close()
        })
        server.on('error', function (err) {
            getPort(startPort).then(resolve)
        })
    });
}

function startServer(port:number) {
    return new Promise((resolve, reject)=>{
        var log = _log.bind(null, 'server');
        console.log(port)
        var child = spawn(process.execPath, ['./lib/server.js'], {env:{PORT:port}});
        child.stdout.once('data',resolve);
        child.stdout.on('data',log);
        child.stderr.on('data', log);
        child.on('exit', function (code) {
            log('server process exited with code ' + code);
            if(code !== 0) process.exit(code);
        });
    })
}

declare var module:any;
if (!module.parent) {
    console.log = console.warn //this script uses stdout for communication... so redirect garbage write to stdin
    if(process.argv.length <= 2){
        console.error(`usage: size=16 node ./src/aiplayoff.js '{"ais":[{},{}]}'`)
        process.exit(1);
    }
    var port;
    getPort()
        .then((p)=>{
            port = p;
            return startServer(port);
        })
        .then(()=>{
            var options = JSON.parse(process.argv[2]);
            options.host = "localhost:"+port;
            return aiplayoffMain(options)
        })
        .then((res)=>{
            process.stdout.write(JSON.stringify(res) + '\n');
            process.exit()
        })
}