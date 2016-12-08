import * as util from './util';
import * as hexops from './hexops';
import {Game, Board, Move, Hex, Tenant, TEAM_WATER, FastMove, tenantToString} from './models';
import {Simulator} from './simulator';
import * as request from 'request'

export interface MoveGenerator{
    availableMoves:number
    //will generate a move given its index. It is assumed the board you pass is identical to the board you used when constructing the MoveGenerator but possible a different reference
    generate:(moveIndex:number, board:Board)=>Move
}

export function buildMoveGenerator(board:Board, territories:Array<Array<Hex>>):MoveGenerator {
    var moveGenerators:Array<MoveGenerator> = territories
        .map((territory)=>buildMoveGeneratorForTerritory(board, territory))
        .filter((i)=>!!i);
    var availableMoves = util.sum(moveGenerators.map((gen)=>gen.availableMoves));
    return {
        availableMoves:availableMoves,
        generate:(moveIndex:number, board)=>{
            let sum = 0;
            for (var i = 0; i < moveGenerators.length; i++) {
                let gen = moveGenerators[i];
                if(sum+gen.availableMoves > moveIndex)
                    return gen.generate(moveIndex-sum , board);
                sum += gen.availableMoves
            }
        }
    }
}

export function buildMoveGeneratorForTerritory(board:Board, territory:Array<Hex>):MoveGenerator {
    // There are two types of moves:
    //   Moves that create a tenant
    //     For each hex in inner (+ outer, for silly reasons of nonoptimization)
    //       Tower
    //       Peasant
    //   Moves that move an existing tenant
    //     For each existing tenant
    //       It can move to any hex in inner
    //       or any hex in outer
    // Note that these moves are (mostly) illegal - only very basic trimming is done
    var tenantHexes:Array<string> = territory.filter((hex)=>Simulator.canMove(hex)).map((hex)=>hex.id)
    //add virtual build tenants if appropriate
    var money = Simulator.getHomeHex(board, territory[0].territory).money;
    if(money >= 10) tenantHexes.push(Tenant.Peasant as any);
    if(money >= 15) tenantHexes.push(Tenant.Tower as any);


    var inner:Array<string> = territory.map((hex)=>hex.id);
    var outer:Array<string> = hexops.computeBorders(board, territory).filter((hex)=>hex && hex.team !== TEAM_WATER).map((hex)=>hex.id)

    // To assign a move an index, we need to arithmetically encode a tuple indexing to the move
    // The highest order "digit" encodes the index of the source tenant (create peasant, create tower are virtual sources)
    // The lower order "digit" encodes the index of the destination hex
    var numMoveSrc:number = tenantHexes.length ;
    var numMoveDst:number = inner.length + outer.length;

    var availableMoves:number = numMoveSrc * numMoveDst;
    var srcTeam = territory[0].team;
    if(availableMoves === 0) return null;
    return {
        availableMoves:availableMoves,
        generate:(i:number, board:Board)=>{
            i = i | 0;  // i is an integer

            var moveSrcIdx = (i / numMoveDst) | 0;
            var moveDstIdx = i % numMoveDst;

            // Look up the src & destination hex
            let srcHex:Hex = board.get(tenantHexes[moveSrcIdx]) || (tenantHexes[moveSrcIdx] as any);
            var dstHex:Hex = board.get(inner[moveDstIdx] || outer[moveDstIdx-inner.length]);
            // If the "source" is Tenant.Peasant, construct a peasant; Tenant.Tower => tower
            if ((srcHex as any) === Tenant.Peasant){
                return new FastMove(srcTeam, dstHex, null, Tenant.Peasant) as Move;
            }
            if ((srcHex as any) === Tenant.Tower)
                return new FastMove(srcTeam, dstHex, null, Tenant.Tower) as Move;

            return new FastMove(srcTeam, dstHex, srcHex, null) as Move;
        }
    }
}

export class MonteRunner {
    public root:MonteNode
    public originalSimulator:Simulator
    public simulator:Simulator
    public bestScoreSoFar:number //purely for analytics

    constructor(root:MonteNode, simulator:Simulator){
        this.root = root
        this.originalSimulator = simulator
        this.simulator = simulator.deepFastClone()
        this.bestScoreSoFar = 0;
    }
    public runIterations(iterations:number){
        for (var i = 0; i < iterations; i++) {
            this.runOnce()
            if(i%100===0) console.log('Finished MonteRunner iteration #'+i)
        }
        console.log(this.root);
        request({
            method:"POST",
            uri:'http://localhost:8080/filesave',
            json: {dot:this.root.generateDot()},
        })
    }
    public runOnce(){
        this.simulator.deepFastClear(this.originalSimulator)
        this.simulator.recomputeCachedState();
        let oldLog = console.log
        console.log = function(){}
        let score = this.root.run(this.simulator)
        console.log = oldLog;
        if(score > this.bestScoreSoFar){
            console.log('found a new highscore ' + score)
            this.bestScoreSoFar = score
        }
    }
    public getBestMoveSequence():Array<Move>{
        return this.root.bestMoveSequence(this.simulator);
    }
}

export abstract class MonteNode {
    public children:Array<MonteNode>;
    private unvisitedChildren:Array<number>;
    public score:number;
    public plays:number;
    public moveGenerator:MoveGenerator
    public moveIndex:number; //the move index that got to this node state
    public averageScore:number;
    public globalMinScore:number;
    public globalMaxScore:number;
    constructor(moveIndex:number, moveGenerator:MoveGenerator){
        this.children = [];
        this.unvisitedChildren = _.shuffle(_.range(moveGenerator.availableMoves)) as Array<number>;
        this.moveGenerator = moveGenerator;
        this.score = 0;
        this.plays = 0;
        this.averageScore = 0;
        this.moveIndex = moveIndex;
    }
    public generateDot():string{
        var lines = ['digraph graphname {']
        this._generateDotRecurse(null, lines)
        lines.push('}')
        return lines.join('\n')
    }
    public _generateDotRecurse(parent:string, lines:Array<string>):void{
        var id = util.guid().replace(/-/gi, '').substring(0,10)
        if(parent) lines.push(`"${parent}" -> "${id}";`)
        lines.push(`"${id}" [label="${this.children.length} of ${this.children.length+this.unvisitedChildren.length}\n${(this.score/this.plays).toFixed(4)}"];`)
        this.children.forEach((child)=>child._generateDotRecurse(id, lines))
    }
    public bestMoveSequence(simulator:Simulator):Array<Move>{
        let ret:Array<Move> = [];
        this._bestMoveSequenceRecurse(simulator, ret)
        return ret
    }
    protected _bestMoveSequenceRecurse(simulator:Simulator, sequence:Array<Move>):void{
        let children = this.children;
        if(children.length == 0) return; //no more moves
        let maxScore = -Infinity;
        let bestChild:MonteNode = null;
        for (var i = 0; i < children.length; i++) {
            let child = children[i];
            //we want to find the node with the highest lowest confidence bound
            let score = this._ucb1(child.score/child.plays, child.plays, this.plays, -1.4142135623730951); //neg c calcs lower confidence bound
            if(score > maxScore){
                maxScore = score
                bestChild = child
            }
        }
        let move = this.moveGenerator.generate(bestChild.moveIndex, simulator.board)
        sequence.push(move)
        bestChild._bestMoveSequenceRecurse(simulator, sequence)
    }
    public run(simulator:Simulator):number{
        this.globalMinScore = _.isUndefined(this.globalMinScore) ? 1 : this.globalMinScore;
        this.globalMaxScore = _.isUndefined(this.globalMaxScore) ? 0 : this.globalMaxScore;
        var scaleFunc;
        if(this.globalMaxScore-this.globalMinScore > 0){
            var scaleFactor = 1.0/(this.globalMaxScore-this.globalMinScore)
            var globalMinScore = this.globalMinScore
            scaleFunc = (val)=>(val-globalMinScore)*scaleFactor;
        } else {
            scaleFunc = (val)=>val
        }
        var score = this._runRecurse(simulator, scaleFunc);
        this.globalMinScore = Math.min(this.globalMinScore, score);
        this.globalMaxScore = Math.max(this.globalMaxScore, score);
        return score;
    }
    //Runs a single monte experiment. Returns the score for the resulting board.
    public _runRecurse(simulator:Simulator, scaleFunc:any):number{
        let child:MonteNode = this._select_expanded_child(simulator, scaleFunc) || //see if we should revist child
            this._select_unexpanded_child(simulator) || //visit an unexpanded child
            this._select_expanded_child(simulator, scaleFunc) //its possible none of the unexpanded children were legal
        //calc score or recurse
        var score;
        if(child){ //recurse
            score = child._runRecurse(simulator, scaleFunc)
        } else {
            score = this.evalBoardScore(simulator)
        }
        //update stats & return
        this.score += score;
        this.plays += 1;
        this.averageScore = this.score / this.plays;
        return score;
    }
    public abstract evalBoardScore(simulator:Simulator):number;
    protected _select_expanded_child(simulator:Simulator, scaleFunc:any):MonteNode {
        if(this.children.length === 0) return null;
        let children = this.children;
        //The estimatedValue for an unvisitedChild is just the avg for this node.
        //If there are no unvisitedChildren its -Inf so that we will not choose one
        //if(this.moveIndex < 0){ debugger; }
        var averageChildScore = util.sum(children.map((child)=>child.averageScore)) / children.length;
        let maxScore = this.unvisitedChildren.length ? this._ucb1(scaleFunc(averageChildScore), 1, this.plays) : -Infinity;
        let bestChild:MonteNode = null;
        for (var i = 0; i < children.length; i++) {
            let child = children[i];
            let score = this._ucb1(scaleFunc(child.averageScore), child.plays, this.plays);
            if(score > maxScore){
                maxScore = score;
                bestChild = child;
            }
        }
        if(!bestChild) return null;
        let move = this.moveGenerator.generate(bestChild.moveIndex, simulator.board)
        simulator.makeMove(move, true);
        return bestChild
    }
    protected _select_unexpanded_child(simulator:Simulator):MonteNode {
        var moveIndex;
        while (typeof(moveIndex = this.unvisitedChildren.pop()) !== "undefined") {
            let move = this.moveGenerator.generate(moveIndex, simulator.board);
            if(simulator.makeMove(move, true)){
                break; //we have found a truely valid move!
            }
        }
        if(!_.isNumber(moveIndex)) return null; //we ran out of potential moves :(
        var currentTeam = simulator.game.currentTeam;
        var territories = simulator.territories.filter((territory)=>territory.length>1 && territory[0].team == currentTeam)
        var child = new (this.constructor as any)(moveIndex, buildMoveGenerator(simulator.board, territories));
        this.children.push(child)
        return child;
    }
    protected _ucb1(estimatedValue:number, plays:number, totalSims:number, c?:number){
        //look at https://andysalerno.com/2016/03/Monte-Carlo-Reversi for more info
        c = +(c || 1.4142135623730951) //aka Math.sqrt(2)
        return estimatedValue+c*Math.sqrt(Math.log(totalSims)/plays);
    }
}

export class GreedyMonteNode extends MonteNode{
    public evalBoardScore(simulator:Simulator){
        let myTeam = simulator.game.currentTeam;
        let hexes = simulator.board.filter((hex)=>hex.team !== TEAM_WATER)
        let myHexes = hexes.filter((hex)=>hex.team == myTeam)
        if (myHexes.length == 0) return 0;
        return myHexes.length / hexes.length;
    }
}
