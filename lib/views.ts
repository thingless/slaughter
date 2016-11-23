/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game } from './models'

export class HexView extends Backbone.View<Hex> {
    initialize(options:Backbone.ViewOptions<Hex>){
        var ele = Snap("#svg-slaughter").polygon([300,150, 225,280, 75,280, 0,150, 75,20, 225,20])
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

