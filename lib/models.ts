/// <reference path="../typings/index.d.ts" />
export interface Dictionary<T> {
    [K: string]: T;
}

export function guid():string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {var r = Math.random()*16|0,v=c=='x'?r:r&0x3|0x8;return v.toString(16);});
}

export class BaseModel extends Backbone.Model {
    public relations:any;
    constructor(attributes?: any, options?: any){
        if(!attributes || _.isUndefined(attributes.id)){
            attributes = attributes || {};
            attributes.id = guid();
        }
        super(attributes, options)
        this.set('type', this.constructor['name'])
    }
    public parse(response: any, options?: any):any{
        _.keys(response).map((key)=>{
            let cls = this.relations && this.relations[key];
            if(!cls) return;
            let val = response[key];
            if(_.isNull(val) || _.isUndefined(val)) return;
            if(_.isArray(cls.subclasses) && cls.name!=val['type']){
                cls = cls.subclasses.find((cls)=>cls.name==val['type'])
            }
            if(!cls) return;
            if (cls.prototype instanceof BaseModel){
                let obj:BaseModel = new cls();
                obj.set(obj.parse(val, options))
                response[key] = obj;
            } else if (cls.prototype instanceof BaseColletion){
                let obj:BaseColletion<any> = new cls();
                obj.add(obj.parse(val, options))
                response[key] = obj;
            }
            else {
                throw 'unable to parse relationship!';
            }
        })
        return response;
    }
}
export class BaseColletion<T extends Backbone.Model> extends Backbone.Collection<T>{
    public parent:BaseModel;
    constructor(models?, options?){
        super(models, options);
        this.parent = options && options.parent || null;
        //backbone can have a method or prop for model.url
        this.url = _.result(this.parent,'url')+'/'+this.constructor['name']['toLowerCase']()
    }
    public parse(response: Array<any>, options?: any):any{
        if(!this.model) return response;
        return response.map((val)=>{
            let cls = this.model;
            if(_.isArray(cls['subclasses']) && cls['name']!=val['type']){
                cls = cls['subclasses'].find((cls)=>cls.name==val['type'])
            }
            if(!cls) return val;
            let obj:Backbone.Model = new cls();
            obj.set(obj.parse(val, options));
            return obj;
        })
    }
}

export enum Tenant {
    Water,

    House,
    Tower,

    Grave,
    TreePalm,
    TreePine,

    Peasant,
    Spearman,
    Knight,
    Paladan,
}
export const TEAM_WATER:number = 0;

export class Hex extends BaseModel {
    //tenant:Tenant
    //team:number
    //loc:THREE.Vector3
    defaults(){ return {
        team:TEAM_WATER,
        tenant:Tenant.Water,
        loc:new THREE.Vector3(0,0,0),
    }}
    get team():number { return this.get('team') }
    set team(val:number) { this.set('team', val) }
    get tenant():Tenant { return this.get('tenant') }
    set tenant(val:Tenant) { this.set('tenant', val) }
    get loc():THREE.Vector3 { return this.get('loc') }
    set loc(val:THREE.Vector3) { this.set('loc', val) }


    /* Some example code to make backbone easier
    defaults(){ return {
        commStation:false,
        team:-1,
    }}
    initialize(){
        this.loc && this.set('id', this.loc.x+','+this.loc.y)
        this.on('fleet:enter', this._fleetEnter, this)
        this.on('fleet:leave', this._fleetLeave, this)
        this.on('comm:enter', this._commEnter, this)
        this.listenTo(this, 'change:loc', (m,val)=>this.set('id', val.x+','+val.y))
    }
    //Use properties for type checking
    get time():number { return this.get('time') }
    set time(locations:number) { this.set('time', locations) }
    */
}

export class Board extends BaseColletion<Hex> {
    model=Hex
}

export class Game extends BaseModel {
    //'board':Board
    public relations = {
        'board':Board,
    }
    defaults(){return {
    }}
    initialize(attributes, options){
        this.set('game', new Game(null, {parent:this}))
    }
}