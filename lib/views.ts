/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game, Dictionary } from './models'

function hexCorner(center:THREE.Vector2, size:number, i:number):THREE.Vector2 {
    size -= 2; //boarder
    var angle_deg = 60 * i;
    var angle_rad = Math.PI / 180 * angle_deg;
    return new THREE.Vector2(center.x + size * Math.cos(angle_rad),
                             center.y + size * Math.sin(angle_rad));
}

export const HEX_RADIUS = 22;
export class HexView extends Backbone.View<Hex> {
    private _center:THREE.Vector2;
    events(){ return {
        "click":this._onHexClick
    } as Backbone.EventsHash }
    initialize(options:Backbone.ViewOptions<Hex>){
        var size = HEX_RADIUS;  // In pixels
        var width = size * 2;
        var height = Math.sqrt(3)/2 * width;

        // Convert to odd-q offset coords
        var col = this.model.loc.x;
        var row = this.model.loc.z + (this.model.loc.x - (this.model.loc.x & 1)) / 2;

        // Find the center (TODO)
        this._center = new THREE.Vector2((col + 0.5) * width * 3/4, (row + 0.5) * height + (col % 2 === 1 && height / 2 || 0));

        var polyLines = [];
        for (var i = 0; i < 6; i++) {
            var corn = hexCorner(this._center, size, i);
            polyLines.push(corn.x);
            polyLines.push(corn.y);
        }

        var s = Snap("#svg-slaughter")
        var poly = s.polygon(polyLines)
        var ele = s.group(poly)

        this.setElement(ele.node);
        this.listenTo(this.model, 'change:team', this.render)
        this.listenTo(this.model, 'change:tenant', this.render)
        this.render();
    }
    render():HexView{
        Snap(this.el)
            .attr({class:''})
            .addClass('hex')
            .addClass('team-'+this.model.team)
        //cleanup old tenant if it exsits
        Snap(this.el).filter('g').remove()
        if(this.model.tenant){
            //get graphics for new tenant
            let svgTable:Dictionary<string> = {}
            svgTable[Tenant.Grave.toString()] = '/img/grave.svg'
            svgTable[Tenant.House.toString()] = '/img/taxman.svg'
            svgTable[Tenant.Knight.toString()] = '/img/knight.svg'
            svgTable[Tenant.Paladan.toString()] = '/img/paladan.svg'
            svgTable[Tenant.Peasant.toString()] = '/img/peasant.svg'
            svgTable[Tenant.Spearman.toString()] = '/img/spearman.svg'
            svgTable[Tenant.Tower.toString()] = '/img/tower.svg'
            var tenantSvg:string = svgTable[this.model.tenant] || null
            //render new tenant
            if(tenantSvg){
                Snap.load(tenantSvg, (tenant:Snap.Element)=>{
                    tenant = tenant.select('g')
                    tenant.attr({
                        'transform-origin':`${this._center.x} ${this._center.y}`,
                        'transform':`translate(${this._center.x} ${this._center.y}) scale(0.25 0.25)`,
                    })
                    Snap(this.el).add(tenant)
                }, this)
            }
        }
        return this;
    }
    _onHexClick(){
        window['hex'] = this.model;
    }
}

export class GameView extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#svg-slaughter'))
        this.model.board.forEach(this._onHexAdded.bind(this))
        this.listenTo(this.model.board, 'add', this._onHexAdded)
    }
    private _onHexAdded(hex:Hex){
        var snap = Snap(this.el).attr({'id':"svg-slaughter"})
        new HexView({model: hex})
    }

    //render():GameView{
    //}
}

