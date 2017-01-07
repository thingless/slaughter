/// <reference path="../typings/index.d.ts" />
require('./libs.js');
var spawn:any = require('child_process').spawn;
var colors:any = require('colors/safe');

import {NetworkProvider, WebsocketNetworkProvider, Router, NetMessage} from './network';
import {SlaughterRuntime} from './runtime'
import {Game} from './models'
import {main} from './index'

colors.setTheme({
    team1:'green',
    team2:'blue',
    team3:'yellow',
    team4:'purple',
    team5:'orange',
})

export interface AiConfig {
    team:number
    serverAddress:string
    host:string
    //after playoff this is populated with result of playoff
    boardRatio?:number
}

export interface AiPlayoff {
    ais:Array<AiConfig>
}

export function startAi(config:AiConfig) {
    function log(data:string) {
        if(config.team){
            data = colors['team'+config.team]("player #"+config.team+": ") + data;
        }
        console.warn(data.trim()); //write to std error
    }
    var child = spawn(process.execPath, ['./src/aiworker.js'], {env:config});
    child.stdout.on('data', log);
    child.stderr.on('data', log);
    child.on('exit', function (code) {
        log('ai process exited with code ' + code);
    });
    return child;
}



declare var process:any;
export function aiplayoffMain(aiOptions:AiPlayoff):Promise<AiPlayoff> {
    process.env.numberOfTeams = aiOptions.ais.length;
    return main().then((runtime:SlaughterRuntime)=>{
        var options:Array<AiConfig> = aiOptions.ais.map((aiConfig, index)=>
            _.extend({}, aiConfig, {team:index+1, host:process.env.host, serverAddress:runtime.network.address})
        )
        var ais:Array<any>; //array of ai processes
        return new Promise((resolve, reject)=>{
            //reg for currentTurn change event
            runtime.simulator.game.on("change:currentTurn", ()=>{
                console.warn("change:currentTurn")
                if(runtime.game.currentTeam != 1) return; //only check end conditions on first players turn
                var winningTeam = runtime.simulator.teamsByRatioOfBoard()[0];
                var gameRound = (runtime.game.currentTurn-1) / (runtime.game.numberOfTeams+1);
                if(winningTeam.ratio > .8 || gameRound >= 100){
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

declare var module:any;
if (!module.parent) {
    console.log = console.warn //this script uses stdout for communication... so redirect garbage write to stdin
    if(process.argv.length <= 2){
        console.error(`usage: size=16 host=localhost:8080 node ./src/aiplayoff.js '{"ais":[{},{}]}'`)
        process.exit(1);
    }
    aiplayoffMain(JSON.parse(process.argv[2]))
        .then((res)=>{
            process.stdout.write(JSON.stringify(res) + '\n');
            process.exit()
        })
}