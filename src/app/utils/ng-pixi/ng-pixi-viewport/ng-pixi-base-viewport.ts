
import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild, Output, EventEmitter, Inject, Renderer2 } from '@angular/core';
import { ease } from 'pixi-ease';
import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, take, takeUntil } from 'rxjs/operators';
import { GeneralUtil } from '../../general/general.util';
import { canReColor, IReColor, PixiGraphics } from './ng-pixi-base-graphics';
import { PixiContainer} from './ng-pixi-base-container';
import { DRAWING_STYLE, PixiGraphicStyle} from './ng-pixi-styling-util'
import { PixiEditableMapImage } from './ng-pixi-map-graphics';
import { CLICK_END_EVENTS, CLICK_EVENTS, MOVE_EVENTS } from './ng-pixi-constants';
import { OutlineFilter } from '@pixi/filter-outline';
import { inside } from '../../math/functions';

export type ModeType =  'edit' | 'create' | 'delete' | null

class CreateModule{
    clickedPosition? : PIXI.Point
    startVertex?: PIXI.Point
    type?: any
    graphics?: PIXI.Graphics
    segments?: any[]
    draftLine?: any
    draftVertex?: any
    brushWidth?: any
    onStart : {[key: string]: Function}
    onEnd :  {[key: string]: Function}
    eventHandler: { clicked: { [key: string]: Function } }
}

export class PixiViewport extends Viewport {
    previewGraphics : PixiGraphics
    preventContextMenu = false
    clickEnd = new BehaviorSubject<any>(null)
    get zoomed(){
        return this.events.zoomed
    } 
    onDestroy = new Subject()
    settings : any = {}
    mainContainer : PixiContainer = new PixiContainer()
    APP_BUILD : 'ARCS' | 'STANDALONE'
    readonly 
    MOBILE_MODE
    _selectedGraphics : PixiGraphics = null
    _selectedGraphicsList : PixiGraphics[] = []

    public  _pixiApp
    get pixiApp() : PIXI.Application{
        return this._pixiApp
    }
    
    public _ngZone
    public _ngRenderer
    get ngZone(): NgZone{
        return this._ngZone
    }
    get ngRenderer(): Renderer2{
        return this._ngRenderer
    }

    events = {
        wheel  : new EventEmitter(),
        zoomed  : new EventEmitter(),
        clickEnd : new EventEmitter(),
        click : new EventEmitter(),
        move : new EventEmitter(),
        resized :  new EventEmitter()
    }

    ngEvents = {
        clickEnd : new EventEmitter(),
    }
    _mode : ModeType
    createData: CreateModule

    get mode (){
        return this._mode
    }
    set mode(v){
        this.mode = v
    }

    _multiSelectEnabled = false
    _multiSelectEnded = new Subject()
    get multiSelectEnabled(){
        return this._multiSelectEnabled
    }

    set multiSelectEnabled(v : boolean){
        if(v == this._multiSelectEnabled){
            return
        }
        this._multiSelectEnabled = v
        if (v) {
            this.selectedGraphics = null
            let startPosition: PIXI.Point = null
            let points = []
            let dragArea: PIXI.Graphics = new PIXI.Graphics();
            this.drag({ mouseButtons: 'right' })
            this.cursor = 'crosshair'
            this.events.click.pipe(filter(v => startPosition == null), takeUntil(this._multiSelectEnded)).subscribe((startEvt: PIXI.interaction.InteractionEvent) => {
                this.parent.addChild(dragArea)
                startPosition = startEvt.data.getLocalPosition(this.parent)
                this.events.move.pipe(filter(v => startPosition != null), takeUntil(this.events.clickEnd)).subscribe((moveEvt) => {
                    let endPosition = moveEvt.data.getLocalPosition(this.parent);
                    points = [startPosition, new PIXI.Point(endPosition.x, startPosition.y), endPosition, new PIXI.Point(startPosition.x, endPosition.y)]
                    dragArea.clear();
                    dragArea.lineStyle(1 , DRAWING_STYLE.mouseOverColor ).beginFill(DRAWING_STYLE.mouseOverColor, 0.2).drawPolygon(points).endFill();
                })
                this.events.clickEnd.pipe(filter(v => startPosition != null), take(1), takeUntil(this._multiSelectEnded)).subscribe((endEvt) => {
                    this.selectedGraphicsList = <any>this.mainContainer.children.filter(c => {
                        return c instanceof PixiGraphics && c.multiSelectable == true && inside(c.position , points.map(p=> this.mainContainer.toLocal(p)))
                    })
                    points = [];
                    dragArea.clear();
                    this.parent.removeChild(dragArea)
                    startPosition = null
                })
            })
        } else {
            this.cursor = 'default'
            this.drag()
            this._multiSelectEnded.next()
        }
    }
    
    selectedGraphicsListChange = new EventEmitter()
    set selectedGraphicsList(v : PixiGraphics[]){
        if(this._selectedGraphicsList){
            this._selectedGraphicsList.forEach(g=>g.instantDrag = false)
            this._selectedGraphicsList.filter(g=>canReColor(g)).forEach(g=>(<any>g).reColor(g?.style?.fillColor))    
        }
        this.ngZone.run(() => this._selectedGraphicsList = v)
        this._selectedGraphicsList.filter(g => canReColor(g)).forEach(g => (<any>g).reColor(DRAWING_STYLE.highlightColor))
        this._selectedGraphicsList.forEach(g=> g.instantDrag = true)
        this.selectedGraphicsListChange.emit(this._selectedGraphicsList)
    }

    get selectedGraphicsList(){
        return this._selectedGraphicsList
    }
    
    

    selectedGraphicsChange = new EventEmitter()
    graphicsUnselected = new EventEmitter()

    set selectedGraphics(gr: PixiGraphics) {
        this.ngZone.run(() => {
            if (gr == this._selectedGraphics || ((this._mode == 'create' || this.multiSelectEnabled ) && gr != null)) {
                return
            }

            if (this._selectedGraphics) {
                const emitter = this._selectedGraphics.events.unselected
                this.graphicsUnselected.emit(this._selectedGraphics)
                if (canReColor(this._selectedGraphics)) {
                    (<IReColor>this._selectedGraphics).reColor(this._selectedGraphics?.style?.fillColor)
                }
                this._selectedGraphics = gr
                emitter.emit(true)
            }
            
            this._selectedGraphics = gr

            if (gr) {
                gr.events.selected.emit(true)
                if (canReColor(gr)) {
                    (<IReColor>gr).reColor(DRAWING_STYLE.highlightColor)
                }
            }

            this.selectedGraphicsChange.emit(this.selectedGraphics)
        })
    }

    get selectedGraphics() : PixiGraphics{
        return this._selectedGraphics
    }

    


    diabled = false
    get interactiveControlRadius(){
        return 10 * DRAWING_STYLE.arrowHeadScale * (this.MOBILE_MODE? 2 : 1)
    } 
    constructor(arg : Viewport.Options  , app : PIXI.Application , ngZone : NgZone , ngRenderer : Renderer2, onDestroy : Subject<any> ,  isStandaloneApp : boolean, isMobile : boolean){
        super(arg)
        this.onDestroy = onDestroy
        this.APP_BUILD = isStandaloneApp ? 'STANDALONE' : 'ARCS'
        this.MOBILE_MODE = isMobile
        this._pixiApp = app
        this._ngZone = ngZone
        this._ngRenderer = ngRenderer;
        ['wheel', 'zoomed'].forEach(k => this.on(<any>k, (e) => this.events[k].emit(e)))
        MOVE_EVENTS.forEach(evt => this.on(<any>evt, (e) => this.events.move.emit(e)))
        CLICK_EVENTS.forEach(evt => this.on(<any>evt, (e : PIXI.interaction.InteractionEvent) => {
            this.events.click.emit(e)
        }))
        CLICK_END_EVENTS.forEach(evt => {
            this.ngRenderer.listen(document, evt, (e) => {
                this.ngEvents.clickEnd.emit(e)
            });
            this.on(<any>evt, (e) => this.events.clickEnd.emit(e));
        } )
    }
}
