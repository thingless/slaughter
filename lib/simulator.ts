const TENANT_NUMBER = {
    Tenant.Peasant: 1,
    Tenant.Spearman: 2,
    Tenant.Knight: 3,
    Tenant.Paladan: 4,
};

const NUMBER_TENANT = {
    1: Tenant.Peasant,
    2: Tenant.Spearman,
    3: Tenant.Knight,
    4: Tenant.Paladan,
}

export class Simulator {
    private board:Board = null;
    constructor(board:Board) {
        this.board = board;
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

    private getUpgradedTenant(move:Move):Tenant? {
        let newTenant = move.fromHex && move.fromHex.tenant || move.newTenant;
        if (!newTenant)
            return null;

        let oldTenant = move.toHex.tenant;

        let newTenantValue = TENANT_NUMBER[newTenant];
        let oldTenantValue = TENANT_NUMBER[oldTenant];

        if (newTenantValue === undefined || oldTenantValue === undefined)
            return null;

        let finalValue = newTenantValue + oldTenantValue;
        if (finalValue > TENANT_NUMBER[Tenant.Paladan])
            return null;

        return NUMBER_TENANT[finalValue];
    }

    private getHomeHex(move:Move):Hex? {
        // Find the hex of the house of the **player's** relevant territory for this move.
        let territory = move.fromHex && move.fromHex.territory || move.toHex.territory;

        // TODO: don't just search the whole board lol
        return this.board.filter((hex)=>hex.territory === territory && hex.tenant === Tenant.House)[0];
    }

    private isMoveLegal(move:Move):number {
        // Check the cost of the move
    }
    public makeMove(move:Move):undefined {

    }
}
