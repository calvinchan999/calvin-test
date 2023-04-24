
import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild, Output, EventEmitter, Inject, Renderer2 } from '@angular/core';
import { ease } from 'pixi-ease';
import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { GeneralUtil } from '../../general/general.util';
import { canReColor, IReColor, PixiGraphics } from './ng-pixi-base-graphics';
import { PixiContainer} from './ng-pixi-base-container';
import { DRAWING_STYLE, PixiGraphicStyle} from './ng-pixi-styling-util'
import { PixiEditableMapImage } from './ng-pixi-map-graphics';
import { CLICK_END_EVENTS, CLICK_EVENTS, MOVE_EVENTS } from './ng-pixi-constants';

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
        move : new EventEmitter()
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
    

    selectedGraphicsChange = new EventEmitter()
    graphicsUnselected = new EventEmitter()

    set selectedGraphics(gr: PixiGraphics) {
        this.ngZone.run(() => {
            if (gr == this._selectedGraphics || (this._mode == 'create' && gr != null)) {
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
