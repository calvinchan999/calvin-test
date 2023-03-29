/* -- BEGIN LICENSE BLOCK ----------------------------------------------
  (c) Copyright 2018 FZI Forschungszentrum Informatik, Karlsruhe, Germany

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
  IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
  FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
  CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
  WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
-- END LICENSE BLOCK ------------------------------------------------*/

import {
    AfterViewInit,
    Component,
    ElementRef,
    HostListener,
    Input,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
    Output,
    EventEmitter
} from '@angular/core';
import { ease } from 'pixi-ease';
import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';



@Component({
    selector: 'ng-pixi-viewport',
    templateUrl: './ng-pixi-viewport.component.html',
    styleUrls: ['./ng-pixi-viewport.component.scss'],
    providers: [
    ]
})
export class NgPixiViewportComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild('stageWrapper') wrapper: ElementRef;
    @ViewChild('stageDiv') stageDiv: ElementRef;
    @Input() fullScreen
    @Output() cursorMove = new EventEmitter()
    @Output() clickEnd = new EventEmitter()
    @Output() zoomed = new EventEmitter()
    @Output() onDestroy = new Subject()
    moveEvts = ['touchmove', 'mousemove']
    clickEndEvts = ['touchend', 'mouseup']

    private _size = null;
    public viewport: Viewport;
    public app: PIXI.Application;

    @Input() set size(value: { width: number, height: number }) {
        this._size = Object.assign({}, value);
        this.resizeViewport(value.width, value.height)
    }

    @Input() transparent = false

    @Input() set background(color: number | undefined) {
        if (!!color) {
            this.app.renderer.backgroundColor = color;
        } else {
            this.app.renderer.transparent = true;
        }
    }


    constructor(
        private _ngZone: NgZone,
        // private _changeDetectorRef: ChangeDetectorRef
    ) {
    
        this._ngZone.runOutsideAngular(() => {
            this.app = new PIXI.Application({
                antialias: true,
                resolution: window.devicePixelRatio || 1,
                autoDensity: true,
                transparent: true     
            });

            this.viewport = new Viewport({
                screenWidth: 400,
                screenHeight: 400,
                worldHeight: 400,
                worldWidth: 400,
                interaction: this.app.renderer.plugins.interaction,
                passiveWheel: true,
            });
            this.viewport.on('zoomed',()=>this.zoomed.next(true))
        });
    }

    @HostListener('window:resize', ['$event'])
    onResize(event = null) {
        if (!!this._size && this.size && !this.fullScreen) {
            this.resizeViewport(this.size.width, this.size.height);
        } else {
            this.resizeViewport(this.wrapper.nativeElement.offsetWidth, this.wrapper.nativeElement.offsetHeight);
        }
    }

    ngOnInit() {
        this._ngZone.runOutsideAngular(() => {
            this.app.stage.interactive = true;
            this.viewport.interactive = true;
            this.app.stage.addChild(this.viewport);
            this.app.start();
        });
        this._ngZone.onUnstable.subscribe(() => { /*console.log('Ng zone triggered')*/ } );
    }


    ngOnDestroy() {
        this.onDestroy.next()
        // this.viewport.viewport.removeChildren();
        this.stageDiv.nativeElement.removeChild(this.app.view);
        this.app.stage.removeChildren();
        this.viewport.removeChildren();
        // this.app.stop();
        // this.app.destroy();
        // this.app.destroy(true, {children: true, texture: true, baseTexture: true})
    }



    ngAfterViewInit(): void {
        // this.viewport.viewport.moveCenter(0, 0);
        setTimeout(() => {
            // this.resizeViewport(window.innerWidth, window.innerHeight);
            this.onResize(null);
        }, 200);
        this.viewport.drag(<any>{ clampWheel: true });
        this.viewport.pinch();
        this.viewport.decelerate();
        this.viewport.wheel({ smooth: 3 });
        this.stageDiv.nativeElement.appendChild(this.app.view);
        // this.viewport.interactive = true
        // this.moveEvts.forEach(t => this.viewport.on(<any>t, (evt) => this.cursorMove.emit(evt)))
        // this.clickEndEvts.forEach(t => this.viewport.on(<any>t, (evt) => this.clickEnd.emit(evt)))
    }

    resizeViewport(width: number, height: number) {
        if(width == 0 || height == 0){
            return
        }
        const center = this.viewport.center.clone();
        // console.log('Resizing to', width, height);
        const viewport = this.viewport;
        const app = this.app;
        viewport.resize(width, height);
        app.renderer.resize(width, height);
        // this.viewport.moveCenter(0, 0);
    }

    flyTo(x: number, y: number, duration = 500 ) {   
        if(duration == 0){            
           this.viewport.moveCenter(x, y)
        }else{
            const center = new PIXI.Point().copyFrom(this.viewport.center);
            const scale = new PIXI.Point().copyFrom(this.viewport.scale);
            let a = { x: center.x, y: center.y, scale: scale };
            const e = ease.add(a, { x: x, y: y, scale: 1 }, { duration: duration, ease: 'easeOutQuad' });
            e.on('each', () => {
                // this.viewport.scale.set(a.scale.x, a.scale.y);
                this.viewport.moveCenter(a.x, a.y);
            });
        }
    }
}

const DEFAULT_STYLE = {
    position : new PIXI.Point(0, 0),
    fillColor : 0x0000000 ,
    zIndex : 1,
    opacity : 1,
    lineColor : 0x0000000 , 
    lineThickness : 2
}

export class PixiGraphicStyle{
    public baseGraphics : PIXI.Graphics
    public opacity : number;
    public fillColor: number;
    public position : PIXI.Point;
    public zIndex : number;
    public lineThickness : number;
    public lineColor : number;

    constructor(parentGraphics = new PIXI.Graphics(), pos = new PIXI.Point(0, 0), fillColor = DEFAULT_STYLE.fillColor, zIndex = DEFAULT_STYLE.zIndex, alpha = DEFAULT_STYLE.opacity, lineColor = DEFAULT_STYLE.lineColor, lineThickness = DEFAULT_STYLE.lineThickness, clone = false) {
        this.baseGraphics = parentGraphics
        this.opacity = alpha
        this.fillColor = fillColor
        this.position = pos
        this.zIndex = zIndex
        this.lineColor = lineColor
        this.lineThickness = lineThickness
        if (!clone) {
            this.baseGraphics['graphicStyle'] = this
        }
    }

    set(property : 'baseGraphics' | 'opacity' | 'fillColor' | 'position' | 'zIndex' | 'lineThickness' | 'lineColor' , value : any){
        this[property] = <any>value  === undefined ? DEFAULT_STYLE[property] : <any>value 
        // console.log( <any>value )
        // console.log(property)
        // console.log(this)
        return this
    }

    setProperties(properties: { baseGraphics?: PIXI.Graphics, opacity?: number, fillColor?: number, position?: PIXI.Point, zIndex?: number, lineThickness?: number, lineColor?: number }) {
        Object.keys(properties).forEach(k=>{            
            this[k] = properties[k]  === undefined ? 
                (k == 'baseGraphics' ? new PIXI.Graphics() : 
                    ( k == 'position' ? new PIXI.Point(0, 0): 
                        DEFAULT_STYLE[k])) :
                <any>properties[k] ;
        })
        return this
    }

    clone(){
      return new PixiGraphicStyle(this.baseGraphics , new PIXI.Point(this.position.x, this.position.y) , this.fillColor , this.zIndex , this.opacity , this.lineColor , this.lineThickness , true)
    }
}
  

export class PixiGraphics extends PIXI.Graphics {
    _isRelativeScale
    _refreshScaleSubscription : Subscription
    public style : PixiGraphicStyle;
    set isRelativeScale(v){
        if(!this._isRelativeScale && v){
            this._refreshScaleSubscription = this.viewport.zoomed.pipe(filter(v => v != null), takeUntil(this.viewport.onDestroy), debounceTime(25)).subscribe(() => {
                this.refreshScale()
            })
        }else if(this._refreshScaleSubscription && !v){
            this._refreshScaleSubscription.unsubscribe()
        }
        this._isRelativeScale = v
    }
    get isRelativeScale(){
        return this._isRelativeScale
    }
    draggable
    viewport
    constructor(viewport: NgPixiViewportComponent) {
        super()
        this.viewport = viewport
    }
    refreshScale(){
        this.scale.set( 1/ ((this.parent? this.parent.scale.x : 1) *   this.viewport ._ngPixi.viewport.scale.x ))
    } 
}

export class PixiGeometry extends PixiGraphics{
    public vertices : PIXI.Point[]
    public type : 'circle' | 'line'
}

export class PixiCircle extends PixiGeometry{
    public radius : number
    public center : PIXI.Point
    constructor(p: PIXI.Point, radiusPx = 20, style = null , viewport : NgPixiViewportComponent = null , isRelativeScale = false){
        super(viewport)
        this.isRelativeScale = isRelativeScale
        this.style = style
        this.lineStyle(style.lineThickness, style.lineColor).beginFill(style.fillColor, style.opacity).drawCircle(p.x, p.y, radiusPx).endFill();
        this.type = 'circle'
        this.center = p
        this.vertices = this.vertices ? this.vertices : [p];
        this.radius = this.radius ? this.radius : radiusPx;
        this.zIndex = style.zIndex;
        this.isRelativeScale = isRelativeScale
    }
}

