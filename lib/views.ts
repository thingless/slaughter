/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game } from './models'

function hexCorner(center:THREE.Vector2, size:number, i:number):THREE.Vector2 {
    var angle_deg = 60 * i;
    var angle_rad = Math.PI / 180 * angle_deg;
    return new THREE.Vector2(center.x + size * Math.cos(angle_rad),
                             center.y + size * Math.sin(angle_rad));
}

export class HexView extends Backbone.View<Hex> {
    initialize(options:Backbone.ViewOptions<Hex>){
        var size = 16;  // In pixels
        var width = size * 2;
        var height = Math.sqrt(3)/2 * width;

        // Convert to odd-q offset coords
        var col = this.model.loc.x;
        var row = this.model.loc.z + (this.model.loc.x - (this.model.loc.x & 1)) / 2;

        // Find the center (TODO)
        var center = new THREE.Vector2((col + 0.5) * width * 3/4, (row + 0.5) * height + (col % 2 === 1 && height / 2 || 0));

        var polyLines = [];
        for (var i = 0; i < 6; i++) {
            var corn = hexCorner(center, size, i);
            polyLines.push(corn.x);
            polyLines.push(corn.y);
        }

        var ele = Snap("#svg-slaughter").polygon(polyLines)
        this.setElement(ele.node);
        this.listenTo(this.model, 'change:team', this.render)
        this.listenTo(this.model, 'change:tenant', this.render)
        this.render();
    }
    render():HexView{
        Snap(this.el).attr({class:''})
            .addClass('hex')
            .addClass('team-'+this.model.team)
        return this;
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

