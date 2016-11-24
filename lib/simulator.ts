import * as hexops from './hexops';
import {Board, Hex, Move, Tenant, TEAM_WATER} from './models';

export class Simulator {
    private board:Board = null;
    constructor(board:Board) {
        this.board = board;
    }

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

    private combatValueToMobileTenant(cv:number):Tenant | null {
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

    private getUpgradedTenant(move:Move):Tenant | null {
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

    private getHomeHex(move:Move):Hex | null {
        // Find the hex of the house of the **player's** relevant territory for this move.
        let territory = move.fromHex && move.fromHex.territory || move.toHex.territory;

        // TODO: don't just search the whole board lol
        return this.board.filter((hex)=>hex.territory === territory && hex.tenant === Tenant.House)[0];
    }

    private isMobileUnit(tenant:Tenant):boolean {
        // Check if it's even a mobile unit
        return (tenant === Tenant.Peasant ||
                tenant === Tenant.Spearman ||
                tenant === Tenant.Knight ||
                tenant === Tenant.Paladan);
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
            }), (x)=>x);
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

        // Occupied by (or adjacent to) an enemy or neutral building or unit - we need to check combat values
        if(move.toHex.team !== move.team && !this.canDefeat(ourTenant, move.toHex)) {
            console.log("The target hex is occupied by an enemy building and we cannot beat it");
            return false;
        }

        return true;
    }

    public makeMove(move:Move):undefined {
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

        // Add them to the new hex
        move.toHex.tenant = ourTenant;

        // Compute if they can still move - if territories changed, they cannot move again this turn
        if (move.toHex.territory !== ourTerritory) {
            move.toHex.canMove = false;
        }

        // The new hex now belongs to our team and is in our territory
        move.toHex.team = move.team;
        move.toHex.territory = ourTerritory;

        // Subtract money from our house
        homeHex.money -= moveCost;

        // If there was a house on this territory, it's gone - remove its money
        // TODO: reposition the house we destroyed
        move.toHex.money = 0;

        // If we split a territory, we need to handle that by creating a house in the new territory
        // TODO: above
    }
}
