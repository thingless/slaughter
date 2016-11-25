/// <reference path="../typings/index.d.ts" />
import { Hex, Tenant, Board, TEAM_WATER, Game, Dictionary, Move } from './models'
import {debugLogHex} from './hexops';
import {Simulator} from './simulator'

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
        var ele = s.group(poly, money)

        this.setElement(ele.node);
        this.listenTo(this.model, 'change:team', this.render)
        this.listenTo(this.model, 'change:tenant', this.render)
        this.listenTo(this.model, 'change:money', this.render)
        this.render();
    }
    render():HexView{
        Snap(this.el)
            .attr({class:''})
            .addClass('hex')
            .addClass('team-'+this.model.team)
            .attr({id:'hex-'+this.model.id.replace(/,/g,'_')})
        if(this.model.team !== TEAM_WATER){
            Snap(this.el).addClass('dropzone')
        }
        //update money
        let moneyEl = Snap(this.el).select('.money')
        if(moneyEl && this.model.money === 0){
            moneyEl.attr({text: ''})
        } else if (moneyEl){
            moneyEl.attr({text: this.model.money.toString()})
        }
        //cleanup old tenant if it exsits
        $(this.el).find('.sprite').remove();
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
            svgTable[Tenant.TreePine.toString()] = '/img/axeman.svg'
            svgTable[Tenant.TreePalm.toString()] = '/img/axeman.svg'
            var tenantSvg:string = svgTable[this.model.tenant] || null
            //render new tenant
            if(tenantSvg){
                Snap.load(tenantSvg, (tenant:Snap.Element)=>{
                    let sprite = tenant.select('g')
                    sprite.attr({
                        'transform-origin':`${this._center.x} ${this._center.y}`,
                        'transform':`translate(${this._center.x} ${this._center.y}) scale(0.25 0.25)`,
                    })
                    //make a group to wrap sprite to isolate transforms
                    let group:Snap.Element = Snap(1,1).g(sprite)
                    group.addClass('sprite')
                    if(Simulator.isMobileUnit(this.model.tenant) && this.model.canMove){
                        group.addClass('draggable')
                    }
                    //add it to doc
                    Snap(this.el).add(group)
                }, this)
            }
        }
        return this;
    }
    private _onHexClick(e){
        debugLogHex(this.model);
        window['lastHex'] = window['hex'];
        window['hex'] = this.model;
        if (e.button === 1) { // middle mouse, insert a peasant
            window['sim'].makeMove(new Move(this.model.team, this.model, null, Tenant.Peasant));
        }
    }
    private _onDrop(event){
        let fromHexId:string = event.detail.from.id.split("hex-")[1].replace(/_/g, ",")
        let fromHex:Hex = window['sim'].board.get(fromHexId)
        window['sim'].makeMove(new Move(fromHex.team, this.model, fromHex, null))
        this.render() //need to update ourselfs
    }
}

export class GameView extends Backbone.View<Game> {
    initialize(options:Backbone.ViewOptions<Game>){
        this.setElement($('#svg-slaughter'))
        this.model.board.forEach(this._onHexAdded.bind(this))
        let bbox = Snap($('.hex').last()[0] as any).getBBox()
        this.$el.width(bbox.x+bbox.width)
        this.$el.height(bbox.y+bbox.height)
        this.listenTo(this.model.board, 'add', this._onHexAdded)
    }
    private _onHexAdded(hex:Hex){
        var snap = Snap(this.el).attr({'id':"svg-slaughter"})
        new HexView({model: hex})
    }

    //render():GameView{
    //}
}

//we use interact.js to do drag and drop. This function reg/configs interact.js
export function setupDraggable(){
  interact('.draggable').draggable({
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
        var target = event.target,
        // keep the dragged position in the data-x/data-y attributes
        x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx,
        y = (parseFloat(target.getAttribute('data-y')) || 0) + event.dy;
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
    overlap: 0.75, // Require a 75% element overlap for a drop to be possible
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
