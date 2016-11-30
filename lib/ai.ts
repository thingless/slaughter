import * as util from './util';
import * as hexops from './hexops';
import {Game, Board, Move, Hex, Tenant, TEAM_WATER} from './models';
import {Simulator} from './simulator';

type MoveGeneratorTuple = [number,(i:number)=>Move]
export class Bandit {
    private buildMoveGenerator(board:Board, territory:Array<Hex>):MoveGeneratorTuple {

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

        var inner:Array<Hex> = territory;
        var outer:Array<Hex> = hexops.computeBorders(board, territory).filter((hex)=>hex.team !== TEAM_WATER);

        var tenantHexes:Array<Hex> = inner.filter((hex)=>Simulator.isMobileUnit(hex.tenant));
        var numTenants:number = tenantHexes.length;

        // To assign a move an index, we need to arithmetically encode a tuple indexing to the move
        // The highest order "digit" encodes the index of the source tenant (or 0 for create peasant, 1 for create tower)
        // The lower order "digit" encodes the index of the destination hex
        var numMoveSrc:number = numTenants + 2;
        var numMoveDst:number = inner.length + outer.length;

        var availableMoves:number = numMoveSrc * numMoveDst;
        var srcTeam:number = inner[0].team;

        return [availableMoves, (i:number)=>{
            i = i | 0;  // i is an integer

            var moveSrcIdx = (i / numMoveDst) | 0;
            var moveDstIdx = i % numMoveDst;

            // Look up the destination hex
            var dstHex:Hex = inner[moveDstIdx];
            if (dstHex === undefined)
                dstHex = outer[moveDstIdx-inner.length];

            // If the "source" is 0, construct a peasant; 1 => tower
            if (moveSrcIdx === 0)
                return new Move(srcTeam, dstHex, null, Tenant.Peasant);
            if (moveSrcIdx === 1)
                return new Move(srcTeam, dstHex, null, Tenant.Tower);

            let srcHex:Hex = tenantHexes[moveSrcIdx - 2];
            return new Move(srcTeam, dstHex, srcHex, null);
        }];
    }

    public getRandomMoves(game:Game, team:number):Array<Move> {
        let moves:Array<Move> = [];

        let newGame:Game = game.clone() as Game;
        let newBoard = new Board();
        game.board.models.forEach((hex)=>newBoard.add(hex.clone()));
        newGame.board = newBoard;

        let homeHexes:Array<Hex> = newBoard.filter((hex)=>hex.tenant === Tenant.House && hex.team === team);
        homeHexes.forEach((homeHex)=>{
            let sim:Simulator = new Simulator(newGame);
            let territory:Array<Hex> = newBoard.filter((hex)=>hex.territory === homeHex.territory);
            let numMoves:number;
            let moveGen:(i:number)=>Move;
            [numMoves, moveGen] = this.buildMoveGenerator(newBoard, territory);
            let firstLegalMove:Move = _.shuffle(_.range(numMoves)).map((moveIdx:number)=>moveGen(moveIdx)).filter((move)=>sim.isMoveLegal(move))[0];
            if (firstLegalMove)
                moves.push(firstLegalMove);
        });
        return moves;
    }
}
