//import * as models from './models'
import {Board, Hex} from './models';

export const DIRS = {
    SE: THREE.Vector3(+1, -1, +0),
    NE: THREE.Vector3(+1, +0, -1),
    N:  THREE.Vector3(+0, +1, -1),
    NW: THREE.Vector3(-1, +1, +0),
    SW: THREE.Vector3(-1, +0, +1),
    S:  THREE.Vector3(+0, -1, +1),
};
type Direction = THREE.Vector3;

export function hexNeighbor(board:Board, hex:Hex, direction:Direction):Hex {
    let newLoc:THREE.Vector3 = hex.loc.add(direction);
    return board.get(newLoc.x + ',' + newLoc.y + ',' + newLoc.z);
}

export function teamFloodFill(board:Board, hex:Hex, territory:Number):Array<Hex> {
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
                throw "Hex already has a territory!"
            }

            /// XXX: remove me
            console.log("Annotating", hex.loc, "for team", hex.team, "as territory", territory)

            // Mark this node as part of the territory
            hex.territory = territory;
            output.push(hex);

            // Add the node's neighbors to the queue (if they are the right team)
            _.map(DIRS, (dir)=>{
                let neigh = hexNeighbor(board, hex, dir);
                if (neigh && neigh.team === startTeam) {  // Handle walking off the edge of the board
                    queue.push(neigh);
                }
            });
        }
    }

    return output;
}

export function annotateTerritories(board:Board):Array<Hex> {
    let territories:Array<Hex> = [];
    let currentTerritory:Number = 1;

    board.map((hex)=>{
        let ter = teamFloodFill(board, hex, currentTerritory);
        territories.push(ter);
        currentTerritory += 1;
    });

    return territories;
}
