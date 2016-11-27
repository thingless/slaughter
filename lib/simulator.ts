import * as hexops from './hexops';
import {DIRS} from './hexops';
import {Board, Hex, Move, Tenant, TEAM_WATER, Game} from './models';
import {Dictionary} from './util'

export class Simulator {
    private game:Game = null;
    private territories:Array<Array<Hex>> = [];
    constructor(game:Game) {
        this.game = game;
        this.territories = hexops.annotateTerritories(this.board);
        game.on('change:board', ()=>{
            hexops.annotateTerritories(this.board)
            this.fixHouses();
        }); //if board changes we need to recompute
    }
    get board():Board { return this.game.board }

    private tenantToCombatValue(tenant:Tenant):number {
        if (tenant === Tenant.Peasant)
            return 1;
        if (tenant === Tenant.Spearman)
            return 2;
        if (tenant === Tenant.Knight)
            return 3;
        if (tenant === Tenant.Paladan)
            return 4;

        if (tenant === Tenant.House)
            return 1;
        if (tenant === Tenant.Tower)
            return 1;
        return 0;
    }

    private combatValueToMobileTenant(cv:number):Tenant {
        if (cv === 1)
            return Tenant.Peasant;
        if (cv === 2)
            return Tenant.Spearman;
        if (cv === 3)
            return Tenant.Knight;
        if (cv === 4)
            return Tenant.Paladan;
        return null;
    }

    private computeMoveCost(move:Move):number {
        // This is an existing entity, so it is free
        if (move.fromHex)
            return 0;

        if (move.newTenant === Tenant.Tower)
            return 15;

        if (move.newTenant === Tenant.Peasant)
            return 10;

        return null;
    }

    private getUpgradedTenant(move:Move):Tenant {
        let newTenant = move.fromHex && move.fromHex.tenant || move.newTenant;
        if (!newTenant)
            return null;

        let oldTenant = move.toHex.tenant;

        if (!this.isMobileUnit(newTenant) || !this.isMobileUnit(oldTenant))
            return null;

        let newTenantValue = this.tenantToCombatValue(newTenant);
        let oldTenantValue = this.tenantToCombatValue(oldTenant);

        if (newTenantValue === 0 || oldTenantValue === 0)
            return null;

        let finalValue = newTenantValue + oldTenantValue;
        return this.combatValueToMobileTenant(finalValue);
    }

    private getHomeHex(move:Move):Hex {
        // Find the hex of the house of the **player's** relevant territory for this move.
        let territory = move.fromHex && move.fromHex.territory || move.toHex.territory;

        // TODO: don't just search the whole board lol
        return this.board.filter((hex)=>hex.territory === territory && hex.tenant === Tenant.House)[0];
    }

    public static isMobileUnit(tenant:Tenant):boolean {
        // Check if it's even a mobile unit
        return (tenant === Tenant.Peasant ||
                tenant === Tenant.Spearman ||
                tenant === Tenant.Knight ||
                tenant === Tenant.Paladan);
    }
    private isMobileUnit(tenant:Tenant):boolean {
        return Simulator.isMobileUnit(tenant);
    }

    private canMove(hex:Hex):boolean {
        // See if it is mobile and has moves left
        return this.isMobileUnit(hex.tenant) && hex.canMove;
    }

    private findCombatValue(hex:Hex):number {
        // The combat value of a hex is the max of the combat values of that hex's unit and the surrounding
        // units in the same territories. So we find all neighbors of the same territory and take the max CV.
        let combatValue:number = _.max(_.map(hexops.DIRS, (dir)=>{
            let maybeHex = hexops.hexNeighbor(this.board, hex, dir);
            if (maybeHex.territory === hex.territory) {
                return this.tenantToCombatValue(maybeHex.tenant) || 0;
            }
            return 0;
        }));

        // The hex's tenant counts too!
        return Math.max(combatValue, this.tenantToCombatValue(hex.tenant) || 0);
    }

    private canDefeat(tenant:Tenant, hex:Hex):boolean {
        let ourCV = this.tenantToCombatValue(tenant) || 0;
        let theirCV = this.findCombatValue(hex);
        return ourCV > theirCV;
    }

    private isMoveLegal(move:Move):boolean {
        // If the to hex is water, we cannot move there
        if(!move.toHex || move.toHex.team == TEAM_WATER) {
            console.log("Cannot move to water");
            return false;
        }
        //If the hex is from itself its a no-op
        if(move.fromHex && move.toHex && move.toHex.id === move.fromHex.id){
            console.log("Cannot move to self");
            return false;
        }

        //Is it our turn?
        if(move.team !== this.game.currentTeam){
            console.log("Its not your turn");
            return false;
        }

        // Find the territory of the from hex (or of the to hex if this is a new entity)
        let ourTerritory = move.fromHex && move.fromHex.territory;
        if (!ourTerritory) {
            if (!move.newTenant) {
                // Ill-formed move
                console.log("No fromHex & no newTenant - ill-formed move")
                return false;
            }
            if (move.toHex.team !== move.team) {
                // New pieces can only go into our territory
                console.log("New pieces must land in our territory first");
                return false;
            }
            if (this.computeMoveCost(move) > this.getHomeHex(move).money) {
                // We cannot afford this move
                console.log("Move is too expensive");
                return false;
            }
            ourTerritory = move.toHex.territory;
        } else {
            if (move.fromHex.team !== move.team) {
                // we cannot move others' pieces
                console.log("We cannot move others' pieces")
                return false;
            }
        }

        // If this move is to a territory that isn't our own, we need to ensure the target hex
        // is adjacent to one of this territory.
        if (ourTerritory !== move.toHex.territory) {
            let lst = _.filter(_.map(hexops.DIRS, (dir)=>{
                let maybeOurHex = hexops.hexNeighbor(this.board, move.toHex, dir);
                if (maybeOurHex && maybeOurHex.territory === ourTerritory) {
                    return true;
                }
            }), (x)=>!!x);
            // We don't own any adjacent territory
            if(lst[0] !== true) {
                console.log("We cannot move to a new territory unless the hex is adjacent to our territory");
                return false;
            }
        }

        // If we don't have a new entity, we need to see if it can still move this turn
        if (move.fromHex && !this.canMove(move.fromHex)) {
            console.log("This entity cannot move this turn");
            return false;
        }

        // Find the tenant
        let ourTenant:Tenant = move.fromHex && move.fromHex.tenant || move.newTenant;

        // If it's not mobile, the hex must be empty & ours, full stop
        if (!this.isMobileUnit(ourTenant)) {
            if (move.toHex.territory !== ourTerritory) {
                console.log("This entity is not mobile, so it cannot go outside of our territory");
                return false;
            }
            if (move.toHex.tenant) {
                console.log("This entity is not mobile, so it cannot go where another entity is");
                return false;
            }
        }

        // If the target hex is occupied and we are trying to move a unit, there are three scenarios:
        if (move.toHex.tenant) {
            // 0. It is occupied by a tree. Fuck trees.
            if (move.toHex.tenant !== Tenant.TreePalm && move.toHex.tenant !== Tenant.TreePine) {
                // 1. It is occupied by a friendly building and we cannot move there
                if (move.toHex.territory === ourTerritory && this.isMobileUnit(ourTenant) &&
                    !this.isMobileUnit(move.toHex.tenant)) {
                    console.log("The target hex is occupied by a friendly building");
                    return false;
                }
                // 2. It is occupied by a friendly unit and we might be able to combine
                if (move.toHex.territory === ourTerritory && this.isMobileUnit(ourTenant) &&
                    this.isMobileUnit(move.toHex.tenant)) {
                    let newTenant = this.getUpgradedTenant(move);
                    if (newTenant === null) {
                        console.log("The target hex is occupied by a friendly unit but we cannot combine");
                        return false;
                    }
                }
            }
        }

        // Occupied by (or adjacent to) an enemy or neutral building or unit - we need to check combat values
        if(move.toHex.team !== move.team && !this.canDefeat(ourTenant, move.toHex)) {
            console.log("The target hex is occupied by an enemy building and we cannot beat it");
            return false;
        }

        return true;
    }

    private upkeepForTenant(tenant:Tenant):number {
        if (tenant === Tenant.Peasant)
            return 2;
        if (tenant === Tenant.Spearman)
            return 6;
        if (tenant === Tenant.Knight)
            return 18;
        if (tenant === Tenant.Paladan)
            return 54;
        return 0;
    }

    nextTurn(){
        let prevTeam = this.game.currentTeam;
        this.board.models.filter((hex)=>hex.team === prevTeam).map((hex)=>hex.canMove = true);
        this.game.currentTurn += 1; //next turn
        if(this.game.currentTeam === 0){
            this.handleTreeGrowth();
            this.game.currentTurn += 1; //team 0 is always the trees
        }
        this.handleUpkeep(this.game.currentTeam);
    }

    public handleInitialUpkeep():void {
      _.range(5).map(()=>_.range(this.game.numberOfTeams).map((i)=>this.handleUpkeep(i)))
    }

    private pickTreeForHex(hex:Hex):Tenant {
        if (hexops.allNeighbors(this.board, hex).filter((x)=>x.team === TEAM_WATER).length > 0)
            return Tenant.TreePalm;
        return Tenant.TreePine;
    }

    private handleTreeGrowth():void {
        // Start by converting graves to trees - palm if on coast, pine otherwise
        // Pine trees fill in triangles - if there are two in a line, they fill in the two (unoccupied) diagonals
        // Palm trees grow along coasts - any unoccupied neighbors which neighbor water will be filled

        // Now do pine tree growth
        let newPineTrees:Array<Hex> = []
        this.board.models.filter((hex)=>hex.tenant === Tenant.TreePine).map((hex)=>{
            _.map(hexops.DIRS, (dir)=>{
                let neigh = hexops.hexNeighbor(this.board, hex, dir);
                if (neigh.tenant === Tenant.TreePine) {
                    if (dir === DIRS['SE']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['NE']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['S']));
                    }
                    if (dir === DIRS['NE']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['N']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['SE']));
                    }
                    if (dir === DIRS['N']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['NE']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['NW']));
                    }
                    if (dir === DIRS['NW']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['N']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['SW']));
                    }
                    if (dir === DIRS['SW']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['NW']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['S']));
                    }
                    if (dir === DIRS['S']) {
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['SW']));
                        newPineTrees.push(hexops.hexNeighbor(this.board, hex, DIRS['SE']));
                    }
                }
            });
        });

        // And do palm tree growth
        let newPalmTrees:Array<Hex> = [];
        this.board.models.filter((hex)=>hex.tenant === Tenant.TreePalm).map((hex)=>{
            hexops.allNeighbors(this.board, hex).map((neigh)=>{
                if (hexops.allNeighbors(this.board, neigh).filter((x)=>x.team === TEAM_WATER).length > 0)
                    newPalmTrees.push(neigh);
            });
        });

        // Apply the trees
        newPineTrees.filter((hex)=>hex.tenant === null && hex.team !== TEAM_WATER).map((hex)=>hex.tenant = Tenant.TreePine)
        newPalmTrees.filter((hex)=>hex.tenant === null && hex.team !== TEAM_WATER).map((hex)=>hex.tenant = Tenant.TreePalm)

        // Graves last
        this.board.models.filter((hex)=>hex.tenant === Tenant.Grave).map((hex)=>{
            hex.tenant = this.pickTreeForHex(hex);
        })
    }

    private handleUpkeep(team:number):void {
        // Find all territories belonging to this team
        // Compute their income (1 for any tile not covered by TreePine or TreePalm)
        // Compute their upkeep (# coins per mob)
        // Kill all mobs (and replace with gravestones) if currency is negative

        this.territories.map((hexes)=>{
            // This territory belongs to our team!
            if(hexes[0].team === team) {
                // Compute income & upkeep & find homeHex
                var newMoney = 0;
                let homeHex:Hex = _.filter(hexes, (hex)=>hex.tenant === Tenant.House)[0];
                if (homeHex !== undefined) {
                    let income:number = hexes.map((hex)=>(hex.tenant === Tenant.TreePine || hex.tenant === Tenant.TreePalm) ? 0 : 1).reduce((x, y)=>x + y, 0);
                    let upkeep:number = hexes.map((hex)=>this.upkeepForTenant(hex.tenant)).reduce((x, y)=>x + y, 0);

                    // Find new money
                    newMoney = homeHex.money + income - upkeep;
                    console.log("Territory", homeHex.territory, "for team", team, "has money = ", homeHex.money, " + ", income, " - ", upkeep, " = ", newMoney);

                    // Set new money (or 0 if it was negative)
                    homeHex.money = Math.max(newMoney, 0);
                } else {
                    newMoney = -1;  // Size 1 territories are dead
                }

                // If new money is negative, kill all mobs (replace with gravestones)
                if (newMoney < 0) {
                    hexes.map((hex)=>{
                        if(this.upkeepForTenant(hex.tenant) > 0) {
                            hex.tenant = Tenant.Grave;
                        }
                    })
                }
            }
        })
    }

    private isTree(tenant:Tenant):boolean {
        return tenant === Tenant.TreePalm || tenant === Tenant.TreePine;
    }

    private fixHouses():void {
        // Re-annotate territories
        // For each territory, if they have 0 houses, insert one at "the middle"
        // If they have >1 house, keep the house that has the most money or the first one otherwise
        let newTerritories = hexops.annotateTerritories(this.board);
        newTerritories.map((territory)=>{
            if (territory.length === 1) {
                if (territory[0].tenant === Tenant.House) {
                    territory[0].tenant = this.pickTreeForHex(territory[0]);
                    territory[0].money = 0;
                }
            } else if (territory[0].team !== TEAM_WATER) {
                let houseCount:number = territory.filter((hex)=>hex.tenant === Tenant.House).length;
                if (houseCount === 0) {
                    let worked = false;

                    // Try to find an empty hex
                    if (!worked) {
                        for (let i = 0; i < territory.length; i++) {
                            let hex = territory[i];
                            if (hex.tenant === null) {
                                worked = true;
                                hex.tenant = Tenant.House;
                                break;
                            }
                        }
                    }

                    // Replace a tree or grave
                    if (!worked) {
                        for (let i = 0; i < territory.length; i++) {
                            let hex = territory[i];
                            if (hex.tenant === Tenant.TreePalm || hex.tenant === Tenant.TreePine || hex.tenant === Tenant.Grave) {
                                worked = true;
                                hex.tenant = Tenant.House;
                                break;
                            }
                        }
                    }

                    // Replace a tower
                    if (!worked) {
                        for (let i = 0; i < territory.length; i++) {
                            let hex = territory[i];
                            if (hex.tenant === Tenant.Tower) {
                                worked = true;
                                hex.tenant = Tenant.House;
                                break;
                            }
                        }
                    }

                    // Sucks.
                    if (!worked) {
                        console.log("Nowhere to put a house in this territory!");
                        // TODO: WHAT DO?
                    }
                } else if (houseCount > 1) {
                    let houses:Array<Hex> = territory.filter((hex)=>hex.tenant === Tenant.House);
                    let money:number = houses.map((x)=>x.money || 0).reduce((x, y)=>x + y, 0);

                    let mostMoney:Hex = _.max(houses, (x)=>x.money);

                    houses.map((hex)=>{
                        hex.tenant = null;
                        hex.money = 0;
                    });

                    mostMoney.tenant = Tenant.House;
                    mostMoney.money = money;
                }
            }
        })
        this.territories = newTerritories;
    }

    public makeMove(move:Move):void {
        // Update the board based on a move
        // Make sure the move is legal
        if (!this.isMoveLegal(move))
            return;

        // Find out who we're moving
        let ourTenant:Tenant = move.fromHex && move.fromHex.tenant || move.newTenant;

        // Find out which territory we're talking about
        let ourTerritory:number = move.fromHex && move.fromHex.territory || move.toHex.territory;

        // Find out how much the move cost
        let moveCost:number = this.computeMoveCost(move);

        // Find the territory's home unit
        let homeHex:Hex = this.getHomeHex(move);

        // If there's a friendly mob there, combine them
        if (move.toHex.team === move.team && move.toHex.tenant) {
            let upgradedTenant = this.getUpgradedTenant(move);
            if (upgradedTenant) {
                ourTenant = upgradedTenant;
            }
        }

        // Remove the tenant from the old hex
        if(move.fromHex) {
            move.fromHex.tenant = null;
        }

        // Compute if they can still move - if territories changed, they cannot move again this turn
        if (move.toHex.territory !== ourTerritory) {
            move.toHex.canMove = false;
        }
        if (this.isTree(move.toHex.tenant)) {
            move.toHex.canMove = false;
        }

        // Add them to the new hex
        move.toHex.tenant = ourTenant;

        // The new hex now belongs to our team and is in our territory
        move.toHex.team = move.team;
        move.toHex.territory = ourTerritory;

        // Subtract money from our house
        homeHex.money -= moveCost;

        // If there was a house on this territory, it's gone - remove its money
        move.toHex.money = 0;

        // Reposition houses and reapportion territories
        this.fixHouses();
    }
}

