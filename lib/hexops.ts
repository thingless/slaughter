//import * as models from './models'
import {Board, Hex, Tenant, tenantToString, TEAM_WATER} from './models';
import {Dictionary, svgToCanvas, loadSvg} from './util';
import * as hexops from './hexops';
import * as random from './random';
import * as morph from './morph';

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
    var board = new Board();

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
//mapGenSeed
export function svgGen(size:number, numberOfTeams:number, seed?:number, svgUrl?:string):Promise<Board> {
    svgUrl = svgUrl || '/img/mapgen3.svg';
    seed = seed || 666;
    return svgToMorph(size, seed, svgUrl)
        .then((mo:morph.Morph)=>mo.dilateWithElement().erodeWithElement())
        .then((mo)=>morphToBoard(mo))
        .then((board:Board)=>{ //remove all but largest continent
            let continents = annotateTerritories(board)
            continents = _.sortBy(continents, (continent)=>continent.length).filter((continent)=>continent[0].team != TEAM_WATER)
            continents.pop();
            _.flatten(continents, true).forEach((hex:Hex)=>
                hex.team = TEAM_WATER
            )
            return board;
        })
        .then((board)=>trimWaterEdges(board))
        .then((board)=>uniformRandomAssignTeams(numberOfTeams, board, seed))
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

export function svgToMorph(size:number, seed:number, svgUrl:string):Promise<morph.Morph> {
    svgUrl = svgUrl || '/img/mapgen1.svg';
    seed = seed || 666;
    return loadSvg(svgUrl)
        .then((el)=>{
            $(el).find("#mapGenSeed")
                .attr('seed', seed)
            $(el).attr('width', size+'px')
                .attr('height', size+'px')
            return el;
        }).then(svgToCanvas)
        .then((canvas)=>{
            let context = canvas.getContext('2d');
            let data = context.getImageData(0, 0, size, size).data;
            let bits:Array<number> = []
            for (var row = 0; row < size; row++) {
                for (var col = 0; col < size; col++) {
                    var bit = Math.min(data[row*size*4 + col*4 + 3], 1);
                    bits.push(bit)
                }
            }
            return new morph.Morph(size, size, bits);
        })
}

export function morphToBoard(mo:morph.Morph):Board{
    let  board = new Board()
    for (let col = 0; col < mo.width; col++) {
        for (let row = 0; row < mo.height; row++) {
            let hex:Hex = new Hex({loc: offsetCoordsToCubic(row, col)});
            hex.team = mo.data[row*mo.width + col] > 0 ? 1: TEAM_WATER;
            board.add(hex);
        }
    }
    return board;
}

//assigns hex on a board with a team > 0 a uniform random team
export function uniformRandomAssignTeams(numberOfTeams:number,  board:Board, seed:number) {
    let rnd = new random.Random(new random.MersenneTwister(seed));
    let hexes:Array<Hex> = board.toArray().filter((hex)=>hex.team>0) //get all hexes that are not water
    for (var i = 0; i < hexes.length; i++) {
        hexes[i].team = rnd.randomInt(1, numberOfTeams);
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
