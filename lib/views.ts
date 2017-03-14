/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game, Move, tenantToString } from './models'
import {debugLogHex} from './hexops';
import {Simulator} from './simulator';
import {SlaughterRuntime} from './runtime';
import {Dictionary, getGlobal} from './util';

function hexCorner(center:THREE.Vector2, size:number, i:number):THREE.Vector2 {
    size -= 2; //boarder
    var angle_deg = 60 * i;
    var angle_rad = Math.PI / 180 * angle_deg;
    return new THREE.Vector2(center.x + size * Math.cos(angle_rad),
                             center.y + size * Math.sin(angle_rad));
}

var _svgCache:Dictionary<Promise<DocumentFragment>> = {}
function getSvg(url):Promise<DocumentFragment>{
    if(_svgCache[url]){
        return _svgCache[url].then((frag:DocumentFragment)=>frag.cloneNode(true));
    }
    _svgCache[url] = new Promise((accept, reject)=>{
        Snap.load(url, (tenant)=>{
            accept(tenant.node);
        })
    });
    return getSvg(url);
}

export const HEX_RADIUS = 22;
export class HexView extends Backbone.View<Hex> {
    private _center:THREE.Vector2;
    events(){ return {
        "click":this._onHexClick,
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
        var money = s.text(this._center.x, this._center.y, '').addClass('money')
        var territory = s.text(this._center.x-15, this._center.y, '').addClass('territory')
        var ele = s.group(poly, money, territory)

        this.setElement(ele.node);
        this.listenTo(this.model, 'all', _.debounce(this.render, 10)); //debounce renders triggered by events
        this.render();
    }
    render():HexView{
        //update classes
        _.range(1, 50).forEach((i)=>this.$el.removeClass('team-'+i))
        Snap(this.el)
            .removeClass('selected-territory')
            .addClass('hex')
            .addClass('team-'+this.model.team)
            .attr({id:'hex-'+this.model.id.replace(/,/g,'_')})
        if(this.model.team !== TEAM_WATER){
            Snap(this.el).addClass('dropzone')
        }
        ////update territory
        let territoryEl = Snap(this.el).select('.territory')
        territoryEl.attr({text: this.model.territory || ''})
        //cleanup old tenant if it exsits
        this.$el.find('.sprite').remove();
        var currentTenant:Tenant = this.model.tenant;
        if(currentTenant){
            var tenantSvg:string = currentTenant && `/img/${tenantToString(currentTenant)}.svg` || null;
            //render new tenant
            if(tenantSvg){
                getSvg(tenantSvg).then((frag:DocumentFragment)=>{
                    if(currentTenant != this.model.tenant) return; //bail if tenant has changed
                    var tenant = Snap(frag as any);
                    let sprite = tenant.select('g');
                    sprite.attr({
                        'transform-origin':`${this._center.x} ${this._center.y}`,
                        'transform':`translate(${this._center.x-15} ${this._center.y-15}) scale(0.5 0.5)`,
                    })
                    //make a group to wrap sprite to isolate transforms
                    let group:Snap.Element = Snap(1,1).g(sprite)
                    group.addClass('sprite')
                    if(Simulator.isMobileUnit(this.model.tenant) && this.model.canMove){
                        group.addClass('draggable')
                        Snap(this.el).addClass('draggable-proxy')
                    }
                    //if its a house and we can buy anything
                    if(this.model.tenant == Tenant.House && this.model.money >= 10){
                        group.addClass('canbuy')
                    }
                    //add it to doc
                    Snap(this.el).add(group)
                    //re add money so it renders above
                    Snap(this.el).append(Snap(this.el).select('.money'));
                })
            }
        }
        //update money
        let moneyEl = Snap(this.el).select('.money')
        if(moneyEl && this.model.money === 0){
            moneyEl.attr({text: ''})
        } else if (moneyEl){
            moneyEl.attr({text: this.model.money.toString()})
        }
        //update selectedTerritory
        if(this.model.territory == SlaughterRuntime.instance.game.selectedTerritory){
            Snap(this.el).addClass('selected-territory')
        }
        return this;
    }
    private _makeMove(move) {
        // Make it locally
        if(SlaughterRuntime.instance.simulator.makeMove(move)){
            // And add it to the pending move set
            SlaughterRuntime.instance.game.pendingMoves.add(move);
        }
    }
    private _onHexClick(e){
        //set up some debug tools
        debugLogHex(this.model);
        window['lastHex'] = window['hex'];
        window['hex'] = this.model;
        //if we are selecting a new territory... revert currentMove
        if(this.model.team == SlaughterRuntime.instance.ourTeam &&
           this.model.territory &&
           this.model.territory != SlaughterRuntime.instance.game.selectedTerritory
        ){
            SlaughterRuntime.instance.gameView.undoService.undoCurrentMove();
            SlaughterRuntime.instance.game.selectedTerritory = this.model.territory;
        }
        var selectedTerritory:number = SlaughterRuntime.instance.game.selectedTerritory;
        //handle finish current move?
        let move:Move = SlaughterRuntime.instance.game.currentMove;
        if(move){
            move.toHex = this.model;
            SlaughterRuntime.instance.gameView.undoService.undoCurrentMove();
            this._makeMove(move);
        }
        //else handle start new move?
        else if(Simulator.canMove(this.model)){
            SlaughterRuntime.instance.game.currentMove = new Move(this.model.team, null, this.model, null);
            this.model.tenant = null;
        }
        //undoCurrentMove might undo selectedTerritory... just make sure a territory is selected in the end
        SlaughterRuntime.instance.game.selectedTerritory = selectedTerritory;
    }
}

export class SidebarView extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#sidebar'));
    }
    events(){ return {
        "click .next-turn":this._onNextTurnClick,
        "click .zoom-in":this._zoomIn,
        "click .zoom-out":this._zoomOut,
    } as Backbone.EventsHash }
    private _onNextTurnClick(e){
        SlaughterRuntime.instance.simulator.nextTurn();
        SlaughterRuntime.instance.sendMovesToServer();
    }
    private _zoom():number{
        var res =(/\(([^,]+)/).exec($('#svg-slaughter').css('transform'));
        return (res && parseFloat(res[1])) || 1;
    }
    private _zoomIn(){
        var zoom = this._zoom()+.1;
        $('#svg-slaughter').css('transform', `scale(${zoom.toFixed(1)})`)
    }
    private _zoomOut(){
        var zoom = this._zoom()-.1;
        $('#svg-slaughter').css('transform', `scale(${zoom.toFixed(1)})`)
    }
}

export class SelectedTenantView extends Backbone.View<Game>{
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#selected-tenant'))
        this._registerListeners();
        this.render();
    }
    private _registerListeners(){
        this.stopListening();
        this.listenTo(this.model, 'change:currentMove', this._registerListeners);
        this.listenTo(this.model, 'change:currentMove', this.render);
        this.listenTo(this.model.currentMove, 'all', this.render)
    }
    render():SelectedTenantView{
        if(this.model.currentMove){
            var selectedTenant:Tenant = this.model.currentMove.newTenant ||
                this.model.currentMove.fromHex && this.model.currentMove.fromHex.tenant;
        }
        if(selectedTenant){
            this.$el.removeClass('no-selection')
            this.$el.find('img').attr('src',`/img/${tenantToString(selectedTenant)}.svg`)
        } else {
            this.$el.addClass('no-selection')
        }
        return this;
    }
}

export class TeamChart extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#team-chart'))
        this.listenTo(this.model.board, 'update', this.render)
        this.listenTo(this.model, 'change:board', this.render)
        this.listenTo(this.model, 'change:currentTurn', this.render);
        this.render();
    }
    template():string{
        var totalHexes = this.model.board.filter((hex)=>hex.team!=TEAM_WATER).length
        return templates['teamChartTemplate']({
            teams: _.range(1, this.model.numberOfTeams+1),
            currentTeam: this.model.currentTeam,
            teamsPercent: _.range(1, this.model.numberOfTeams+1)
                .map((team)=>this.model.board.filter((hex)=>hex.team==team))
                .map((hexes)=>hexes.length/totalHexes*100.0)
        });
    }
    render():TeamChart{
        this.$el.html(this.template());
        return this;
    }
}

export class EconView extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#econ-view'))
        this.listenTo(this.model.board, 'update', this.render);
        this.listenTo(this.model, 'change:board', this.render);
        this.listenTo(this.model, 'change:ourTeam', this.render);
        this.listenTo(this.model, 'change:selectedTerritory', this.render);
        this.listenTo(this.model.pendingMoves, 'all', this.render);
        this.render();
    }
    render():EconView{
        this.$el.removeClass('no-selection');
        if(!this.model.selectedTerritory){
            this.$el.addClass('no-selection');
            return;
        }
        var homeHex = Simulator.getHomeHex(this.model.board, this.model.selectedTerritory);
        if(!homeHex){
            this.$el.addClass('no-selection');
            return;
        }
        var savings = homeHex.money;
        var income = this.model.board
            .filter((hex)=>hex.territory==homeHex.territory)
            .filter((hex)=>hex.tenant != Tenant.TreePalm && hex.tenant != Tenant.TreePine)
            .length
        var wages = this.model.board
                .filter((hex)=>hex.territory==homeHex.territory && !!hex.tenant)
                .map((hex)=> Simulator.upkeepForTenant(hex.tenant))
                .reduce((x,y)=>x+y, 0);
        var balance = savings + income - wages;
        this.$el.find('.savings-value').text(savings);
        this.$el.find('.income-value').text(income);
        this.$el.find('.wages-value').text(wages);
        this.$el.find('.balance-value').text(balance);
        return this;
    }
}

export class UndoService extends Backbone.View<Game>{
    private undoHistory:Array<string>;
    //kinda awkward but we only get to an event AFTER changes have happened so we have to store the current state
    private currentHistory:string;
    //if we are in an undo we want to ignore events
    private undoInProgress:boolean;
    events(){ return {
        "click":this.undo,
    } as Backbone.EventsHash }
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#undo-button'))
        this.undoHistory = [];
        //register for events that we wish to be able to undo or redo
        this.listenTo(this.model.pendingMoves, "add", this._recordState);
        this.listenTo(this.model, "change:currentTurn", this._clearHistory);
        this.listenTo(this.model, "change:currentMove", this._recordState);
        this.listenTo(this.model, "sync", this._clearHistory);
        this.render();
    }
    private _clearHistory(){
        //ignore event if it was triggered by an undo
        if(this.undoInProgress) return;
        this.undoHistory = [];
        this._recordState(false);
    }
    private _recordState(undoable:boolean){
        //ignore event if it was triggered by an undo
        if(this.undoInProgress) return;
        undoable = _.isUndefined(undoable) ? true : !!undoable;
        if (this.currentHistory && undoable){
            this.undoHistory.push(this.currentHistory);
        }
        this.currentHistory = JSON.stringify(this.model.toJSON()); //record current
        this.render();
    }
    public render():UndoService{
        this.$el
            .removeClass('disabled')
            .addClass(this.undoHistory.length?"":"disabled")
        return this;
    }
    public undo():boolean{
        var json = this.undoHistory.pop();
        if(!json) return false; //bail if there is nothing to undo
        this.undoInProgress = true;
        this.model.set(this.model.parse(JSON.parse(json)));
        this.undoInProgress = false;
        this._recordState(false);
        return true;
    }
    public undoCurrentMove():boolean{
        while (this.model.currentMove && this.undo()){}
        return true;
    }
}

export class BuildMenu extends Backbone.View<Game> {
    events(){ return {
        "click .build-peasant":_.partial(this._startBuildMove, Tenant.Peasant),
        "click .build-tower":_.partial(this._startBuildMove, Tenant.Tower),
    } as Backbone.EventsHash }
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#build-menu'))
        this.listenTo(this.model.board, 'update', this.render);
        this.listenTo(this.model, 'change:board', this.render);
        this.listenTo(this.model, 'change:ourTeam', this.render);
        this.listenTo(this.model, 'change:selectedTerritory', this.render);
        this.listenTo(this.model.pendingMoves, 'all', this.render);
        this.render();
    }
    render():BuildMenu{
        this.$el.find('.build').removeClass('can-afford');
        if(!this.model.selectedTerritory) return this; // If territory is not selected... bail
        var homeHex = Simulator.getHomeHex(this.model.board, this.model.selectedTerritory);
        var money = homeHex && homeHex.money || 0;
        if(money >= Simulator.tenantCost(Tenant.Peasant)){
            this.$el.find('.build-peasant').addClass('can-afford')
        }
        if(money >= Simulator.tenantCost(Tenant.Tower)){
            this.$el.find('.build-tower').addClass('can-afford')
        }
        return this;
    }
    private _startBuildMove(tenant:Tenant){
        if(!this.model.selectedTerritory) return this; // If territory is not selected... bail
        var homeHex = Simulator.getHomeHex(this.model.board, this.model.selectedTerritory);
        var money = homeHex && homeHex.money || 0;
        var cost = Simulator.tenantCost(tenant);
        if(money < cost) return; //bail if we cant afford
        if(this.model.currentMove){
            let currentTenant:Tenant = this.model.currentMove.newTenant || this.model.currentMove.fromHex.tenant;
            let upgradedTenant:Tenant = Simulator.combineTenants(currentTenant, tenant);
            if(!upgradedTenant) return; //bail if the tenant is not upgradeable
            if(this.model.currentMove.newTenant){
                this.model.currentMove.newTenant = upgradedTenant;
            } else {
                this.model.currentMove.fromHex.tenant = upgradedTenant;
            }
        } else {
            this.model.currentMove = new Move(this.model.currentTeam, null, homeHex, tenant);
        }
        homeHex.money -= cost;
    }
}

export class GameView extends Backbone.View<Game> {
    _hexViews:Array<HexView>
    public undoService:UndoService;
    initialize(options:Backbone.ViewOptions<Game>){
        this._hexViews = [];
        this.setElement($('#svg-slaughter'))
        new SidebarView({model:this.model});
        new TeamChart({model:this.model});
        new BuildMenu({model:this.model});
        new EconView({model:this.model});
        this.undoService = new UndoService({model:this.model});
        new SelectedTenantView({model:this.model});
        this.listenTo(this.model.board, 'update', this.render)
        this.listenTo(this.model, 'change:board', this.render)
        this.listenTo(this.model, 'change:currentTurn', this._updateCurrentTeam);
        this.listenTo(this.model, 'change:selectedTerritory', this._updateSelectedTerritory)
        this.listenTo(this.model, 'change:currentTurn', ()=>{
            this.model.selectedTerritory = null; //remove selection when turn changes
        })
        this.render();
    }
    private _updateSelectedTerritory(){
        let t1:number = this.model['_previousAttributes']['selectedTerritory']
        let t2:number = this.model.selectedTerritory
        this._hexViews
            .filter((hexView)=>hexView.model.territory == t1 || hexView.model.territory == t2)
            .forEach((hexView)=>hexView.render());
    }
    render():GameView{
        //redraw hexes
        this._hexViews.forEach((v)=>v.remove())
        this._hexViews = this.model.board
            .map((hex)=>new HexView({model: hex}))
        //set viewBox
        var bboxes = $('.hex:not(.team--1)').toArray()
            .map((e)=>Snap(e as any).getBBox());
        var left = _.min(bboxes.map((b)=>b.x));
        var top = _.min(bboxes.map((b)=>b.y));
        var right =  _.max(bboxes.map((b)=>b.x+b.width));
        var bottom = _.max(bboxes.map((b)=>b.y+b.height));
        this.$el.attr('viewBox', `${left} ${top} ${right-left} ${bottom-top}`)
        this._updateCurrentTeam();
        return this;
    }
    private _updateCurrentTeam(){
        $('.current-team').removeClass('current-team')
        $('.team-'+this.model.currentTeam).addClass('current-team')
    }
}

var global:any = getGlobal();
if (global.document) {
    // Parse all scripts with type 'text/template'.
    // Each can be accessed as template[<id>]
    var templates:Dictionary<(...data: any[]) => string> = {};
    $(document).ready(function(){
        $("script[type='text/template']").each((index, ele)=>{
            if(!ele.id){ return; }
            templates[ele.id] = _.template($(ele).html());
        });
    });
}
