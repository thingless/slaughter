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
})

export interface Config {
    host:string
}

export interface AiConfig extends Config {
    team:number
    serverAddress:string
}

/*
export interface ServerConfig  extends Config {
    size:number
    seed?:number
    numberOfTeams?:number
}
*/

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
}

declare var process:any;
export function aiplayoffMain() {
    main().then((runtime:SlaughterRuntime)=>{
        var ai1, ai2;
        //reg for currentTurn change event
        runtime.game.on("change:currentTurn", ()=>{
            if(runtime.game.currentTurn != 1 || runtime.game.currentTurn / (runtime.game.numberOfTeams+1) < 100) return;
            ai1.kill();
            ai2.kill();
        })
        //start the ais!
        ai1 = startAi({team:1, host:process.env.host, serverAddress:runtime.network.address});
        ai2 = startAi({team:2, host:process.env.host, serverAddress:runtime.network.address})
    })
}

declare var module:any;
if (!module.parent) {
    aiplayoffMain();
}