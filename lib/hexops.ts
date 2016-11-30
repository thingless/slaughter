//import * as models from './models'
import {Board, Hex, Tenant, tenantToString, TEAM_WATER} from './models';
import {Dictionary} from './util';
import {Simulator} from './simulator';
import * as hexops from './hexops';
import * as random from './random';

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


export function allNeighborIds(hex:Hex):Array<string> {
    var x = hex.loc.x|0;
    var y = hex.loc.y|0;
    var z = hex.loc.z|0;
    return [
        (x+1)+','+(y-1)+','+(z+0),
        (x+1)+','+(y+0)+','+(z-1),
        (x+0)+','+(y+1)+','+(z-1),
        (x-1)+','+(y+1)+','+(z+0),
        (x-1)+','+(y+0)+','+(z+1),
        (x+0)+','+(y-1)+','+(z+1),
    ]
}

export function allNeighbors(board:Board, hex:Hex):Array<Hex> {
    return allNeighborIds(hex).map((id)=>board.get(id)).filter((x)=>x)
}

export function computeBorders(board:Board, territory:Array<Hex>):Array<Hex>{
    var map:Dictionary<number> = {};
    territory.forEach((hex)=>{
        allNeighborIds(hex).forEach((id)=>{
            map[id] = 1
        })
    })
    territory.forEach((hex)=>{
        delete map[hex.id]; //it can not be a border if it sin territory
    })
    return _.keys(map).map((id)=>board.get(id));
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

declare var ROT:any;
export function rotGen(size:number, seed:number):Board {
    ROT.RNG.setSeed(seed)
    /* create a connected map where the player can reach all non-wall sections */
    var map = new ROT.Map.Cellular(size, size, { connected: true });
    /* cells with 1/2 probability */
    map.randomize(0.5);
    /* make a few generations */
    for (var i=0; i<3; i++) map.create();
    //create board
    var board = new Board();
    for (var x = 0; x < size; x++) {
        for (var y = 0; y < size; y++) {
            let hex:Hex = new Hex({loc: offsetCoordsToCubic(y, x)});
            hex.team = map._map[x][y]===0 ? TEAM_WATER : 1
            board.add(hex)
        }
    }
    return board;
}

export function mapGen(size:number, numberOfTeams:number, seed?:number):Board {
    seed = seed || 666;
    var board = rotGen(size, seed)
    //remove all but largest continent
    let continents = annotateTerritories(board)
            continents = _.sortBy(continents, (continent)=>continent.length).filter((continent)=>continent[0].team != TEAM_WATER)
            continents.pop();
            _.flatten(continents, true).forEach((hex:Hex)=>
                hex.team = TEAM_WATER
            )
    board = trimWaterEdges(board)
    board = roundRobinRandomAssignTeams(numberOfTeams, board, seed)
    board = populateTrees(board, 0.1, seed)
    return board
}

export function trimWaterEdges(board:Board):Board{
    var ret = new Board();
    let xs = board.models
        .filter((hex:Hex)=> hex.team != TEAM_WATER)
        .map((hex:Hex)=> cubicToOffsetCoords(hex.loc).x)
    let ys = board.models
        .filter((hex:Hex)=> hex.team != TEAM_WATER)
        .map((hex:Hex)=> cubicToOffsetCoords(hex.loc).y)
    let xmin = _.min(xs)-1
    let xmax = _.max(xs)+1
    let ymin = _.min(ys)-1
    let ymax = _.max(ys)+1
    board.models
        .filter((oldHex)=>{
            let offset = cubicToOffsetCoords(oldHex.loc)
            return offset.x >= xmin && offset.x <= xmax && offset.y >= ymin && offset.y <= ymax;
        })
        .map((oldHex)=>{
            let offset = cubicToOffsetCoords(oldHex.loc)
            offset.x -= xmin
            offset.y -= ymin
            return new Hex({loc:offsetCoordsToCubic(offset.y, offset.x), team:oldHex.team})
        })
        .forEach((hex)=>ret.add(hex))
    return ret;
}

//assigns hex on a board with a team > 0 a uniform random team
export function roundRobinRandomAssignTeams(numberOfTeams:number,  board:Board, seed:number) {
    let rnd = new random.Random(new random.MersenneTwister(seed));
    let hexes:Array<Hex> = board.toArray().filter((hex)=>hex.team>0) //get all hexes that are not water
    for (var i = 0; hexes.length !== 0; i++) {
        let hexIndex = rnd.randomInt(0, hexes.length-1);
        let hex:Hex = hexes.splice(hexIndex,1)[0]; //splice removes from original list
        hex.team = i % numberOfTeams + 1
    }
    return board;
}

export function populateTrees(board:Board, treeChance:number, seed:number) {
    let rnd = new random.Random(new random.MersenneTwister(seed));
    let hexes:Array<Hex> = board.toArray().filter((hex)=>hex.team>0) //get all hexes that are not water
    hexes.forEach(function(hex){
        if (hex.tenant === null && rnd.random() < treeChance) {
            hex.tenant = Simulator.pickTreeForHex(board, hex);
        }
    });
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
