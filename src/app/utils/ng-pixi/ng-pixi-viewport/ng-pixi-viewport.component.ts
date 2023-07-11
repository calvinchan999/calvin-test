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
import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild, Output, EventEmitter, Inject, Renderer2 } from '@angular/core';
import { ease } from 'pixi-ease';
import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from '../../general/general.util';
import {DRAWING_STYLE, PixiGraphicStyle} from './ng-pixi-styling-util'
import {PixiMapViewport} from './ng-pixi-map-viewport'
import { PixiViewport} from './ng-pixi-base-viewport'
import { CLICK_END_EVENTS, CLICK_EVENTS, MOVE_EVENTS } from './ng-pixi-constants';


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
    @Input() popupScreen
    @Input() fullScreen
    @Output() cursorMove = new EventEmitter()
    @Output() clickEnd = new EventEmitter()
    @Output() zoomed = new EventEmitter()
    @Output() onDestroy = new Subject()
    @Input() forMaps = true


    private _size = null;
    public viewport: PixiViewport;
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
        private util : GeneralUtil,
        private uiSrv : UiService,
        private ngRenderer : Renderer2
        // private _changeDetectorRef: ChangeDetectorRef
    ) {
    
        this._ngZone.runOutsideAngular(() => {            
            this.app = new PIXI.Application({
                antialias: true,
                resolution: 2,//window.devicePixelRatio || 1,
                autoDensity: true,
                transparent: true     
            });

            if(this.forMaps){
                this.viewport = new PixiMapViewport({
                    screenWidth: 400,
                    screenHeight: 400,
                    worldHeight: 400,
                    worldWidth: 400,
                    interaction: this.app.renderer.plugins.interaction,
                    passiveWheel: true,
                } , this.app , this._ngZone, this.ngRenderer, this.onDestroy ,  this.util.config.METER_TO_PIXEL_RATIO , this.util.standaloneApp , this.uiSrv.isTablet);
                this.viewport.onDestroy = this.onDestroy
            }else{
                this.viewport = new PixiViewport({
                    screenWidth: 400,
                    screenHeight: 400,
                    worldHeight: 400,
                    worldWidth: 400,
                    interaction: this.app.renderer.plugins.interaction,
                    passiveWheel: true,
                } , this.app , this._ngZone , this.ngRenderer , this.onDestroy ,  this.util.config.METER_TO_PIXEL_RATIO , this.util.standaloneApp );
                this.viewport.onDestroy = this.onDestroy
            }
        });
    }

    @HostListener('window:resize', ['$event'])
    onResize(event = null) {
        if (!!this._size && this.size && !this.popupScreen && !this.fullScreen) {
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
        this.viewport.interactive = true
        MOVE_EVENTS.forEach(t => this.viewport.on(<any>t, (evt) => this.cursorMove.emit(evt)))
        CLICK_END_EVENTS.forEach(t => this.viewport.on(<any>t, (evt) => this.clickEnd.emit(evt)))
        this.viewport.zoomed.pipe(takeUntil(this.onDestroy)).subscribe(e=>this.zoomed.emit(e))
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
        viewport.events.resized.emit({width : width , height : height});
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


