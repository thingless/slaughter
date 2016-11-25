//import * as models from './models'
import {Board, Hex, Tenant, tenantToString} from './models';
import {Dictionary} from './util'
import * as hexops from './hexops';

export const DIRS:Dictionary<THREE.Vector3> = {
    SE: new THREE.Vector3(+1, -1, +0),
    NE: new THREE.Vector3(+1, +0, -1),
    N:  new THREE.Vector3(+0, +1, -1),
    NW: new THREE.Vector3(-1, +1, +0),
    SW: new THREE.Vector3(-1, +0, +1),
    S:  new THREE.Vector3(+0, -1, +1),
};
type Direction = THREE.Vector3;

export function hexNeighbor(board:Board, hex:Hex, direction:Direction):Hex {
    let newLoc:THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    newLoc.add(hex.loc);
    newLoc.add(direction);
    return board.get(newLoc.x + ',' + newLoc.y + ',' + newLoc.z);
}

export function allNeighbors(board:Board, hex:Hex):Array<Hex> {
    return _.map(DIRS, (dir)=>hexNeighbor(board, hex, dir));
}

export function teamFloodFill(board:Board, hex:Hex, territory:number):Array<Hex> {
    let output:Array<Hex> = []

    // Set the "territory" property of this hex and all connected hexes.
    if (hex.territory) {
        return;  // The hex already has a territory
    }

    let startTeam = hex.team;

    let queue:Array<Hex> = [];
    queue.push(hex);

    while(queue.length > 0) {
        let hex = queue.shift();
        if (hex.team === startTeam) {
            if (hex.territory) {
                continue;
            }

            //console.log("Annotating", hexops.cubicToOffsetCoords(hex.loc), "for team", hex.team, "as territory", territory)

            // Mark this node as part of the territory
            hex.territory = territory;
            output.push(hex);

            // Add the node's neighbors to the queue (if they are the right team)
            _.map(DIRS, (dir)=>{
                let neigh = hexNeighbor(board, hex, dir);
                if (neigh)
                if (neigh && neigh.team === startTeam && !neigh.territory) {  // Handle walking off the edge of the board
                    queue.push(neigh);
                }
            });
        }
    }

    return output;
}

export function locToId(loc:THREE.Vector3):string {
    return loc.x + ',' + loc.y + ',' + loc.z;
}

export function annotateTerritories(board:Board):Array<Array<Hex>> {
    // Assign the "territory" prop on each hex to the same thing for each connected component
    // Additionally, return a list of territories (which are each just a list of Hexes)

    // Clear territories first
    board.map((hex)=>hex.territory = null);

    let territories:Array<Array<Hex>> = [];
    let currentTerritory:number = 1;

    board.map((hex)=>{
        let ter = teamFloodFill(board, hex, currentTerritory);
        if (ter && ter.length) {
            territories.push(ter);
            currentTerritory += 1;
        }
    });

    return territories;
}

export function offsetCoordsToCubic(row:number, col:number):THREE.Vector3 {
    var x = col;
    var z = row - (col - (col&1)) / 2;
    var y = -x-z;
    return new THREE.Vector3(x, y, z);
}

export function cubicToOffsetCoords(loc:THREE.Vector3):THREE.Vector2 {
    let col = loc.x;
    let row = loc.z + (loc.x - (loc.x&1)) / 2;
    return new THREE.Vector2(row, col);
}

export function dumbGen(size:number):Board {
    var board:Board = new Board();

    for (var row = 0; row < size; row++) {
        for (var col = 0; col < size; col++) {
            let hex:Hex = new Hex({loc: offsetCoordsToCubic(row, col)});
            if (row > 4 && row < 9) {
                if (col >= 2 && col < 7) {
                    hex.team = 1;
                } else if (col >= 7 && col <= 12) {
                    hex.team = 2;
                }
            }
            if (row == 6 && (col == 4 || col == 9)) {
                hex.money = 100;
                hex.tenant = Tenant.House;
            }

            if (row == 5 && (col == 4 || col == 9)) {
                hex.tenant = Tenant.Peasant;
            }

            board.add(hex);
        }
    }

    return board;
}

export function debugLogHex(hex:Hex):any {
    let oc = cubicToOffsetCoords(hex.loc);
    console.log("Hex:", {
        "offsetLoc": oc.x + ',' + oc.y,
        "team": hex.team,
        "territory": hex.territory,
        "tenant": tenantToString(hex.tenant),
        "money": hex.money,
        "canMove": hex.canMove,
        "loc": hex.loc,
    })
}
