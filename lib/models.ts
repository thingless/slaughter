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

export class Hex extends BaseModel {
    //x:int
    //y:int
    //z:int
    initialize(){

    }
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