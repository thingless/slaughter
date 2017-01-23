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

export function buildMoveGenerator(board:Board, territories:Array<Array<Hex>>, prevMove:Move):MoveGenerator {
    var currentHome = prevMove && prevMove['currentHome'];
    var homes = prevMove && prevMove['homes'];
    if(!homes){
        homes = territories
            .map((territory)=>territory.filter((hex)=>hex.tenant === Tenant.House)[0])
            .filter((hex)=>!!hex) //remove undefined
    }
    if(!currentHome){ //start a new territory
        if(homes.lenth === 0) return null; //we are done
        return {
            availableMoves: homes.length,
            generate:(moveIndex:number, board)=>{
                var ret = new FastMove(END_TERRITORY, null, null, null) as Move
                ret['currentHome'] = homes[moveIndex];
                ret['homes'] = homes.slice(0,moveIndex).concat(homes.slice(moveIndex+1)) //create new array removeing selected moveIndex
                return ret;
            }
        }
    }
    var territory = territories.filter((territory)=>territory[0].territory === currentHome.territory)[0];
    if(!territory) //if we dont have a territory fallback to searching all territories for home hex which is slower
        territory = territories.filter((territory)=>!!territory.filter((hex)=>hex.id==currentHome.id).length)[0];
    var gen = buildMoveGeneratorForTerritory(board,territory);
    return {
        availableMoves:gen.availableMoves,
        generate:(moveIndex:number, board:Board)=>{
            var ret = gen.generate(moveIndex, board);
            if(ret.team !== END_TERRITORY)
                ret['currentHome'] = currentHome;
            ret['homes'] = homes;
            return ret;
        }
    }
}

var END_TERRITORY = 666;
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
    tenantHexes.push(END_TERRITORY as any);


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
            if ((srcHex as any) === Tenant.Peasant)
                return new FastMove(srcTeam, dstHex, null, Tenant.Peasant) as Move;
            if ((srcHex as any) === Tenant.Tower)
                return new FastMove(srcTeam, dstHex, null, Tenant.Tower) as Move;
            if((srcHex as any) === END_TERRITORY)
                return new FastMove(END_TERRITORY, null, null, null) as Move

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
        /*request({
            method:"POST",
            uri:'http://localhost:8080/filesave',
            json: {dot:this.root.generateDot()},
        })*/
    }
    public runOnce(){
        this.simulator.deepFastClear(this.originalSimulator)
        this.simulator.fixHouses();
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
    public minScore:number;
    public maxScore:number;
    public bestChildrenIndexes:Array<number>;
    public expandConstant:number;
    constructor(moveIndex:number, moveGenerator:MoveGenerator){
        this.children = [];
        this.unvisitedChildren = _.shuffle(_.range(moveGenerator.availableMoves)) as Array<number>;
        this.moveGenerator = moveGenerator;
        this.score = 0;
        this.plays = 0;
        this.moveIndex = moveIndex;
        this.minScore = 1;
        this.maxScore = 0;
        this.expandConstant = util.float(util.getConfigVariable('expandConstant'), 0.4);
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
        lines.push(`"${id}" [label="${this.children.length} of ${this.children.length+this.unvisitedChildren.length}\n${(this.maxScore).toFixed(4)}x${this.plays}"];`)
        this.children.forEach((child)=>child._generateDotRecurse(id, lines))
    }
    public bestMoveSequence(simulator:Simulator):Array<Move>{
        let ret:Array<Move> = [];
        this._bestMoveSequenceRecurse(simulator, ret, this.bestChildrenIndexes.slice());
        return ret.map((move)=>new Move(move.team, move.toHex, move.fromHex, move.newTenant));
    }
    protected _bestMoveSequenceRecurse(simulator:Simulator, sequence:Array<Move>, bestChildrenIndexes:Array<number>):void{
        let childIndex = bestChildrenIndexes.shift();
        let bestChild = this.children[childIndex];
        if(!bestChild) return;
        let move = this.moveGenerator.generate(bestChild.moveIndex, simulator.board)
        sequence.push(move);
        bestChild._bestMoveSequenceRecurse(simulator, sequence, bestChildrenIndexes);
    }
    public run(simulator:Simulator):number{
        var scaleFunc;
        if(this.maxScore-this.minScore > 0){
            var scaleFactor = 1.0/(this.maxScore-this.minScore)
            var globalMinScore = this.minScore
            scaleFunc = (val)=>(val-globalMinScore)*scaleFactor;
        } else {
            scaleFunc = (val)=>val
        }
        var oldGlobalMaxScore = this.maxScore; //_runRecurse updates this.maxScore so we have to copy it off
        this.bestChildrenIndexes = this.bestChildrenIndexes || [];
        var childIndexes = [];
        var score = this._runRecurse(simulator, scaleFunc, childIndexes);
        if(score > oldGlobalMaxScore){
            this.bestChildrenIndexes = childIndexes;
        }
        return score;
    }
    //Runs a single monte experiment. Returns the score for the resulting board.
    public _runRecurse(simulator:Simulator, scaleFunc:any, childIndexes:Array<number>):number{
        let child = this._select_expanded_child(simulator, scaleFunc) || //see if we should revist child
            this._select_unexpanded_child(simulator) || //visit an unexpanded child
            this._select_expanded_child(simulator, scaleFunc) //its possible none of the unexpanded children were legal
        //calc score or recurse
        var score;
        if(child){ //recurse
            childIndexes.push(child[1]);
            score = child[0]._runRecurse(simulator, scaleFunc, childIndexes);
        } else {
            score = this.evalBoardScore(simulator);
        }
        //update stats & return
        this.score += score;
        this.plays += 1;
        this.minScore = Math.min(this.minScore, score);
        this.maxScore = Math.max(this.maxScore, score);
        return score;
    }
    public abstract evalBoardScore(simulator:Simulator):number;
    protected _select_expanded_child(simulator:Simulator, scaleFunc:any):[MonteNode,number] {
        if(this.children.length === 0) return null;
        let children = this.children;
        //The estimatedValue for an unvisitedChild is just the avg for this node.
        //If there are no unvisitedChildren its -Inf so that we will not choose one
        //if(this.moveIndex < 0){ debugger; }
        var averageChildScore = util.sum(children.map((child)=>child.maxScore)) / children.length;
        let maxScore = this.unvisitedChildren.length ? this._ucb1(scaleFunc(averageChildScore), 1, this.plays) : -Infinity;
        let bestChild:MonteNode = null;
        let bestChildIndex:number = null;
        for (var i = 0; i < children.length; i++) {
            let child = children[i];
            let score = this._ucb1(scaleFunc(child.maxScore), child.plays, this.plays);
            if(score > maxScore){
                maxScore = score;
                bestChild = child;
                bestChildIndex = i;
            }
        }
        if(!bestChild) return null;
        let move = this.moveGenerator.generate(bestChild.moveIndex, simulator.board)
        simulator.makeMove(move, true);
        return [bestChild, bestChildIndex]
    }
    protected _select_unexpanded_child(simulator:Simulator):[MonteNode,number] {
        var moveIndex;
        var move;
        while (typeof(moveIndex = this.unvisitedChildren.pop()) !== "undefined") {
            move = this.moveGenerator.generate(moveIndex, simulator.board);
            if(simulator.makeMove(move, true)){
                break; //we have found a truely valid move!
            }
        }
        if(!_.isNumber(moveIndex)) return null; //we ran out of potential moves :(
        var currentTeam = simulator.game.currentTeam;
        var territories = simulator.territories.filter((territory)=>territory.length>1 && territory[0].team == currentTeam)
        var child = new (this.constructor as any)(moveIndex, buildMoveGenerator(simulator.board, territories, move));
        this.children.push(child)
        return [child, this.children.length-1];
    }
    protected _ucb1(estimatedValue:number, plays:number, totalSims:number){
        //look at https://andysalerno.com/2016/03/Monte-Carlo-Reversi for more info
        return estimatedValue+this.expandConstant*Math.sqrt(Math.log(totalSims)/plays);
    }
}

export class GreedyMonteNode extends MonteNode{
    public evalBoardScore(simulator:Simulator):number{
        let myTeam = simulator.game.currentTeam;
        let hexes = simulator.board.filter((hex)=>hex.team !== TEAM_WATER)
        let myHexes = hexes
            .filter((hex)=>hex.team == myTeam)
            .filter((hex)=>hex.tenant!==Tenant.TreePalm && hex.tenant!==Tenant.TreePine)
        if (myHexes.length == 0) return 0;
        return myHexes.length / hexes.length;
    }
}

export class LCMonteNode extends MonteNode{
    public evalBoardScore(simulator:Simulator):number{
        //grow trees to predict the future
        simulator.handleTreeGrowth();
        //precompute and store some common vars
        var hexes = simulator.game.board;
        var myTeam = simulator.game.currentTeam;
        var myTerritories = simulator.territories.filter((territory)=>territory[0].team == myTeam)
        var myHexes:Array<Hex> = _.flatten(myTerritories);
        var hexesThatBorderEnemy = this.calcHexesThatBorderEnemy(simulator, myHexes)

        //total number of hexes includeing my hexes;
        var totalNumberOfHexes = simulator.board.filter((hex)=>hex.team != TEAM_WATER).length;
        //number of my hexes
        var numberOfHexes = myHexes.length;
        //number of my hexes I can not afford
        var numberOfHexesICanAfford = myHexes.length;
        //number of hexes that are profitable... aka no trees
        var numberOfHexesThatAreProfitable = 0;
        //The number of hexes we own that are currently defended
        var numberOfDefendedHexes = this.calcDefendedHexes(simulator, myHexes);
        //The number of hexes that border the enemy
        var numberOfHexesThatBorderEnemy = hexesThatBorderEnemy.length;
        //The number of hexes that DONT border the enemy
        var numberOfHexesThatDontBorderEnemy = myHexes.length - hexesThatBorderEnemy.length;
        //The number of hexes that border the enemy & are defended
        var numberOfDefendedHexesThatBorderEnemy = this.calcDefendedHexes(simulator, hexesThatBorderEnemy);

        //do computations related to territories... aka upkeep based stuff
        myTerritories.forEach((territory)=>{
            var profitableTerritory = territory.filter((hex)=>!simulator.isTree(hex.tenant));
            numberOfHexesThatAreProfitable += profitableTerritory.length;
            var upkeepCost = util.sum(territory.map((hex)=>Simulator.upkeepForTenant(hex.tenant)));
            if(upkeepCost > profitableTerritory.length)
                numberOfHexesICanAfford -= territory.length;
        })
        var ret = (numberOfHexes/totalNumberOfHexes) * util.float(util.getConfigVariable('aiRatioOfBoard'), 0.7) +
            (numberOfHexesICanAfford/numberOfHexes) * util.float(util.getConfigVariable('aiRatioOfHexesAffordable'), 3.0) +
            (numberOfDefendedHexes/numberOfHexes) * util.float(util.getConfigVariable('aiRatioOfDefendedHexes'), 0.2) +
            (numberOfHexesThatAreProfitable/numberOfHexes) * util.float(util.getConfigVariable('aiRatioOfProfitableHexes'), 1.0) +
            (numberOfHexesThatDontBorderEnemy/numberOfHexes) * util.float(util.getConfigVariable('aiRatioOfBorderHexes'), 0.1) +
            (numberOfDefendedHexesThatBorderEnemy/numberOfHexesThatBorderEnemy) * util.float(util.getConfigVariable('aiRatioOfDefendedBorderHexes'), 0.4)
        ;

        return Math.max(0, ret); //clamp to 0-Inf
    }

    private calcHexesThatBorderEnemy(simulator:Simulator, myHexes:Array<Hex>):Array<Hex>{
        var board = simulator.board;
        var myTeam = myHexes[0].team;
        return myHexes.filter((hex)=>
            hexops.allNeighbors(board, hex).filter((hex)=>hex.team !== myTeam && hex.team !== TEAM_WATER).length !== 0
        )
    }

    private calcDefendedHexes(simulator:Simulator, myHexes:Array<Hex>):number{
        //do computations that are hex based
        var undefendedHexes = new Set(myHexes);
        myHexes.forEach((hex)=>{
            if(simulator.tenantToCombatValue(hex.tenant) > 0){
                undefendedHexes.delete(hex);
                hexops.allNeighbors(simulator.board, hex)
                    .forEach(undefendedHexes.delete.bind(undefendedHexes));
            }
        })
        return myHexes.length - undefendedHexes.size;
    }
}
