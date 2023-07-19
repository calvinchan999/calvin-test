import { Subject } from 'rxjs'
import {ModeType, PixiViewport} from './ng-pixi-base-viewport'
import { PixiPath, PixiWayPoint, PixiMapContainer, PixiEditableMapImage, PixiBuildingPolygon, PixiRosMapOriginMarker, PixiTaskPath, PixiMapGraphics, PixiEventMarker, PixiRegionPolygon } from './ng-pixi-map-graphics'
import { DRAWING_STYLE, PixiGraphicStyle } from './ng-pixi-styling-util'
import { filter, take, takeUntil } from 'rxjs/operators'
import { NgZone , EventEmitter, Renderer2 } from '@angular/core'
import { type } from 'os'
import { PixiCircle, PixiEditablePolygon, PixiLine } from './ng-pixi-base-graphics'
import { ConvertColorToDecimal } from '../../graphics/style'
import { getLocalStorage, setLocalStorage } from '../../general/general.util'
import * as PIXI from 'pixi.js';
import { start } from 'repl'
import { DataModule } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component'
import { DropListRobot } from 'src/app/services/data.models'

export const DEFAULT_WAYPOINT_NAME = "WAYPOINT"
export const DEFAULT_REGION_NAME = "REGION"


type CreateType = 'point' | 'polygon' | 'line' | 'localize' | 'pickLoc' | 'brush' | 'arrow_bi_curved' | 'arrow_bi' | 'arrow' | 'arrow_curved'
type EditType = 'resize' | 'move' | 'rotate' | 'vertex' | 'bezier'
export type PolygonType = 'building' | 'region' | null

class EditModule{ // TO BE DELETED
    type?: any
    graphics?: any
    startPoint?: any
    startPosition?: any
    originalWidth?: any
    originalHeight?: any
}

class CreateModule{
    clickedPosition? : PIXI.Point
    startVertex?: PIXI.Point
    type?: CreateType
    graphics?: PIXI.Graphics
    segments?: any[]
    draftLine?: any
    draftVertex?: any
    brushWidth?: any
    onStart : {[key: string]: Function}
    onEnd :  {[key: string]: Function}
    eventHandler: { clicked: { [key: string]: Function } }
}

export class PixiMapViewport extends PixiViewport{
    METER_TO_PIXEL_RATIO : number
    settings : {showRobot : boolean , mapTransformedScale : number , waypointEditable : boolean , polygonType : PolygonType} = {
        showRobot : false,
        mapTransformedScale : null,
        waypointEditable : false,
        polygonType : null
    }    

    createdGraphics = {
        line : [] ,
        brush : [] , 
        polygon : []
    }

    toggleModule = {
        flags : {
            showRosMap : false,
            showWaypoint : true,
            showWaypointName : true,
            showPath : false,
            darkMode : true,
            showPoseDeviation : false,
            alert : true,
            showGridLine : false
        },
        updateLocalStorage:()=>{
            let storedFlags = getLocalStorage('uitoggle') ?  JSON.parse(getLocalStorage('uitoggle')) : {};
            Object.keys(this.toggleModule.flags).forEach(k=> storedFlags[k] =  this.toggleModule.flags[k])
            setLocalStorage('uitoggle' , JSON.stringify(storedFlags)) //SHARED BY 2D and 3D viewport
        }
        
    }

   

    public mapContainerStore : {[key : string] : PixiMapContainer} = {};
    public mapLayerStore : {[key : string] : PixiEditableMapImage} = {};
    onModeChange = new EventEmitter<{mode : ModeType , data : CreateModule | EditModule }>()

    get mode (){
        return this._mode
    }
    set mode(v){
        // if(v === this.mode){
        //     return 
        // }
        if ((this.mode == 'edit' && v != 'edit' ) || this.mode === undefined) {
            this._editEnded.next()
            this._editEnded = new Subject()
            this.editData = {
                type: null,
                graphics: null,
                startPoint: null,
                startPosition: null,
                originalWidth: null,
                originalHeight: null
            }            
        }
        if ((this.mode == 'create' && v != 'create') || this.mode === undefined) {
            this._createEnded.next()
            this._createEnded = new Subject()
            this.createData = {
                type: null,
                startVertex: null,
                draftVertex: null,
                draftLine: null,
                segments: [],
                graphics: null,
                brushWidth: null,
                onStart : {
                    arrow_curved : ()=> this.listenPathCreate(),
                    arrow_bi : ()=> this.listenPathCreate(),
                    arrow_bi_curved : ()=> this.listenPathCreate(),
                    arrow : ()=> this.listenPathCreate(),
                    polygon : ()=> this.listenPolygonCreate(),
                    line : ()=>this.listenLineCreate(),
                    brush : ()=>this.listenBrushCreate(),
                },
                onEnd : {},
                eventHandler : {
                    clicked : {
                        point: (evt) => this.createPoint(evt) 
                    }
                }
            }
        }
        this._mode = v
        this.onModeChange.emit({
            mode : this._mode,
            data : this._mode == 'edit' ? this.editData : (this._mode == 'create' ? this.createData : null)
        })
    }

    get interactiveControlRadius(){
        return 10 * DRAWING_STYLE.arrowHeadScale * (this.MOBILE_MODE ? 2 : 1)
    }
    private _createEnded = new Subject()
    private _editEnded = new Subject()

    editData: EditModule
   

    selectedStyle = {
        line: { width: 5, color: "#000000", opacity: 1 },
        brush: { size: 20, color: "#000000", opacity: 1 },
        polygon: { color: "#000000", opacity: 1 },
        arrow: { color: "#1e90ff", opacity: 1 },
        marker: { color: "#5f259f", opacity: 1 },
        markerLight: { color: "#cbacec", opacity: 1 },
    }
    point = { type: 'waypoint' }

    get allPixiTaskPaths(): PixiTaskPath[] {
        return this.mainContainer.children.filter(c => c instanceof PixiTaskPath).map(c => <PixiTaskPath>c)
    }
    get allPixiWayPoints(): PixiWayPoint[] {
        return this.mainContainer.children.filter(c => c instanceof PixiWayPoint).map(c => <PixiWayPoint>c)
    };
    get allPixiPolygons(): PixiBuildingPolygon[] {
        return this.mainContainer.children.filter(c => c instanceof PixiBuildingPolygon).map(c => <PixiBuildingPolygon>c)
    };
    get allPixiPaths(): PixiPath[] {
        return this.mainContainer.children.filter(c => c instanceof PixiPath).map(c => <PixiPath>c)
    }
    get pixiRosMapOriginMarker(): PixiRosMapOriginMarker {
        return this.mainContainer.children.filter(c => c instanceof PixiRosMapOriginMarker).map(c => <PixiRosMapOriginMarker>c)?.[0]
    }
    get allPixiEventMarkers() : PixiEventMarker[]{
        return this.mainContainer.children.filter(c => c instanceof PixiEventMarker).map(c => <PixiEventMarker>c)
    }
    get selectedPixiPaths() : PixiPath[]{
        let ret = []
        this.selectedGraphicsList.filter(g=>g instanceof PixiWayPoint).forEach((point:PixiWayPoint)=> {
            point.link.map(l=>l.arrow).forEach(path=>{
                ret = ret.filter(p=>path!=p).concat([path])
            })
        })
        return ret
    }
    get allPixiRegions(): PixiRegionPolygon[] {
        return this.mainContainer.children.filter(c => c instanceof PixiRegionPolygon).map(c => <PixiRegionPolygon>c)
    };

    constructor(arg : Viewport.Options , app : PIXI.Application, ngZone : NgZone,  ngRenderer : Renderer2, onDestroy : Subject<any> , METER_TO_PIXEL_RATIO : number , isStandaloneApp : boolean , isMobile : boolean , dataModule : DataModule = null){
        super(arg , app , ngZone , ngRenderer , onDestroy , isStandaloneApp , isMobile , dataModule)
        this.METER_TO_PIXEL_RATIO = METER_TO_PIXEL_RATIO
        this.mode = null // init createData & editData
    }

    startEdit(type: EditType, gr: PIXI.Graphics, evt) {
        this.editData.type = type,
        this.editData.graphics = gr
        this.editData.startPoint = new PIXI.Point(evt.data.getLocalPosition(this.mainContainer).x, evt.data.getLocalPosition(this.mainContainer).y)
        this.editData.startPosition = new PIXI.Point(gr.position.x, gr.position.y)
        this.editData.originalWidth = gr.width
        this.editData.originalHeight = gr.height
        this.mode = null
        this.mode = 'edit'
        // this.clickEndEvts.forEach(t => this.mouseUpListenerObj[t] = this.renderer.listen(document, t, () => this.endEdit()))
    }

    startCreate(type: CreateType) {
        this.ngZone.run(() => {
            this.mode = null
            this.mode = 'create'
            this.selectedGraphics = null
            this.createData.type = type
            this._createEnded = new Subject()
            this.mainContainer.events.click.pipe(takeUntil(this._createEnded)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
                this.createData.clickedPosition = evt.data.getLocalPosition(this.mainContainer)
                if (this.createData.eventHandler.clicked[type]) {
                    this.createData.eventHandler.clicked[type](evt)
                }
            })
            if (this.createData.onStart[type]) {
                this.createData.onStart[type]()
            }
        })
    }

    undoCreate(type: 'brush' | 'line') {
        const existingCreateds = this.createdGraphics[type].filter(g => this.mainContainer.children.includes(g))
        const lastCreated = existingCreateds[existingCreateds.length - 1]
        lastCreated?.parent?.removeChild(lastCreated)
        this.createdGraphics[type] = existingCreateds.filter(g => g != lastCreated)
    }

    removePreviewGraphics() {
        this.previewGraphics?.parent?.removeChild(this.previewGraphics)
        this.previewGraphics = null
    }

    removeGraphics(gr: PIXI.Graphics) {
        Object.keys(this.createdGraphics).forEach(k => this.createdGraphics[k] = this.createdGraphics[k].filter(gr2 => gr2 != gr))

        if (this.selectedGraphics == gr) {
            this.selectedGraphics = null
        }

        if (gr instanceof PixiWayPoint) {
            let point = <PixiWayPoint>gr
            point.link.forEach(l => {
                l.waypoint.link = l.waypoint.link.filter(l2 => l2.waypoint != point)
                l.arrow.fromShape = null
                l.arrow.toShape = null
                this.removeGraphics(l.arrow)
            })
        } else if (gr instanceof PixiPath && gr?.fromShape && gr?.toShape) {
            let arrow = <PixiPath>gr
            arrow.fromShape.link = arrow.fromShape.link.filter(l => l.arrow != gr)
            arrow.toShape.link = arrow.toShape.link.filter(l => l.arrow != gr)
        }
        if (this.children.includes(gr)) {
            this.removeChild(gr)
        }
        if (this.mainContainer.children.includes(gr)) {
            this.mainContainer.removeChild(gr)
        }
        if (gr.parent) {
            gr.parent.removeChild(gr)
        }
    }

    async getExportImageContainer() : Promise<PIXI.Container>{
        let ret = new PIXI.Container()
        let mapSprite : PIXI.Sprite =<any>this.mainContainer.children.filter(c=> c instanceof PIXI.Sprite)[0]
        if(mapSprite){
            ret.addChild(PIXI.Sprite.from(mapSprite.texture))
        }
        Object.keys(this.createdGraphics).forEach(k => {
            this.createdGraphics[k].filter(g => this.mainContainer.children.includes(g)).forEach((g : PixiMapGraphics) => {
              let clonedGraphics = g.clone()
              clonedGraphics.position = g.position
              ret.addChild(clonedGraphics)
            })
          })
        return ret
    }
    
    async exportEditedMapImage(base64 : string = null){
        this.selectedGraphics = null      
        if (base64 != null) {
            var a = document.createElement("a"); //Create <a>
            a.href = "data:image/png;base64," + base64.split(",")[base64.split(",").length - 1]; //Image Base64 Goes here
            a.download = 'map'; //File name Here
            a.click(); //Downloaded file
        }else{
            let container = await this.getExportImageContainer()
            this._pixiApp.renderer.extract.canvas(container).toBlob(function (b) {
              var a = document.createElement('a');
              document.body.append(a);
              a.download = 'map';
              a.href = URL.createObjectURL(b);
              a.click();
              a.remove();
            }, 'image/png');   
        }
      }

    // . . . Create PixiGraphics . . .

    createPoint(evt: PIXI.interaction.InteractionEvent) { //type == 'point'
        let style = new PixiGraphicStyle()
        style.fillColor = Number((this.pixiApp.renderer.transparent ? this.selectedStyle.markerLight : this.selectedStyle.marker).color.replace("#", "0x"))
        let names = [DEFAULT_WAYPOINT_NAME].concat(Array.from(Array(this.allPixiWayPoints.length).keys()).map(k => `${DEFAULT_WAYPOINT_NAME}-${k + 1}`))
        let newPtName = names.filter(n => !this.allPixiWayPoints.map(p => p.text).some(t => t == n))[0]
        let newPixiPoint = new PixiWayPoint(this, newPtName, style, this.settings.waypointEditable)
        newPixiPoint.robotBases = Object.keys(this.mapLayerStore)
        newPixiPoint.position.set(this.createData.clickedPosition.x, this.createData.clickedPosition.y)
        this.mainContainer.addChild(newPixiPoint)
        this.ngZone.run(() => this.mode = null)
        this.selectedGraphics = newPixiPoint

        setTimeout(() => {       
            newPixiPoint.focusInput()         
        });
        return newPixiPoint
    }

    createPath(frPt: PixiWayPoint, toPt: PixiWayPoint) { //type == 'point'
        let newPath = new PixiPath(this, [], this.createData.type, new PixiGraphicStyle().setProperties({ fillColor: ConvertColorToDecimal(this.selectedStyle.arrow.color), lineColor: ConvertColorToDecimal(this.selectedStyle.arrow.color) }), frPt, toPt);
        this.mainContainer.addChild(newPath)
        return newPath
    }

    createPolygon(vertices: PIXI.Point[]) {
        this.removePreviewGraphics()
        let polygon
        if (this.settings.polygonType == 'building') {
            polygon = new PixiBuildingPolygon(this, vertices, undefined, false)
        } else if (this.settings.polygonType == 'region') {
            let names = [DEFAULT_REGION_NAME].concat(Array.from(Array(this.allPixiRegions.length).keys()).map(k => `${DEFAULT_REGION_NAME}-${k + 1}`))
            let newRegionCode = names.filter(n => !this.allPixiRegions.map(p => p.regionCode).some(t => t == n))[0]
            polygon = new PixiRegionPolygon(this, vertices, new PixiGraphicStyle().setProperties({ fillColor: ConvertColorToDecimal(this.selectedStyle.polygon.color), opacity: this.selectedStyle.polygon.opacity }), false , newRegionCode);
            (<PixiRegionPolygon>polygon).robotCodes = this.dataModule?.dropdownData.robots.map((r : DropListRobot )=> r.robotCode)
        } else {
            polygon = new PixiEditablePolygon(this, vertices, new PixiGraphicStyle().setProperties({ fillColor: ConvertColorToDecimal(this.selectedStyle.polygon.color), opacity: this.selectedStyle.polygon.opacity }), false)
        }     
        this.mainContainer.addChild(polygon)
        this.ngZone.run(() => this.mode = null)
        this.selectedGraphics = polygon
        this.ngZone.run(()=> this.createdGraphics.polygon.push(polygon)) 
        return polygon
    }

    createLine(vertices : PIXI.Point[]){
        this.removePreviewGraphics()
        const newLine =  new PixiLine(this , vertices , new PixiGraphicStyle().setProperties({lineColor : ConvertColorToDecimal(this.selectedStyle.line.color) , lineThickness : this.selectedStyle.line.width}) , false)
        this.mainContainer.addChild(newLine)
        this.selectedGraphics = newLine
        newLine.selectable = true
        newLine.mouseOverOutline = { color: DRAWING_STYLE.mouseOverColor, width: 3 }
        newLine.mouseOverEffectEnabled = true
        this.ngZone.run(() => this.createdGraphics.line.push(newLine))
        return newLine
    }

    listenLineCreate(){
        let startPos : PIXI.Point = null
        this.events.click.pipe(takeUntil(this.onModeChange)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            evt.stopPropagation()
            let pos =  evt.data.getLocalPosition(this.mainContainer)     
            if (!startPos) {
                startPos = pos
            } else {
                this.createLine([startPos , pos])
                startPos = null
            }         
        })

        this.events.move.pipe(filter(v=>startPos!=null) ,takeUntil(this.onModeChange)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            evt.stopPropagation()
            let pos =  evt.data.getLocalPosition(this.mainContainer)
            this.removePreviewGraphics()
            this.previewGraphics= new PixiLine(this , [startPos , pos] , new PixiGraphicStyle().setProperties({lineColor : DRAWING_STYLE.mouseOverColor , lineThickness : this.selectedStyle.line.width}) , false)
            this.mainContainer.addChild(this.previewGraphics)
        })

        this.onModeChange.pipe(take(1)).subscribe(() => {
            this.removePreviewGraphics()
        })
    }

    listenBrushCreate(){
        let brushGraphics : PixiMapGraphics = null
        this.mainContainer.events.click.pipe(filter(v=> brushGraphics == null)  , takeUntil(this.onModeChange)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            evt.stopPropagation()
            const style = new PixiGraphicStyle().setProperties({fillColor :  ConvertColorToDecimal(this.selectedStyle.brush.color) , lineColor : ConvertColorToDecimal(this.selectedStyle.brush.color) , lineThickness :  this.selectedStyle.brush.size })
            brushGraphics = new PixiMapGraphics(this)
            brushGraphics.type = 'brush'            
            this.mainContainer.addChild(brushGraphics)
            let lastPos = evt.data.getLocalPosition(this.mainContainer)
            brushGraphics.beginFill(style.fillColor , 1).drawCircle(lastPos.x , lastPos.y , style.lineThickness / 40).endFill()
            this.events.move.pipe(filter(v=>brushGraphics !=null) , takeUntil(this.events.clickEnd)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
                let newPos = evt.data.getLocalPosition(this.mainContainer)
                brushGraphics.lineStyle(style.lineThickness , style.lineColor).moveTo(lastPos.x , lastPos.y ).lineTo(newPos.x , newPos.y)
                lastPos = newPos
                brushGraphics.beginFill(style.fillColor , 1).drawCircle(lastPos.x , lastPos.y , style.lineThickness / 40).endFill()
            })
            this.events.clickEnd.pipe(filter(v=>brushGraphics !=null) , take(1)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
                this.ngZone.run(() => this.createdGraphics.brush.push(brushGraphics))
                brushGraphics = null                        
            })
        })
    }

    listenPolygonCreate() {
        let vertices : PixiCircle[] = []
        let draftLine : PixiLine = null
        this.events.click.pipe(takeUntil(this.onModeChange)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            evt.stopPropagation()
            let pos =  evt.data.getLocalPosition(this.mainContainer)
            let vertex : PixiCircle = null
            if (this.previewGraphics) {
                vertex = new PixiCircle(this, new PIXI.Point(0, 0), this.interactiveControlRadius, new PixiGraphicStyle().setProperties({ fillColor: 0xFFFFFF, lineColor: DRAWING_STYLE.highlightColor }))
                let line = new PixiLine(this, [vertices[vertices.length - 1].position, pos], new PixiGraphicStyle().set('zIndex', -1), true)
                this.previewGraphics.addChild(line)
            } else {
                this.previewGraphics = new PixiMapGraphics(this)
                this.previewGraphics.sortableChildren = true
                vertex = new PixiCircle(this, new PIXI.Point(0, 0), this.interactiveControlRadius * 1.5, new PixiGraphicStyle().setProperties({ fillColor: DRAWING_STYLE.highlightColor, lineColor: DRAWING_STYLE.secondaryHighlightColor }))    
                vertex.cursor = 'pointer'
                vertex.interactive = true
                vertex.events.click.pipe(filter(v=>vertices.length > 1) , take(1)).subscribe(()=>{
                    this.createPolygon(vertices.map(p=>p.position))
                })
                this.mainContainer.addChild(this.previewGraphics)
            }
            vertex.position = pos
            vertex.autoScaleEnabled = true   
            vertices.push(vertex)         
            this.previewGraphics.addChild(vertex)
        })

        this.events.move.pipe(filter(v=>this.previewGraphics!=null) ,takeUntil(this.onModeChange)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            let pos =  evt.data.getLocalPosition(this.mainContainer)
            draftLine?.parent?.removeChild(draftLine)
            draftLine = new PixiLine(this, [vertices[vertices.length - 1].position, pos], new PixiGraphicStyle().set('zIndex', -1).set('lineColor' , DRAWING_STYLE.mouseOverColor), true)
            this.previewGraphics.addChild(draftLine)
        })

        this.onModeChange.pipe(take(1)).subscribe(() => {
            draftLine?.parent?.removeChild(draftLine)
            draftLine = null
            this.removePreviewGraphics()
        })
    }

    listenPathCreate() {
        let createEnd = new Subject()
        let fromPt: PixiWayPoint = null  
        let resetFromPt = () => {
            if (fromPt) {
                fromPt.reColor(fromPt.style.fillColor)
                fromPt.mouseOverEffectEnabled = true
            }
            fromPt = null
        }

        this.allPixiWayPoints.forEach(p => {
            p.toggleButton(true)
            p.button.events.clickEnd.pipe(takeUntil(createEnd)).subscribe((evt : PIXI.interaction.InteractionEvent ) => {
                evt.stopPropagation()
                this.removePreviewGraphics()     
                if (fromPt && fromPt != p && fromPt.link.filter(l => l.waypoint == p).length == 0) {
                    const newPath = this.createPath(fromPt, p)
                    this.ngZone.run(() => this.mode = null)
                    this.selectedGraphics = newPath
                    setTimeout(() => resetFromPt())
                } else if (!fromPt) {
                    fromPt = p
                    p.mouseOverEffectEnabled = false
                    p.reColor(DRAWING_STYLE.highlightColor)
                }  
            })
            
            p.button.events.mouseover.pipe(takeUntil(createEnd)).subscribe(() => {
                if (fromPt && p != fromPt && fromPt.link.filter(l=>l.waypoint == p).length == 0) {
                    this.removePreviewGraphics()                 
                    this.previewGraphics = this.createPath(fromPt, p)
                }
            })

            p.button.events.mouseout.pipe(takeUntil(createEnd)).subscribe(() => {
                this.removePreviewGraphics()   
            })
        });

        this.onModeChange.pipe(take(1)).subscribe(() => {
            resetFromPt()
            this.removePreviewGraphics()
            createEnd.next()
            this.allPixiWayPoints.forEach(p => {
                p.toggleButton(false)
            })
        })
    }

    //. . . Edit PixiGraphics . . .

}
