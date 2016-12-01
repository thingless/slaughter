import * as util from './util';
import * as hexops from './hexops';
import {Board, Move, Hex, Tenant, TEAM_WATER} from './models';
import {Simulator} from './simulator';

export interface MoveGenerator{
    availableMoves:number
    //will generate a move given its index. It is assumed the board you pass is identical to the board you used when constructing the MoveGenerator but possible a different reference
    generate:(moveIndex:number, board:Board)=>Move
}

export function buildMoveGenerator(board:Board, territories:Array<Array<Hex>>):MoveGenerator {
    var moveGenerators:Array<MoveGenerator> = territories.map(buildMoveGeneratorForTerritory.bind(this, board)) as Array<MoveGenerator>;
    return {
        availableMoves:util.sum(moveGenerators.map((gen)=>gen.availableMoves)),
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

function buildMoveGeneratorForTerritory(board:Board, territory:Array<Hex>):MoveGenerator {
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

    var tenantHexes:Array<string> = territory.filter((hex)=>Simulator.isMobileUnit(hex.tenant)).map((hex)=>hex.id)
    var numTenants:number = tenantHexes.length;

    var inner:Array<string> = territory.map((hex)=>hex.id);
    var outer:Array<string> = hexops.computeBorders(board, territory).filter((hex)=>hex.team !== TEAM_WATER).map((hex)=>hex.id)

    // To assign a move an index, we need to arithmetically encode a tuple indexing to the move
    // The highest order "digit" encodes the index of the source tenant (or 0 for create peasant, 1 for create tower)
    // The lower order "digit" encodes the index of the destination hex
    var numMoveSrc:number = numTenants + 2;
    var numMoveDst:number = inner.length + outer.length;

    var availableMoves:number = numMoveSrc * numMoveDst;

    return {
        availableMoves:availableMoves,
        generate:(i:number, board:Board)=>{
            i = i | 0;  // i is an integer

            var moveSrcIdx = (i / numMoveDst) | 0;
            var moveDstIdx = (i % numMoveDst) | 0;

            // Look up the destination hex
            var dstHex:Hex = board.get(inner[moveDstIdx] || outer[moveDstIdx]);

            // If the "source" is 0, construct a peasant; 1 => tower
            if (moveSrcIdx === 0)
                return new Move(0, dstHex, null, Tenant.Peasant);
            if (moveSrcIdx === 1)
                return new Move(0, dstHex, null, Tenant.Tower);

            let srcHex:Hex = board.get(tenantHexes[moveSrcIdx - 2]);
            return new Move(0, dstHex, srcHex, null);
        }
    }
}

export class MonteNode {
    public children:Array<MonteNode>;
    private unvisitedChildren:Array<number>;
    public score:number;
    public plays:number;
    public moveGenerator:MoveGenerator
    public moveIndex:number; //the move index that got to this node state
    constructor(moveIndex:number, moveGenerator:MoveGenerator){
        this.children = [];
        this.unvisitedChildren = _.shuffle(_.range(moveGenerator.availableMoves)) as Array<number>;
        this.moveGenerator = moveGenerator;
        this.score = 0;
        this.plays = 0;
        this.moveIndex = moveIndex;
    }
    //Runs a single monte experiment. Returns the score for the resulting board.
    public run(simulator:Simulator):number{
        let child:MonteNode = this._select_expanded_child(simulator) || //see if we should revist child
            this._select_unexpanded_child(simulator) || //visit an unexpanded child
            this._select_expanded_child(simulator) //its possible none of the unexpanded children were legal
        //calc score or recurse
        var score;
        if(child){ //recurse
            score = child.run(simulator)
        } else {
            score = this.evalBoardScore(simulator)
        }
        //update stats & return
        this.score += score;
        this.plays += 1;
        return score;
    }
    public evalBoardScore(simulator:Simulator){
        return 1; //all boards are winners :)
    }
    private _select_expanded_child(simulator:Simulator):MonteNode {
        if(this.children.length === 0) return null;
        let children = this.children;
        //The score of an unvisited child is 1 so if we have any unvisited children
        //the maxScore starts at 1. Otherwise, it starts at -Inf so that one of the
        //visited children will be selected.
        let maxScore = this.unvisitedChildren ? -Infinity : 1;
        let bestChild = null;
        for (var i = 0; i < children.length; i++) {
            let child = children[i];
            let score = this._ucb1(child.score, child.plays, this.plays);
            if(score > maxScore){
                maxScore = score;
                bestChild = child;
            }
        }
        if(!bestChild) return null;
        simulator.makeMove(bestChild);
        return bestChild
    }
    private _select_unexpanded_child(simulator:Simulator):MonteNode {
        var move;
        var moveIndex;
        while (typeof(moveIndex = this.unvisitedChildren.pop()) !== "undefined") {
            move = this.moveGenerator.generate(moveIndex, simulator.board);
            if(simulator.makeMove(move)){
                break; //we have found a truely valid move!
            }
        }
        if(!moveIndex) return null; //we ran out of potential moves :(
        var child = new MonteNode(moveIndex, buildMoveGenerator(simulator.board, simulator.territories));
        this.children.push(child)
        return child;
    }
    private static _ucb1(score, plays, totalSims){
        //look at https://andysalerno.com/2016/03/Monte-Carlo-Reversi for more info
        const C = 1.4142135623730951; //aka Math.sqrt(2)
        return (score/plays)+C*Math.sqrt(Math.log(totalSims)/plays);
    }
}

