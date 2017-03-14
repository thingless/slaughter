import * as hexops from './hexops';
import {DIRS} from './hexops';
import {Board, Hex, Move, Tenant, TEAM_WATER, Game, FastHex} from './models';
import {Dictionary} from './util'

export interface TeamRatio{
    ratio:number
    team:number
}

export class Simulator {
    public game:Game = null;
    public territories:Array<Array<Hex>> = [];
    constructor(game:Game) {
        this.game = game;
        this.territories = hexops.annotateTerritories(this.board);
        game.on('change:board', this.fixHouses.bind(this, false));
    }
    get board():Board { return this.game.board }

    public needToFixHouses(hex:Hex, oldTeam:number, newTeam:number, oldTenant:Tenant):boolean {
        if(oldTeam === newTeam)
            return false;
        if(oldTenant === Tenant.House)
            return true;
        let edgesA:number = hexops.countEdgesForTeam(this.board, hex, oldTeam);
        let edgesB:number = hexops.countEdgesForTeam(this.board, hex, newTeam);

        return !(edgesA <= 2 && edgesB <= 2);
    }

    public deepClone():Simulator{
        let newBoard = new Board(this.game.board.models.map((hex)=>hex.clone()))
        let newGame:Game = this.game.clone() as Game;
        newGame.board = newBoard;
        return new Simulator(newGame);
    }

    public deepFastClone():Simulator{
        let dict = {}
        let newBoard:any = this.game.board.models.map((hex)=>{
            let fastHex = new FastHex()
            fastHex.id = hex.id
            fastHex.team = hex.team
            fastHex.tenant = hex.tenant
            fastHex.loc = hex.loc
            fastHex.money = hex.money
            fastHex.canMove = hex.canMove
            fastHex.territory = hex.territory
            dict[fastHex.id] = fastHex;
            return fastHex;
        })
        newBoard.get = (id)=>dict[id] || null
        let newGame:any = {
            board: newBoard,
            currentTeam: this.game.currentTeam,
            currentTurn: this.game.currentTurn,
            on:function(){},
        }
        return new Simulator(newGame);
    }

    public deepFastClear(originalSimulator:Simulator):void{
        let origBoard = originalSimulator.board;
        this.game.board.map((hex)=>{
            let origHex = origBoard.get(hex.id)
            hex.team = origHex.team
            hex.tenant = origHex.tenant
            hex.money = origHex.money
            hex.canMove = origHex.canMove
            hex.territory = origHex.territory
        })
        this.game.currentTurn = originalSimulator.game.currentTurn;
    }

    public static tenantToCombatValue(tenant:Tenant):number {
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
            return 2;
        return 0;
    }

    private static combatValueToMobileTenant(cv:number):Tenant {
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

    public static tenantCost(tenant:Tenant):number{
        if(tenant == Tenant.Tower) return 15;
        if(tenant == Tenant.Peasant) return 10;
        if(tenant == Tenant.Spearman) return 20;
        if(tenant == Tenant.Knight) return 30;
        if(tenant == Tenant.Paladan) return 40;
        return 0;
    }

    public static combineTenants(tenant1:Tenant, tenant2:Tenant):Tenant{
        if(!tenant1 || !tenant2 ||
           !Simulator.isMobileUnit(tenant1) ||
           !Simulator.isMobileUnit(tenant2)
        ) return null;
        let combatValue:number = Simulator.tenantToCombatValue(tenant1) + Simulator.tenantToCombatValue(tenant2);
        return Simulator.combatValueToMobileTenant(combatValue);
    }

    private static getUpgradedTenant(move:Move):Tenant {
        //its possible to combine up to 3 tenants in a single move eg fromHex, newTenant, toHex
        if(move.newTenant == Tenant.Tower) return Tenant.Tower;
        //handle tenant in fromHex
        if(Simulator.isMobileUnit(move.fromHex.tenant))
            var tenant:Tenant = move.fromHex.tenant;
        //handle new tenant
        tenant = Simulator.combineTenants(tenant, move.newTenant) || move.newTenant
        if(!tenant) return null; //if we don't have a tenant by now then move is not legal
        //handle toHex tenant
        if(Simulator.isMobileUnit(move.fromHex.tenant) && move.fromHex.territory == move.toHex.territory)
            tenant = Simulator.combineTenants(tenant, move.fromHex.tenant);
        return tenant;
    }

    public teamsByRatioOfBoard():Array<TeamRatio>{
        var totalHexes = this.board.models.filter((h)=>h.team != TEAM_WATER).length;
        var res:Array<TeamRatio> = _.values(_.groupBy(this.board.models, (hex)=>hex.team))
            .map((g)=>({team:g[0].team, ratio:g.length/totalHexes}) as TeamRatio)
            .filter((g)=>g.team !== TEAM_WATER)
        return _.sortBy(res, (g)=>-g.ratio)
    }

    public static getHomeHex(board:Board, territory:number){
        // TODO: don't just search the whole board lol
        return board.filter((hex)=>hex.territory === territory && hex.tenant === Tenant.House)[0] || null;
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

    public static canMove(hex:Hex):boolean{
        return this.isMobileUnit(hex.tenant) && hex.canMove;
    }
    public canMove(hex:Hex):boolean {
        return Simulator.canMove(hex);
    }

    private findCombatValue(hex:Hex):number {
        // The combat value of a hex is the max of the combat values of that hex's unit and the surrounding
        // units in the same territories. So we find all neighbors of the same territory and take the max CV.
        let combatValue:number = _.max(hexops.allNeighbors(this.board, hex)
            .filter((neighbor)=>neighbor.team == hex.team)
            .map((hex)=>Simulator.tenantToCombatValue(hex.tenant)));
        // The hex's tenant counts too!
        return Math.max(combatValue, Simulator.tenantToCombatValue(hex.tenant) || 0);
    }

    private canDefeat(tenant:Tenant, hex:Hex):boolean {
        let ourCV = Simulator.tenantToCombatValue(tenant) || 0;
        let theirCV = this.findCombatValue(hex);
        return ourCV > theirCV;
    }

    public isMoveLegal(move:Move):boolean {
        //basic validation
        if(!move.toHex || !move.fromHex || move.fromHex.team != move.team){
            console.log("Ill formed move");
        }
        // If the to hex is water, we cannot move there
        if(move.toHex.team == TEAM_WATER) {
            console.log("Cannot move to water");
            return false;
        }
        //Is it our turn?
        if(move.team !== this.game.currentTeam){
            console.log("It is not your turn!");
            return false;
        }
        // We need to see if it can still move this turn
        if (Simulator.isMobileUnit(move.fromHex.tenant) && !move.fromHex.canMove) {
            console.log("This entity cannot move this turn");
            return false;
        }
        //validate resulting tenant
        var ourTerritory = move.fromHex.territory;
        var ourTenant:Tenant = Simulator.getUpgradedTenant(move);
        if(!ourTenant){
            console.log("Move would result in an invalid tenant")
            return false;
        }
        if(ourTenant == Tenant.Tower && ourTerritory != move.toHex.territory){
            console.log("Can't place tower outside of our territory")
            return false;
        }
        if(ourTenant == Tenant.Tower && move.toHex.tenant != Tenant.TreePalm && move.toHex.tenant != Tenant.TreePine){
            console.log("Can't place tower on top of another unit")
            return false;
        }
        //validate cost of adding/upgradeing tenant
        var homeHex:Hex;
        if(move.newTenant){
            homeHex = homeHex || Simulator.getHomeHex(this.board, move.fromHex.territory);
            //Do we have a home hex?
            if(!homeHex){
                console.log("Could not find homeHex for fromHex territory")
                return false;
            }
            //can we afford the unit?
            if((homeHex.money||0) < Simulator.tenantCost(move.newTenant)){
                console.log("Move is too expensive");
                return false;
            }
        }
        // If this move is to a territory that isn't our own, we need to ensure the target hex
        // is adjacent to one of this territory.
        if (ourTerritory !== move.toHex.territory) {
            let adjacentHex = hexops.allNeighbors(this.board, move.toHex)
                .filter((maybeOurHex)=> maybeOurHex.territory===ourTerritory)[0]
            // We don't own any adjacent territory
            if(!adjacentHex) {
                console.log("We cannot move to a new territory unless the hex is adjacent to our territory");
                return false;
            }
        }
        //validate we are not moving on top of friendly building
        if(ourTerritory == move.toHex.territory &&
          move.toHex.tenant &&
          (move.toHex.tenant == Tenant.Tower || move.toHex.tenant == Tenant.House)){
            console.log("The target hex is occupied by a friendly building");
            return false;
        }
        // Occupied by (or adjacent to) an enemy or neutral building or unit - we need to check combat values
        if(move.toHex.team !== move.fromHex.team && !this.canDefeat(ourTenant, move.toHex)) {
            console.log("The target hex is occupied by an enemy building and we cannot beat it");
            return false;
        }
        return true;
    }

    public static upkeepForTenant(tenant:Tenant):number {
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

    public upkeepForTenant(tenant:Tenant):number {
        return Simulator.upkeepForTenant(tenant);
    }

    public nextTurn(){
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
        var canEveryoneMakeAMove = ()=>
            _.keys(_.groupBy(this.board.filter((hex)=>hex.money>=10), (hex)=>hex.team)).length >= this.game.numberOfTeams
        while (!canEveryoneMakeAMove()) {
            _.range(this.game.numberOfTeams + 1).map((i)=>this.handleUpkeep(i))
        }
    }

    public static isCoastal(board:Board, hex:Hex):boolean {
        return hexops.allNeighbors(board, hex).filter((x)=>x.team === TEAM_WATER).length > 0;
	}

    public static pickTreeForHex(board:Board, hex:Hex):Tenant {
        if (Simulator.isCoastal(board, hex))
            return Tenant.TreePalm;
        return Tenant.TreePine;
    }

    public handleTreeGrowth():void {
        // Start by converting graves to trees - palm if on coast, pine otherwise
        // Pine trees fill in triangles - if there are two in a line, they fill in the two (unoccupied) diagonals
        // Palm trees grow along coasts - any unoccupied neighbors which neighbor water will be filled

        // Now do pine tree growth
        let newPineTrees:Array<Hex> = []
        this.board.filter((hex)=>hex.tenant === Tenant.TreePine).map((hex)=>{
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
        this.board.filter((hex)=>hex.tenant === Tenant.TreePalm).map((hex)=>{
            hexops.allNeighbors(this.board, hex).map((neigh)=>{
                if (hexops.allNeighbors(this.board, neigh).filter((x)=>x.team === TEAM_WATER).length > 0)
                    newPalmTrees.push(neigh);
            });
        });

        // Apply the trees
        newPineTrees.filter((hex)=>hex.tenant === null && hex.team !== TEAM_WATER).map((hex)=>hex.tenant = Tenant.TreePine)
        newPalmTrees.filter((hex)=>hex.tenant === null && hex.team !== TEAM_WATER).map((hex)=>hex.tenant = Tenant.TreePalm)

        // Graves last
        this.board.filter((hex)=>hex.tenant === Tenant.Grave).map((hex)=>{
            hex.tenant = Simulator.pickTreeForHex(this.board, hex);
        })
    }

    private handleUpkeep(team:number):void {
        // Find all territories belonging to this team
        // Compute their income (1 for any tile not covered by TreePine or TreePalm)
        // Compute their upkeep (# coins per mob)
        // Kill all mobs (and replace with gravestones) if currency is negative

        this.fixHouses(false); //just to make sure territories are in order.
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
                    //console.log("Territory", homeHex.territory, "for team", team, "has money = ", homeHex.money, " + ", income, " - ", upkeep, " = ", newMoney);

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

    public isTree(tenant:Tenant):boolean {
        return tenant === Tenant.TreePalm || tenant === Tenant.TreePine;
    }

    public fixHouses(skipAnnotate?:boolean):void {
        // Re-annotate territories
        if(!!skipAnnotate){
            this.territories = _.values(_.groupBy(this.board.map((i)=>i), (hex)=>hex.territory)) as any;
        } else {
            this.territories = hexops.annotateTerritories(this.board);
        }
        // For each territory, if they have 0 houses, insert one at "the middle"
        // If they have >1 house, keep the house that has the most money or the first one otherwise
        this.territories.map((territory)=>{
            if (territory.length === 1) {
                if (territory[0].tenant === Tenant.House) {
                    territory[0].tenant = Simulator.pickTreeForHex(this.board, territory[0]);
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
    }

    public makeMove(move:Move, isAIMove?:boolean):boolean {
        isAIMove = !!isAIMove;
        //if the team is > 500 and this is an aimove then its simply a pass/mock move
        if(isAIMove && move.team > 500)
            return true;
        // Make sure the move is legal
        if (!this.isMoveLegal(move))
            return false;
        // save hex's current tenant
        let oldTenant:Tenant = move.toHex && move.toHex.tenant;
        // Find out which territory we're talking about
        let ourTerritory:number = move.fromHex && move.fromHex.territory;
        // Find out how much the move cost
        let moveCost:number = Simulator.tenantCost(move.newTenant);
        // If there's a friendly mob there, combine them
        let ourTenant:Tenant = Simulator.getUpgradedTenant(move);
        //store old team for later
         let oldTeam = move.toHex.team;

        // Remove the tenant from the old hex if its mobile
        if(Simulator.canMove(move.fromHex)) {
            move.fromHex.tenant = null;
        }
        // Compute if they can still move - if territories changed, they cannot move again this turn
        if (move.toHex.territory !== ourTerritory) {
            move.toHex.canMove = false;
        }
        // If this is an ai move and its not to combine we can not move (significantly reduces game tree)
        if(isAIMove && !move.toHex.tenant){
            move.toHex.canMove = false;
        }
        //if its to a tree we cant move
        if (this.isTree(move.toHex.tenant)) {
            move.toHex.canMove = false;
        }
        // Add them to the new hex
        // The new hex now belongs to our team and is in our territory
        move.toHex.tenant = ourTenant;
        move.toHex.team = move.team;
        move.toHex.territory = ourTerritory;

        // Subtract money from our house
        if (moveCost > 0) {
            Simulator.getHomeHex(this.board, move.fromHex.territory).money -= moveCost;
        }

        // If there was a house on this territory, it's gone - remove its money
        move.toHex.money = 0;

        // Reposition houses and reapportion territories
        if (this.needToFixHouses(move.toHex, oldTeam, move.toHex.team, oldTenant)){
            //update territories
            hexops.teamFloodFill(this.board, move.fromHex, move.fromHex.territory, true);
            hexops.allNeighbors(this.board, move.toHex)
                .filter((hex)=>hex.team === oldTeam)
                .forEach((hex)=>hexops.teamFloodFill(this.board, hex, hexops.nextAvailableTerritory(this.board), true));
            //fix houses
            this.fixHouses(true);
        }
        return true;
    }
}


