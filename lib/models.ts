/// <reference path="../typings/index.d.ts" />
import {guid, Dictionary} from './util'
import * as hexops from './hexops'

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
    House=1,
    Tower=2,

    Grave=3,
    TreePalm=4,
    TreePine=5,

    Peasant=6,
    Spearman=7,
    Knight=8,
    Paladan=9,
}
export const TEAM_WATER:number = -1;
export function tenantToString(tenant:Tenant):string {
    if (tenant === null)
        return "null";
    if (tenant === Tenant.House)
        return "house";
    if (tenant === Tenant.Tower)
        return "tower";
    if (tenant === Tenant.Grave)
        return "grave";
    if (tenant === Tenant.TreePalm)
        return "treepalm";
    if (tenant === Tenant.TreePine)
        return "treepine";
    if (tenant === Tenant.Peasant)
        return "peasant";
    if (tenant === Tenant.Spearman)
        return "spearman";
    if (tenant === Tenant.Knight)
        return "knight";
    if (tenant === Tenant.Paladan)
        return "paladan";
    return "unknown";
}

export class FastHex {
    id:string
    team:number
    tenant:number
    loc:THREE.Vector3
    money:number
    canMove:boolean
    territory:number
}

export class Hex extends BaseModel {
    //tenant:Tenant
    //team:number
    //loc:THREE.Vector3
    defaults(){ return {
        team:TEAM_WATER,
        tenant:null,
        loc:new THREE.Vector3(0,0,0),
        money:0,
        canMove:true,
    }}
    get team():number { return this.get('team') }
    set team(val:number) { this.set('team', val) }
    get tenant():Tenant { return this.get('tenant') }
    set tenant(val:Tenant) { this.set('tenant', val) }
    get loc():THREE.Vector3 { return this.get('loc') }
    set loc(val:THREE.Vector3) { this.set('loc', val) }
    get money() { return this.get('money') }
    set money(val:number) { this.set('money', val) }
    get canMove() { return this.get('canMove') }
    set canMove(val:boolean) { this.set('canMove', val) }

    public territory:number = null;

    initialize(){
        this.set('id', this.loc.x+','+this.loc.y+','+this.loc.z)
    }
}

export class FastMove{
    constructor(team:number, toHex:Hex, fromHex:Hex, newTenant:Tenant) {
        this.team = team;
        this.toHex = toHex;
        this.fromHex = fromHex;
        this.newTenant = newTenant;
    }
    public team:number
    public newTenant:Tenant
    public fromHex:Hex
    public toHex:Hex
}
export class Move extends BaseModel {
    constructor(team:number, toHex:Hex, fromHex:Hex, newTenant:Tenant) {
        super({
            team:team,
            toHex:toHex,
            fromHex:fromHex,
            newTenant:newTenant
        })
    }
    get team():number { return this.get('team') }
    set team(val:number) { this.set('team', val) }
    get newTenant():Tenant { return this.get('newTenant') }
    set newTenant(val:Tenant) { this.set('newTenant', val) }
    get fromHex():Hex { return this.get('fromHex') }
    set fromHex(val:Hex) { this.set('fromHex', val) }
    get toHex():Hex { return this.get('toHex') }
    set toHex(val:Hex) { this.set('toHex', val) }
}


export class Board extends BaseColletion<Hex> {
    model=Hex
}

export class Moves extends BaseColletion<Move> {
    model=Move
}

export class Game extends BaseModel {
    public relations = {
        'board':Board,
        'moves':Moves,
    }
    defaults(){ return {
        currentTeam:1,
        currentTurn:1,
        clientTeamMap:{},
    }}
    initialize(attributes, options){
        this.set('board', new Board(null, {parent:this}))
        this.set('moves', new Moves(null, {parent:this}))
    }
    get board():Board { return this.get('board') }
    set board(val:Board) { this.set('board', val) }
    get moves():Board { return this.get('moves') }
    set moves(val:Board) { this.set('moves', val) }
    get url():string{ return '/game/' + this.get('id') }
    get numberOfTeams():number { return this.get('numberOfTeams') }
    set numberOfTeams(val:number) { this.set('numberOfTeams', val) }
    get currentTurn():number { return this.get('currentTurn') }
    set currentTurn(val:number) { this.set('currentTurn', val) }
    get currentTeam():number { return this.currentTurn % (this.numberOfTeams+1) }
    get turnsPerTeam():number {return Math.floor(this.currentTurn / (this.numberOfTeams+1)); }
    set clientTeamMap(val:Dictionary<number>) { this.set('clientTeamMap', val); }
    get clientTeamMap() { return this.get('clientTeamMap'); }
}
