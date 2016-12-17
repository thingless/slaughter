export interface Dictionary<T> {
    [K: string]: T;
}

export function guid():string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}

export function getQueryVariable(variable:string):string {
    try{
        if(!window.location) return; //webworker
    }catch(err){
        return;
    }
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
}

declare var process:any;
export function getConfigVariable(variable:string):string {
    if(detectEnv() === "browser"){
        return getQueryVariable(variable);
    } else if(detectEnv() === "node"){
        return process.env[variable];
    } else if(detectEnv() == "webworker"){
        return self['env'][variable]
    }
}

export function int(str:string, defaultNumber?:number):number {
    defaultNumber = _.isUndefined(defaultNumber) ? null : defaultNumber;
    let num = parseInt(str)
    return isNaN(num) ? defaultNumber : num
}

declare var global:any;
export function detectEnv():string {
    try {
        return window && "browser";
    } catch (error) {}
    try {
        return self && "webworker";
    } catch (error) {}
    return global && "node";
}

export function getGlobal():any {
    if(detectEnv() === "browser"){
        return window as any;
    } else if(detectEnv() === "webworker"){
        return self as any;
    } else if(detectEnv() === "node"){
        return global as any;
    }
    return null;
}

export function sum(arr:Array<number>):number {
    return arr.reduce((x, y)=>x+y, 0);
}
