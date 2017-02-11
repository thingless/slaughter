/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game, Move } from './models'
import {debugLogHex} from './hexops';
import {Simulator} from './simulator';
import {SlaughterRuntime} from './runtime'
import {Dictionary, getGlobal} from './util'

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
        "dragend":this.render, //who knows where our sprite is? rerender
        "ondrop":this._onDrop,
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
        this.listenTo(this.model, 'change:team', this.render)
        this.listenTo(this.model, 'change:tenant', this.render)
        this.listenTo(this.model, 'change:money', this.render)
        this.listenTo(this.model, 'change:canMove', this.render)
        this.render();
    }
    render():HexView{
        //update classes
        _.range(1, 50).forEach((i)=>this.$el.removeClass('team-'+i))
        Snap(this.el)
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
        $(this.el).find('.sprite').remove();
        if(this.model.tenant){
            //get graphics for new tenant
            let svgTable:Dictionary<string> = {}
            svgTable[Tenant.Grave.toString()] = '/img/grave.svg'
            svgTable[Tenant.House.toString()] = '/img/house.svg'
            svgTable[Tenant.Knight.toString()] = '/img/knight.svg'
            svgTable[Tenant.Paladan.toString()] = '/img/paladan.svg'
            svgTable[Tenant.Peasant.toString()] = '/img/peasant.svg'
            svgTable[Tenant.Spearman.toString()] = '/img/spearman.svg'
            svgTable[Tenant.Tower.toString()] = '/img/tower.svg'
            svgTable[Tenant.TreePine.toString()] = '/img/treepine.svg'
            svgTable[Tenant.TreePalm.toString()] = '/img/treepalm.svg'
            var tenantSvg:string = svgTable[this.model.tenant] || null
            //render new tenant
            if(tenantSvg){
                getSvg(tenantSvg).then((frag:DocumentFragment)=>{
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
        return this;
    }
    private _makeMove(move) {
        // Make it locally
        SlaughterRuntime.instance.simulator.makeMove(move);

        // And add it to the pending move set
        SlaughterRuntime.instance.pendingMoves.add(move);
    }
    private _onHexClick(e){
        debugLogHex(this.model);
        window['lastHex'] = window['hex'];
        window['hex'] = this.model;
        if (e.button === 1) { // middle mouse, insert a peasant or tower (with shift)
            if (e.shiftKey)
                this._makeMove(new Move(this.model.team, this.model, null, Tenant.Tower));
            else
                this._makeMove(new Move(this.model.team, this.model, null, Tenant.Peasant));
        }
    }
    private _onDrop(event){
        let fromHexId:string = event.detail.from.id.split("hex-")[1].replace(/_/g, ",")
        let fromHex:Hex = SlaughterRuntime.instance.board.get(fromHexId)
        this._makeMove(new Move(fromHex.team, this.model, fromHex, null))
        this.render() //need to update ourselfs
    }
}

/*
export class MenuView extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#menu'))
        this.listenTo(this.model.board, 'update', this.render)
        this.listenTo(this.model, 'change:board', this.render)
        this.listenTo(this.model, 'change:currentTurn', this.render);
        this.render();
    }
    events(){ return {
        "click .nextTurn":this._onNextTurnClick,
    } as Backbone.EventsHash }
    menuTemplate():string{
        return templates['menutemplate']({
            team: this.model.currentTeam
        });
    }
    private _onNextTurnClick(e){
        SlaughterRuntime.instance.simulator.nextTurn();
        SlaughterRuntime.instance.sendMovesToServer();
    }
    render():MenuView{
        this.$el.html(this.menuTemplate());
        return this;
    }
}
*/

export class GameView extends Backbone.View<Game> {
    _hexViews:Array<HexView>
    initialize(options:Backbone.ViewOptions<Game>){
        this._hexViews = [];
        this.setElement($('#svg-slaughter'))
        //new MenuView({model:this.model});
        this.listenTo(this.model.board, 'update', this.render)
        this.listenTo(this.model, 'change:board', this.render)
        this.listenTo(this.model, 'change:currentTurn', this._updateCurrentTeam);
        this.render();
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

//we use interact.js to do drag and drop. This function reg/configs interact.js
export function setupDraggable(){
  interact('.current-team.draggable-proxy').on('down', function (event) {
    var interaction = event.interaction,
        handle = event.currentTarget;
    var draggable = $(handle).find('.draggable')[0];
    if(draggable){
       interaction.start({name:'drag'}, interact('.current-team .draggable'), draggable);
    }
  });

  interact('.current-team .draggable').draggable({
    inertia: false, //enable inertial throwing
    // keep the element within the area of it's parent
    restrict: {
      restriction: "parent",
      endOnly: true,
      elementRect: { top: 0, left: 0, bottom: 1, right: 1 }
    },
    autoScroll: true, // enable autoScroll
    onstart: function name(event:Interact.InteractEvent) {
        //SVG does not support ZIndex so we hack it in by reordering nodes
        var hex = $(event.target).closest('.hex')[0];
        $(hex).parent().append(hex);
        event.target.classList.add('drag-active')
    },
    // call this function on every dragmove event
    onmove: function (event:Interact.InteractEvent) {
        //get scaling factor
        var dims:Array<number> = $('#svg-slaughter')
            .attr('viewBox')
            .split(/\s+/gi)
            .slice(2)
            .map(parseFloat);
        var scaleFactor = _.min([
            $('#svg-slaughter').width()/dims[0],
            $('#svg-slaughter').height()/dims[1],
        ]);
        // keep the dragged position in the data-x/data-y attributes
        var target = event.target;
        var x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx/scaleFactor;
        var y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy/scaleFactor;
        // translate the element
        target.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        // update the posiion attributes
        target.setAttribute('data-x', x);
        target.setAttribute('data-y', y);
    },
    // call this function on every dragend event
    onend: function (event:Interact.InteractEvent) {
        event.target.classList.add('drag-active')
        event.target.dispatchEvent(new CustomEvent('dragend',{ bubbles:true }))
    }
  });

  interact('.dropzone').dropzone({
    //accept: '#yes-drop',
    overlap: 0.51, // Require a 75% element overlap for a drop to be possible
    // listen for drop related events:
    ondropactivate: function (event) {
        // add active dropzone feedback
        event.target.classList.add('drop-active');
    },
    ondragenter: function (event) {
        var draggableElement = event.relatedTarget,
            dropzoneElement = event.target;
        // feedback the possibility of a drop
        dropzoneElement.classList.add('drop-target');
        draggableElement.classList.add('can-drop');
    },
    ondragleave: function (event) {
        // remove the drop feedback style
        event.target.classList.remove('drop-target');
        event.relatedTarget.classList.remove('can-drop');
    },
    ondrop: function (event) {
        event.target.dispatchEvent(new CustomEvent('ondrop',{
            bubbles:true,
            detail:{
                to:$(event.target).closest('.hex')[0],
                from:$(event.relatedTarget).closest('.hex')[0],
            }
        }))
    },
    ondropdeactivate: function (event) {
        // remove active dropzone feedback
        event.target.classList.remove('drop-active');
        event.target.classList.remove('drop-target');
    }
  });
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
