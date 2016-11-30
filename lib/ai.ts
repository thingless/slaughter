import * as util from './util';
import * as hexops from './hexops';
import {Board, Move, Hex, Tenant, TEAM_WATER} from './models';
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
                return new Move(0, dstHex, null, Tenant.Peasant);
            if (moveSrcIdx === 1)
                return new Move(0, dstHex, null, Tenant.Tower);

            let srcHex:Hex = tenantHexes[moveSrcIdx - 2];
            return new Move(0, dstHex, srcHex, null);
        }];
    }
}
