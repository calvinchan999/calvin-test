import { Component, AfterViewInit, Input, ViewChild, ElementRef, EventEmitter, Injectable, Inject, Output, ChangeDetectorRef, Renderer2, HostListener, NgZone, OnInit } from '@angular/core';
import { NgPixiViewportComponent } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import * as PIXI from 'pixi.js';
import * as PixiTextInput from 'pixi-text-input';
// import { Pose2D } from 'src/app/models/floor-plan.model';
import { BehaviorSubject, Observable, of, Subject, timer } from 'rxjs';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';
import { centroidOfPolygon, getAngle ,getBezierSectionPoints , getDijkstraGraph, getLength, getOrientation, getOrientationByAngle , inside, intersectionsOfCircles, trimAngle} from 'src/app/utils/math/functions';
import { UiService} from 'src/app/services/ui.service';
import { or } from '@progress/kendo-angular-grid/dist/es2015/utils';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { replace } from '@progress/kendo-editor-common';
import { environment } from 'src/environments/environment';
import { Bezier} from "bezier-js/dist/bezier.js";
import * as Viewport from 'pixi-viewport';
import {ColorReplaceFilter} from '@pixi/filter-color-replace';
import {GlowFilter} from '@pixi/filter-glow';
import {OutlineFilter} from '@pixi/filter-outline';
import {ColorOverlayFilter} from '@pixi/filter-color-overlay';
import {DropShadowFilter} from '@pixi/filter-drop-shadow';
import { ShapeJData , MapJData, FloorPlanDataset, MapDataset, DataService, robotPose, DropListFloorplan, DropListLocation, DropListMap, DropListAction, DropListBuilding, JMap, JPoint, JPath, JFloorPlan, DropListRobot, DropListPointIcon, RobotStatusARCS, JChildPoint } from 'src/app/services/data.service';
import { AuthService } from 'src/app/services/auth.service';
import * as roundSlider from "@maslick/radiaslider/src/slider-circular";
import {GraphBuilder, DijkstraStrategy} from "js-shortest-path"
import { TxtboxComponent } from '../txtbox/txtbox.component';
import { PositionService } from '@progress/kendo-angular-popup';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';

// adapted from
// http://jsfiddle.net/eZQdE/43/

export const radRatio =  57.2958
const VIRTUAL_MAP_ROS_HEIGHT = 20
const WebGLMaxMobileTextureSize = 4096
const WebGLMaxPcTextureSize = 16384
const wayPointCodeMaxLength = 50
const ROBOT_ACTUAL_LENGTH_METER = 1
//pending : add curved arrow default curved (rescontrol point ) 
@Component({
  selector: 'uc-drawing-board',
  templateUrl: './drawing-board.component.html',
  styleUrls: ['./drawing-board.component.scss']
})

export class DrawingBoardComponent implements OnInit , AfterViewInit {
  @ViewChild(NgPixiViewportComponent) public _ngPixi: NgPixiViewportComponent;
  @ViewChild('uploader') public uploader
  @ViewChild('angleSlider') public angleSlider : ElementRef
  @ViewChild('kendoAngleSlider') public kendoAngleSlider 
  @Input() waypointEditable = false
  @Input() uploadMustMatchOriginalSize = false
  @Input() showWaypointType = false
  get withMapLayer(){
    return Object.values(this.mapLayerStore).length > 0
  }

  id = 0;
  get selectedGraphics(){
    return this._mySelectedGraphics
  }
  set selectedGraphics(g){
    this._mySelectedGraphics = g
    this.ngZone.run(()=> this.selectedShapeChange.emit(g))
  }

  _mySelectedGraphics = null
  mode = null
  subscriptions = []
  _pickSpawnPoint = false
  @Input() set pickSpawnPoint(b){
    if(!b && this.showRobot && !this.robots[0]?.mapCode){
      Object.values(this.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = true)
      this.overlayMsg = this.uiSrv.translate("Select Starting Position")
      this.spawnPointObj.selectedPlan = null
      this.selectedLocation = null
      this.dropdownOptions.locations = null
      this.refreshPixiLocColor()
      this.changeMode(null)
    }
    this._pickSpawnPoint = b
  }
  get pickSpawnPoint(){
    return this._pickSpawnPoint
  }

  _arcsRobotColors
  @Input() set arcsRobotColors(v){
    this._arcsRobotColors = v
    this.refreshRobotColors()
  }  
  @Input() arcsRobotType = null
  @Input() selectedFloorPlanCode = null
  @Output() selectedFloorPlanCodeChange: EventEmitter<any>  = new EventEmitter();
  @Input() subscribeTask = false
  @Input() showRobot = false
  @Input() customInitialViewPosition = true
  @Input() hideRelocationButton = false
  @Input() showScanButton = false
  @Input() height;
  @Input() width;
  @Input() backgroundImgBase64;
  @Input() canUploadMultiImg = true
  @Input() hideButton : any = { } //keys : all, polygon , brush , arrow , upload , point , export , delete , line , manual
  @Input() disableButton : any = { } //keys : all, polygon , brush , arrow , upload , point , export , delete , line
  @Input() overlayMsg = null
  @Input() selectedShape : any
  @Input() header = null
  @Input() readonly = false
  @Input() isDashboard = false
  @Input() showNavigationDropdown = false
  @Input() engineerMode = false
  @Input( ) showRosToggle = false
  @Input() hideHeader = false
  @Input() setupWayPointIcon = false
  @Input() testWayPointName = "WAYPOINT"
  @ViewChild('ucPointTextBox') ucPointTextBox : TxtboxComponent
  @ViewChild('container') containerElRef : ElementRef;
  @Output() beginDrawPolygon: EventEmitter<any> = new EventEmitter();
  @Output() onDrawingsCreated: EventEmitter<any> = new EventEmitter();
  @Output() pointRename: EventEmitter<any> = new EventEmitter();
  @Output() pointUnselected: EventEmitter<any> = new EventEmitter();
  @Output() pointClick: EventEmitter<any> = new EventEmitter();
  @Output() robotClicked: EventEmitter<any> = new EventEmitter();
  @Output() pointCreate: EventEmitter<any> = new EventEmitter();
  @Output() pointRemove: EventEmitter<any> = new EventEmitter();
  @Output() shapeDeleted: EventEmitter<any> = new EventEmitter();
  @Output() fileLoad : EventEmitter<any> = new EventEmitter();
  @Output() selectedShapeChange : EventEmitter<any> = new EventEmitter(); 
  @Output() scanClicked: EventEmitter<any> = new EventEmitter();
  @Output() pickMapClicked : EventEmitter<any> = new EventEmitter();
  @Output() standaloneRobotChangeMap : EventEmitter<any> = new EventEmitter(); 
  @Output() onBuildingSelected: EventEmitter<any> = new EventEmitter(); 
  @Output() onSiteSelected: EventEmitter<any> = new EventEmitter(); 
  @Output() cancelSpawnPick : EventEmitter<any> = new EventEmitter(); 
  @Output() confirmSpawnPick : EventEmitter<any> = new EventEmitter(); 
  @Output() addLocalWayPointClicked:  EventEmitter<any> = new EventEmitter(); 
  @Output() cancelFullScreen : EventEmitter<any> = new EventEmitter(); 
  @Output() terminateRemoteControl :  EventEmitter<any> = new EventEmitter(); 
  @Output() demoWaypointLoaded :  EventEmitter<any> = new EventEmitter(); 
 
  onViewportZoomed : BehaviorSubject<any> = new BehaviorSubject<any>(null)
  mapTransformedScale  =  null
  arcsPoseSubscription 
  _fullScreen = false
  disableKendoKeyboardNavigation = false
  @Input() uitoggle = {
    showRosMap : true,
    showWaypoint : true,
    showWaypointName : true,
    showPath : false
  }

  @Input() set fullScreen(b) {
    this.ngZone.run(() => {
      this._fullScreen = b
      setTimeout(() => {
        this._ngPixi.onResize()
      })
    })
  }
  get fullScreen(){
    return this._fullScreen
  }
  public lastActiveMapId_SA
  private _suspended
  public set suspended(v){
    this._suspended = v
    if(v == true){  
      this.suspendViewportPlugin('wheel')
    }else{
      this.resumeViewportPlugin('wheel')
    }
  }

  _remoteControl = false
  remoteControlTurboOn = false
  @Input() set remoteControl(b){
    this._remoteControl = b
  }
  get remoteControl(){
    return this._remoteControl
  }

  public get suspended(){
    return this._suspended
  }

  drawingsCreated = []; //TO BE REMOVED (REVISE export() FIRST )
  imageUploaded = [];
  get allPixiTaskPaths() : PixiTaskPath[]{
    return this.mainContainer.children.filter(c=> c instanceof PixiTaskPath ).map(c=> <PixiTaskPath>c)
  }
  get allPixiPoints() : PixiLocPoint[]{
    return this.mainContainer.children.filter(c=> c instanceof PixiLocPoint).map(c=> <PixiLocPoint>c)
  };
  get allPixiPolygon() : PixiPolygon[]{
    return this.mainContainer.children.filter(c=> c instanceof PixiPolygon).map(c=> <PixiPolygon>c)
  };
  brushPaintings = []; //to implement undo easily , not included in drawingsCreated
  linesCreated = []; //to implement undo easily , not included in drawingsCreated
  mainContainerId
  get allPixiArrows() : PixiArrow[]{
    return this.mainContainer.children.filter(c=> c instanceof PixiArrow).map(c=><PixiArrow>c)
  }

  robots: Robot[] = [];
  handleRadius = 10 * new PixiCommon().arrowHeadScale * (this.uiSrv.isTablet? 2 : 1)
  lineWidth = 3
  arrowTypes = ['arrow','arrow_bi','arrow_bi_curved' , 'arrow_curved']
  curveTypes = ['arrow_bi_curved' , 'arrow_curved']
  pointTypes = ['location','waypoint']
  defaultPointType = null
  _defaultPos = {
    x : null,
    y : null,
    zoom : null
  }

  set defaultPos(v){
    this._defaultPos = v
    this.setViewportCamera( this.defaultPos.x ,  this.defaultPos.y  , this.defaultPos.zoom)
  }

  get defaultPos(){
    return this._defaultPos
  }

  public mapContainerStore = {};
  public mapLayerStore = {};
  private _mainContainer = new PIXI.Container();
  public initDone = new BehaviorSubject(false);


  PIXI = PIXI
  editObj: {
    type?: any,
    graphics?: any,
    startPoint?: any,
    startPosition?: any,
    originalWidth?: any,
    originalHeight?: any
  }
  drawObj
  mouseUpListenerObj = {}
  highlightColor = new PixiCommon().highlightColor//0xFF6358 //0x30C5FF //0xff9800 // 0xFC33FF
  // mapPalette  = [ "#000000", "#ffffff", "#cdcdcd"];
  @Input()palette = {
    map: ['#FFFFFF' , '#000000'], path: null, location: null
  }
  selectedStyle = {
    line: { width:5 , color : "#000000" , opacity: 1 },
    brush : {size : 20,  color : "#000000", opacity: 1  },
    polygon : { color : "#000000" , opacity: 1 },
    arrow : {color : "#1e90ff" , opacity: 1 },
    marker : {color : "#5f259f" , opacity: 1 },
  }
  point = {type : 'waypoint'}

  mapHeight
  mapWidth
  mapOrgin = {x: 0 , y :0}
  cmPixiGeometry = new PixiCommon()
  mapLoaded = false
  backgroundSprite : PIXI.Sprite =  new PIXI.Sprite()
  uniquePathDestination = true
  pickLocObj : {enable : boolean , x : number , y : number , rosX : number , rosY : number , mapId : number , graphic : PIXI.Graphics , angle : number} = {
    enable : false,
    x:null,
    y:null,
    rosX:null,
    rosY:null,
    mapId : null,
    graphic : null,
    angle : 0
  }
  spawnPointObj = {
    lidarLayer : null,
    lidarPosition : null,
    alignLidar:false,
    markerGraphic : null, 
    x:null,
    y:null,
    rosX:null,
    rosY:null,
    footprint:[],
    rotation: 0, //Ros rad * 57
    selectedPlan : null,
    selectedMap : null,
    mouseoverLocationOption : null,
  } 
  dropdownOptions = {
    floorplans : [],
    locations : [],
    maps: [],
    iconTypes : [],
    pointTypes : [],
  }
  dropdownData = {
    floorplans:[],
    locations : [],
    maps : [],
    buildings : [],
    robots :[],
    iconTypes : [],
    pointTypes : []
  } 
  selectedLocation : null
  loadingTicket = null
  signalRPoseSubscribed = false
  signalRSubscribedMapCodes = []
  clickEvts = ['touchstart', 'mousedown']
  moveEvts = ['touchmove', 'mousemove']
  clickEndEvts = ['touchend' , 'mouseup']
  _cameraTraceEnabled = false
  set cameraTraceEnabled(v){
    this._cameraTraceEnabled = v
    if(this._cameraTraceEnabled){
      this.relocateCamera();
    }
  }
  get cameraTraceEnabled(){
    return this._cameraTraceEnabled
  }
  liveLidarObj :{show : boolean , graphic : PIXI.Graphics , mapCode : string , statusSubscription : any} = {
    show : false,
    graphic : null,
    mapCode : null,
    statusSubscription : null
  }

  public onDestroy = new Subject()
  public get mainContainer(){
    return this._mainContainer
  }
  
  //storing objects for ARCS only , not used in standalone
  @Input() set site(v){
    this.arcsLocationTree.site = v
  }
  
  arcsLocationTree : {
    site : {
      code : string ,
      name : string 
    },
    building :{
      code : string ,
      name : string 
    },
    currentLevel : 'floorplan' | 'site'
    selected : {
      building: string,
      floorplan : string,
    }
  } = {
    site : {
      code : null,
      name : null
    },
    building : {
      code : null,
      name : null
    },
    currentLevel : 'floorplan',
    selected : {
      building: null,
      floorplan : null,
    }
  }


  dijkstra : { paths : JPath [],graph : any} = {
    paths : [],
    graph : null
  }

  taskShowing = null
  confirmPending = false

  textInputFocused(selectedGraphicOnly = true){
    return selectedGraphicOnly? this.selectedGraphics?.children.filter(c=>c['type'] == 'input')[0]?.htmlInput === document.activeElement :  document.activeElement.tagName.toUpperCase()=='INPUT'
  }

  @HostListener('document:keydown.delete', ['$event'])
  onDeleteKeyDown(event: KeyboardEvent) {
    if(this.suspended || this.readonly || this.hideButton['all']|| this.hideButton['delete'] || (this.textInputFocused() && (this.selectedGraphics?.text?.length > 0)) ){
      return
    }
    if(this.selectedGraphics && !(this.selectedGraphics instanceof PixiLocPoint && new PixiCommon().arrowTypes.includes(this.drawObj?.type))  && !this.uiSrv.overlayActivated(this.elRef.nativeElement)){
      this.deleteSelectedGraphics()
    }
  }


  @HostListener('document:keydown.enter', ['$event'])
  @HostListener('document:keydown.esc', ['$event'])
  blurInputFocus(event: KeyboardEvent) {
    if(this.suspended || this.readonly){
      return
    }
    if(event.key == 'Escape' ){
      if(this.selectedGraphics instanceof PixiLocPoint && !(<PixiLocPoint> this.selectedGraphics)?.text?.length){
        this.deleteSelectedGraphics()
      }
      this.endDraw()
    }
    if(this.selectedGraphics && !this.uiSrv.overlayActivated(this.elRef.nativeElement) ){
      let inputs = this.selectedGraphics.children.filter(c=>c['type'] == 'input')
      if(inputs.length > 0){
        inputs[0].blur()
      }
    }
  }

  addSubtractKeyStep = 1
  @HostListener('document:keydown.+', ['$event'])
  @HostListener('document:keydown.-', ['$event'])
  onAddSubtractKeyDown(event: KeyboardEvent) {
    if(this.spawnPointObj.alignLidar){
      this.addSubtractKeyStep +=  this.addSubtractKeyStep< 100 ? 0.1 : 0
      let tmp =  this.spawnPointObj.rotation + (event.key == '-' ? -0.1 : 0.1) *  this.addSubtractKeyStep
      this.spawnPointObj.rotation = tmp > 180 ? tmp - 360  : (tmp < - 180 ? 360 + tmp : tmp )
      this.refreshSpawnMarkerPos()
      this.refreshLidarLayerPos()
    }
  }

  @HostListener('document:keyup.+', ['$event'])
  @HostListener('document:keyup.-', ['$event'])
  onAddSubtractKeyUp(){
    this.addSubtractKeyStep = 1
  }

  arrowKeyStep = 1
  @HostListener('document:keydown.arrowup', ['$event'])
  @HostListener('document:keydown.arrowdown', ['$event'])
  @HostListener('document:keydown.arrowleft', ['$event'])
  @HostListener('document:keydown.arrowright', ['$event'])
  moveGraphicsByArrowNavKey(event: KeyboardEvent){
    if(this.textInputFocused(false) || (!this.spawnPointObj.alignLidar && (this.suspended || this.readonly))){
      return
    }
    this.arrowKeyStep +=  this.arrowKeyStep< 100 ? 0.1 : 0
    let xIncre = (event.key == 'ArrowLeft'? -1 : (event.key == 'ArrowRight' ? 1 : 0)) * this.arrowKeyStep
    let yIncre = (event.key == 'ArrowUp'? 1 : (event.key == 'ArrowDown' ? -1 : 0)) * this.arrowKeyStep
    if(this.spawnPointObj.alignLidar){
      // event.preventDefault()
      this.disableKendoKeyboardNavigation = true
      this.adjustSpawnMarkerPosition(xIncre , yIncre)
      this.refreshLidarLayerPos();
    }else if(this.selectedGraphics && (!(this.selectedGraphics instanceof PixiArrow))){
      if(this.selectedGraphics instanceof PixiChildPoint){
        let oldPosMainContainer = this._mainContainer.toLocal(this.selectedGraphics.parent.toGlobal(this.selectedGraphics.position))
        let newPosMainContainer = new PIXI.Point(oldPosMainContainer.x + xIncre , oldPosMainContainer.y - yIncre ) //-yIncre reason to be found out
        let newPos = this.selectedGraphics.parent.toLocal(this._mainContainer.toGlobal(newPosMainContainer))
        this.selectedGraphics.position.set(newPos.x , newPos.y);
        // (<PixiChildPoint>this.selectedGraphics).pointGroup.drawBackground();
      }else{
        this.selectedGraphics.position.x += xIncre
        this.selectedGraphics.position.y -= yIncre
      }
      if (this.selectedGraphics instanceof PixiLocPoint) {
        (<PixiLocPoint>this.selectedGraphics).onPositionChange()
      }
      this.refreshArrows(this.selectedGraphics)
    }
  }
  @HostListener('document:keyup.arrowup', ['$event'])
  @HostListener('document:keyup.arrowdown', ['$event'])
  @HostListener('document:keyup.arrowleft', ['$event'])
  @HostListener('document:keyup.arrowright', ['$event'])
  onArrowKeyUp(event: KeyboardEvent){
    if(this.spawnPointObj.alignLidar){
      this.disableKendoKeyboardNavigation = false
    }
    this.arrowKeyStep = 1
  }

  constructor(public util: GeneralUtil, public changeDetector: ChangeDetectorRef,private renderer: Renderer2 , public dataSrv : DataService,
              public uiSrv : UiService,  public httpSrv : RvHttpService, public elRef : ElementRef, public ngZone : NgZone , public authSrv : AuthService) {

  }

  async ngOnInit(){
    if(this.util.arcsApp){
      this.dropdownData.robots = await this.dataSrv.getRobotList();
    }
    this.dropdownData.iconTypes = await this.dataSrv.getPointIconList()
    this.dropdownOptions.iconTypes = this.dropdownData.iconTypes.map((t:DropListPointIcon)=> {return {value : t.code , text : t.name}});
    if(this.showWaypointType){
      this.dropdownOptions.pointTypes = await this.dataSrv.getPointTypeList()
    }
    this.defaultPointType = (<DropListPointIcon[]>this.dropdownData.iconTypes).filter(t=> !t.base64Image || t.base64Image.length == 0)[0].code//TBR
    // console.log(`window height : ${window.innerHeight} , window width : ${window.innerWidth}  `)
    if(!this.uiSrv.drawingBoardComponents.includes(this)){
      this.uiSrv.drawingBoardComponents.push(this)
    }
    this.overlayMsg = this.isDashboard && this.util.standaloneApp ? this.uiSrv.translate("Initializing ...") : this.overlayMsg 
  }

  async ngAfterViewInit() {
    await this.getDropList()
    this.init()
    if (this.showNavigationDropdown) {
      this.getDropList(this.pickSpawnPoint)
    }
  }

  async ngOnChange(evt){

  }

  async init(){
    let ret = new Subject()
    setTimeout(async ()=>{
      if(!this.width || !this.height){
        this.width = this.elRef.nativeElement.parentElement.offsetWidth
        this.height =  this.elRef.nativeElement.parentElement.offsetHeight
      }
      this._ngPixi.size = {width : this.width , height : this.height}
      this._ngPixi.viewport['DrawingBoardComponent'] = this
      await this.initMap();
      this.endEdit();
      this.endDraw();
      this._ngPixi.viewport.on('zoomed',()=>this.onViewportZoomed.next(true))
      this.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(this.onDestroy)).subscribe(()=>{
        this.refreshRobotScale()
      })
      this.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(this.onDestroy) , debounceTime(25)).subscribe(()=>{
        if(new PixiCommon().autoScaleOnZoomed){
          this.refreshArrows()      
          if(this.selectedGraphics instanceof PixiPolygon){
            this.selectedGraphics.pixiVertices.forEach(v=>v['draw']())
            this.selectedGraphics.border?.draw()
          }
        }     
      })
      ret.next(true)
    })
    return <any> ret.pipe(filter(v => ![null,undefined].includes(v)), take(1)).toPromise()
  }


  ngOnDestroy() {
    try{
      this.uiSrv.drawingBoardComponents = this.uiSrv.drawingBoardComponents.filter(c => c != this)
      this.subscriptions.forEach(s=>s.unsubscribe())
      if(this.signalRPoseSubscribed){
        this.dataSrv.unsubscribeSignalR('pose')
      }
      this.unsubscribePose_ARCS()
    }catch{}
     this.onDestroy.next()
  }

  private async getSpriteFromUrl(url){
    let image: any = await this.getImage(url)
    // if(this.uiSrv.isTablet){
    let maxPx = this.uiSrv.isTablet ? WebGLMaxMobileTextureSize : WebGLMaxPcTextureSize
    let dimiension = [image.width, image.height]
    if ((dimiension[0] >= maxPx || dimiension[1] > maxPx)) {
      console.log('Image Resized to adapt to WEBGL standard')
      let newRatio = maxPx / Math.max(dimiension[0], dimiension[1])
      let canvas = await this.getResizedCanvas(image, dimiension[0] * newRatio, dimiension[1] * newRatio)
      let texture = PIXI.Texture.from(canvas.toDataURL("image/png"))
      // let canvas = document.createElement('canvas')
      // canvas.width = dimiension[0] * newRatio
      // canvas.height = dimiension[1] * newRatio
      // let ctx = canvas.getContext('2d');
      // ctx.drawImage(image, 0, 0, dimiension[0]* newRatio, dimiension[1]*newRatio);
      // var texture = PIXI.Texture.from(canvas.toDataURL("image/png"))

      var ret = PIXI.Sprite.from(texture)
      // ret.width =  dimiension[0]    
      // ret.height =  dimiension[1]    
      ret.scale.set(1 / newRatio)
      return ret
    } else {
      return PIXI.Sprite.from(new PIXI.Texture(new PIXI.BaseTexture(image)))
    }
    // }else{
    //   return PIXI.Sprite.from( new PIXI.Texture(new PIXI.BaseTexture(image)))
    // }
  }

  private async getResizedCanvas(image : any , newWidth : number , newHeight : number ){
    let canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    let ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, newWidth , newHeight);
    return canvas
  }

  public async getResizedBase64(url : string , newWidth : number , newHeight : number ){
    url = url.startsWith('data:image') ? url : ('data:image/png;base64,' + url)
    let image : any = await this.getImage(url)
    let canvas = await this.getResizedCanvas(image , newWidth , newHeight)
    return canvas.toDataURL().replace('data:image/png;base64,' , '')
  }

  
  public resumeViewportPlugin(pluginName){
    this._ngPixi.viewport.resumePlugin(pluginName)
  }

  public suspendViewportPlugin(pluginName){
    this._ngPixi.viewport.pausePlugin(pluginName)
  }

  async reset(){
    this.mainContainerId = null
    this._ngPixi.viewport.removeChildren()
    this._ngPixi.viewport.parent?.children?.filter(c=>c instanceof PixiToolTip).forEach(c=> c.parent.removeChild(c))
    this._mainContainer = new PIXI.Container();
    this._ngPixi.viewport.addChild(this._mainContainer)
    this.mapContainerStore =  {};
    this.mapLayerStore = {};
    this.drawingsCreated = []
    // this.allPixiPoints = []
    this._mainContainer.interactive = true
    this._ngPixi.viewport.interactive = true
    this.moveEvts.forEach(t => this._ngPixi.viewport.on(<any>t, (evt) => this.onMouseMove(evt , t)))
    this._mainContainer.sortableChildren = true; 
    this.spawnPointObj.footprint = []
    this.resetPickLoc()
    if (!this.util.standaloneApp) {
      this.robots = []
    }
    // this.arcsObjs = {
    //   hierarchy : {
    //     site :{id : null , name : null},
    //     floorplan : {id : null , name : null}
    //   }
    // }
    if(this.showRobot && this.util.standaloneApp && this.robots.length == 0){
      this.overlayMsg = this.uiSrv.translate("Select Starting Postion")
      this.dataSrv.unsubscribeSignalR('pose')
      this.dataSrv.subscribeSignalR('pose')
      this.signalRPoseSubscribed = true
      // await this.pixiElRef.loadFloorPlanFullDataset(await this.dataSrv.getFloorplanFullDs(fpId) , true , true)
      this.addRobot(this.dataSrv.robotMaster?.robotCode , null);
      this.subscribePose_SA()
    }
  }
  
  get initDone$(){
    return this.initDone.pipe(filter(v => v == true), take(1))
  }

  public async initMap() {
    this.reset()
   
      // let bgContainer = new PIXI.Container()
      this.backgroundSprite = this.backgroundImgBase64 ?  await this.getSpriteFromUrl(this.backgroundImgBase64) : new PIXI.Sprite()
      this._mainContainer.addChild(this.backgroundSprite)
      this.backgroundSprite.zIndex = -1
 
    if( this.backgroundImgBase64 && !this.customInitialViewPosition){
      this._ngPixi.viewport.zoomPercent(this.util.config.MAP_ZOOM_PERCENTAGE, true);
      this._ngPixi.flyTo( this._mainContainer.width/2,  this._mainContainer.height/2)
    }else if(this.defaultPos?.x && this.defaultPos?.y & this.defaultPos.zoom){
      this.setViewportCamera(this.defaultPos.x , this.defaultPos.y ,this.defaultPos.zoom)
    }

    this.initDone.next(true)
    //TBD : use another container to load the map texture, use _mapContainer to get a empty container which transform and add the robots

    // this._ngPixi.viewport.addListener("click",(evt)=>this.onMouseUp(evt));
    // Robot Point 1
  }

  getFirstRobot(){
    return this.robots[0]
  }

  cloneContainer(targetContainer){ //return new container with same position / size / scale without copying the children
    let ret = new PIXI.Container()
    ret.position.set(targetContainer.x , targetContainer.y)
    ret.height = targetContainer.height
    ret.width = targetContainer.width
    ret.scale.set(targetContainer.scale.x , targetContainer.scale.y)
    ret.zIndex = targetContainer.zIndex
    ret.sortableChildren = targetContainer.zIndex
    return ret
  }

  relocateCamera(){
    if(this.robots[0]){
      this.setViewportCamera(this.robots[0]?.viewPortPosition.x ,this.robots[0]?.viewPortPosition.y , undefined , true )
    }else{
      this.setViewportCamera(this.defaultPos.x ,this.defaultPos.y , undefined , true )
    }
  }

  setViewportCamera(x , y, zoom = this._ngPixi.viewport.scale.x , smooth = false , smoothMs = 500) {
    // this._ngPixi.viewport.scale.set(zoom, zoom)

      // this._ngPixi.viewport.wheel({center : new PIXI.Point(x , y) , smooth : 10})
    this._ngPixi.viewport.scale.set(zoom, zoom)   
    this._ngPixi.flyTo(x, y, smooth ? smoothMs : 0)

    // if(smooth){
    //   // console.log(zoom)
    //   // let orgScale =  this._ngPixi.viewport.scale.x
    //   // let diff = zoom - orgScale
    //   // let ticks =  smoothMs / 100
    //   // for(let i = 0 ; i <= ticks ; i ++ ){
    //   //   setTimeout(()=> this._ngPixi.viewport.scale.set(orgScale + i * diff / ticks, orgScale + i * diff / ticks), 100)
    //   // }
    //   // console.log(this._ngPixi.viewport.scale.x)
    // }else{
    //   this._ngPixi.viewport.scale.set(zoom, zoom)   
    // }
     
  }

  changeMode(mode : 'draw' | 'edit' , type = null  , gr : PIXI.Graphics = null, evt = null){
    if(this.pickSpawnPoint && this.drawObj?.type == 'spawn' && type != 'spawn'){
      return
    }
    this.endEdit()
    this.endDraw()
    this.mode = mode    
    Object.keys(this.mouseUpListenerObj).forEach(k=> this.mouseUpListenerObj[k]())
    if(mode == 'draw'){
      this.startDraw(type)
    }else if(mode == 'edit'){
      this.startEdit(type , gr ,evt)
    }
  }

  selectGraphics(gr:PIXI.Graphics , isRemove = false){
    if(this.uiSrv.isTablet && this.selectedGraphics instanceof PixiLocPoint && gr != this.selectedGraphics && !isRemove){
      this.pointUnselected.emit({ id: this.selectedGraphics.input.text, graphics: this.selectedGraphics, type: this.selectedGraphics.type })
    }

    setTimeout(() => {
      if(this.drawObj?.type == 'polygon' && this.drawObj?.startVertex && gr){
        this.selectGraphics(null)
      }
    })
    if(this.drawObj?.type == 'polygon' && this.drawObj?.startVertex && gr){
      return
    }
    if(this.selectedGraphics){
      // this.selectedGraphics['selected'] = false
      this.selectedGraphics.cursor = 'pointer'
      this.unhighlightGraphics(this.selectedGraphics)
      if(this.selectedGraphics instanceof PixiPointGroup){
        this.unhighlightGraphics((<PixiPointGroup>this.selectedGraphics).parentPoint)
      }else if(this.selectedGraphics instanceof PixiChildPoint){
        this.unhighlightGraphics((<PixiChildPoint>this.selectedGraphics).pixiPointGroup.parentPoint)
      }
    }

    if(gr == null && (!this.drawObj?.type || !this.editObj?.type || this.drawObj?.type == 'point' || this.editObj?.type == 'point') ){
      if (this.selectedGraphics instanceof PixiPointGroup) {
        gr = (<PixiPointGroup>this.selectedGraphics).parentPoint
      } else if (this.selectedGraphics instanceof PixiChildPoint) {
        gr = (<PixiChildPoint>this.selectedGraphics).pixiPointGroup.parentPoint
      }
    }
    this.selectedGraphics = gr


    if (gr) {
      // this.selectedGraphics['selected'] = true
      gr.cursor = 'move'
      this.highlightGraphics(gr)
    }

    this.changeDetector.detectChanges()
  }


  onfileLoad(event){
    const files = event.target.files;
    if (files.length === 0){
      return;
    }
    const mimeType = files[0].type;
    let max_file_size = this.util.config['UPLOAD_IMAGE_MAX_SIZE_KB'] ? this.util.config['UPLOAD_IMAGE_MAX_SIZE_KB'] : 10240
    if (mimeType.match(/image\/*/) == null) {
        this.uiSrv.showWarningDialog("Only images are supported.");
        return;
    }else if(files[0].size/1024 > max_file_size){
      this.uiSrv.showWarningDialog(this.uiSrv.translate(`The uploaded file exceeds the maximum size`) + `( ${max_file_size > 1024 ? (max_file_size/1024 + 'MB') : (max_file_size + 'KB')} )`);
      return;
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    var reader = new FileReader();
    reader.readAsDataURL(files[0]);
    this.fileLoad.emit(files[0]);
    reader.onload = async (_event) => {
      let url = reader.result;
      let imgDimension = await new PixiCommon().getImageDimensionFromUrl(url)
      let width = imgDimension[0]
      let height = imgDimension[1]

      if (this.uploadMustMatchOriginalSize && (width != this.backgroundSprite.texture.width || height != this.backgroundSprite.texture.height)) {
        this.uiSrv.showWarningDialog(this.uiSrv.translate("Uploaded image must be of same dimiension and resolution of original image"));
        this.uiSrv.loadAsyncDone(ticket)
        return
      }

      if (this.setupWayPointIcon) {
        this.loadDemoWaypoint(this.testWayPointName, url.toString())
      } else {
        await this.loadToMainContainer(url.toString(), width, height, undefined, undefined, undefined)
        let zoom = Math.min(this._ngPixi.viewport.screenHeight / height, this._ngPixi.viewport.screenWidth / width)
        this.setViewportCamera(width / 2, height / 2, zoom)
      }
      this.uiSrv.loadAsyncDone(ticket)


      event.target.value = null
    }
  }

  loadDemoWaypoint(waypointName: string, iconBase64: string) {
    this.allPixiPoints.forEach(p=> p.parent.removeChild(p));
    let wp = this.getPixiLocPoint(undefined, waypointName, undefined , iconBase64)
    wp.readonly = true
    this.mainContainer.addChild(wp)
    this.setViewportCamera(wp.position.x, wp.position.y)
    this.demoWaypointLoaded.emit({iconBase64: iconBase64})
  }

  async loadToMainContainer(url, width = null, height = null , floorPlanName = null, containerId = null , setCamera = false ) {
    url = url.startsWith('data:image') ? url : ('data:image/png;base64,' + url)
    this.dataSrv.setlocalStorage('lastLoadedFloorplanCode' , containerId)
    this.mainContainerId = containerId
    this.header = floorPlanName
    let sprite = await this.getSpriteFromUrl(url)
    this.backgroundSprite.texture = sprite.texture
    this.backgroundSprite.scale.x = sprite.scale.x
    this.backgroundSprite.scale.y = sprite.scale.y
    this.backgroundSprite.zIndex = -1
    this.backgroundSprite['base64'] = url
    this.backgroundImgBase64 = url
    this._mainContainer.zIndex = -1
    if(!this._mainContainer.children.includes(this.backgroundSprite)){
      this._mainContainer.addChild(this.backgroundSprite)
    }
    if(setCamera){
      if(width == null || height == null){
        let imgDimension = await new PixiCommon().getImageDimensionFromUrl(url)
        width = imgDimension[0]
        height = imgDimension[1]
      }
      this._ngPixi.viewport.moveCenter(width/2,height/2)
      let heightRatio = this.containerElRef.nativeElement.offsetHeight/height
      let widthRatio = this.containerElRef.nativeElement.offsetWidth/width
      this._ngPixi.viewport.snapZoom(widthRatio < heightRatio ? { width: width ,time:50} : { height: height ,time:50})
    }
    if(this.subscribeTask){
      this.subscribeTaskStatus_SA()  
    }
  }

  async getImage(src) {
    return new Promise((resolve, reject) => {
      let img = new Image()
      img.onload = () => resolve(img)
      img.onerror = (e) => {
        console.log("Fail to load Image : " + src)
        console.log(e)
      }
      img.src = src
    })
  }

  getMapContainer(mapCode : string , robotBase : string){
    return this.util.standaloneApp ? this.mapContainerStore[mapCode] : Object.values(this.mapContainerStore).filter((m: PixiMapContainer) => m.robotBase == robotBase && m.mapCode == mapCode)[0]
  }

  public addRobot(id, mapCode = null , robotBase = null ) { //consider to add 'type' argument for ARCS
    let ret = new Robot(id, mapCode, robotBase, this.util, this );
    if(mapCode == null){
      this._mainContainer.addChild(ret.pixiGraphics);
    }else{
      if(mapCode!= this.lastActiveMapId_SA && this.util.standaloneApp){ // && environment.app.toUpperCase() == 'STANDALONE' => don't use this variable except in standalone version
        this.standaloneRobotChangeMap.emit(mapCode)
      }
      this.lastActiveMapId_SA = mapCode
      let container = this.getMapContainer(mapCode , robotBase)
      if (!container) {
        console.log(`map not yet added to the viewport (map code : ${mapCode} , robot code : ${id})`)
      }else{
        container.addChild(ret.pixiGraphics);
        ret.pixiGraphics.zIndex = 1000 //TEMPRARILY
        container.sortableChildren = true
      }
    }
    //pending : only add if currentMapID == mapId , add when changed map && newMapId == mapId
    this.robots.push(ret)
    this.subscriptions.push(ret.clicked.subscribe((evt) => this.ngZone.run(()=>this.robotClicked.emit({ id: id, event: evt }))))
    ret.pixiGraphics.on('added',()=>this.refreshRobotScale())
    ret.pixiGraphics.zIndex = 10
    ret.pixiGraphics.buttonMode = true
    return ret;
    // await this.initMapTexure()
  }

  public refreshRobotColors(){
    // this._arcsRobotColors = {
    //   'RV-ROBOT-100' : 0xFF6358
    // }
    Object.keys(this._arcsRobotColors).forEach(robotCode=>{
      if(this._arcsRobotColors[robotCode]){
        let pixiRobot : PixiCommon =  this.robots.filter(r=>r.id == robotCode)[0]?.pixiGraphics
        if(pixiRobot){
          let oldAngle = pixiRobot.icon.angle
          pixiRobot.removeChild(pixiRobot.icon)
          pixiRobot.icon = new PixiCommon().getRobotIcon(Number(this._arcsRobotColors[robotCode]))
          pixiRobot.icon.angle = oldAngle
          pixiRobot.addChild(pixiRobot.icon)
        }
      }
    })
    this.refreshRobotScale()
  }

  // public getRobot(point = new PIXI.Point(0,0) , angle = 0, option = new GraphicOptions()) {
  //   let radius = 10
  //   let robot = new PIXI.Graphics().beginFill(option.fillColor).drawCircle(0, 0, radius).endFill()
  //   robot.moveTo(0, 0).beginFill(option.fillColor).drawPolygon([new PIXI.Point(-radius, 0), new PIXI.Point(0, - 2.25 * radius ), new PIXI.Point(radius, 0)]).endFill()
  //   robot.position.set(point.x , point.y)
  //   robot.icon.angle = angle
  //   return robot
  //   // return this.robots.filter(r => r.id == id)[0];
  // }

  public removeRobot(robot: Robot) {
    this.robots = this.robots.filter(r => r.id != robot.id);
    this.removeGraphics(robot.pixiGraphics)
  }

  public drawLine(p1: PIXI.Point, p2: PIXI.Point, option : GraphicOptions = new GraphicOptions()) :PIXI.Graphics{
    let ret = this.cmPixiGeometry.getLine(p1, p2, option)
    this._mainContainer.addChild(ret);
    return ret
  }

  public onMouseDownOfGraphics(gr: PIXI.Graphics , evt){   
    if(this.pickLocObj.enable || this.pickSpawnPoint){
      this.onMouseDown(evt)
      evt?.preventDefault()
      return
    }
    if(this.selectedGraphics == gr){
      evt?.stopPropagation()
      this.changeMode( 'edit', 'move',  gr , evt)
    }else{
      this.selectGraphics(gr)
    }
  }

  public pixiMapLayer(sprite : PIXI.Sprite , width , height ) : PixiMapLayer{
    let ret = new PixiMapLayer()
    ret.interactive = true
    ret.width = width
    ret.height = height
    ret.addChild(sprite)
    ret.pivot.set(width/2 , height/2)
    ret.position.set(width/2 , height/2)
    ret.initialOffset = new PIXI.Point( ret.position.x , ret.position.y)
    ret.initialWidth = width
    ret.initialHeight = height
    ret.ROS = sprite
    this.clickEvts.forEach(t => ret.on(t, (evt: PIXI.interaction.InteractionEvent) => this.onMouseDownOfGraphics(ret, evt)))
    return ret
  }

  public getPixiLocPoint(option = new GraphicOptions(), text = null, type = this.point.type , iconUrl = null , pointType = this.defaultPointType): PixiLocPoint { //Some parts to be moved to PixiArrow
    if(pointType != null && !iconUrl){
      let base64 = (<DropListPointIcon[]>this.dropdownData.iconTypes).filter(t=>t.code == pointType)[0]?.base64Image
      iconUrl = base64 && base64!="" ? base64 : null
    }
    option.fillColor = Number(this.selectedStyle.marker.color.replace("#", "0x"))
    option.lineColor = option.fillColor
    option.opacity = this.selectedStyle.marker.opacity
    let ret: PixiLocPoint = new PixiLocPoint(type, text, option, !this.readonly, this.uiSrv ,iconUrl , pointType )
    // if (!this.readonly) {
    //   ret.angleIndicator.on("mousedown", (evt: PIXI.interaction.InteractionEvent) => {
    //     evt.stopPropagation()
    //     this.changeMode('edit', 'rotate', ret.angleIndicator, evt)
    //   })
    //   ret.angleIndicator.on("mouseover", (evt: PIXI.interaction.InteractionEvent) =>
    //     ret.angleIndicator.showToolTip(new PixiCommon().getRotateInfoText(ret.angleIndicator), evt)
    //   )
    //   ret.angleIndicator.on("mouseout", () => ret.angleIndicator.hideToolTip())
    // }

    ret.onInputBlur.pipe(takeUntil(this.onDestroy || ret.onDelete)).subscribe(() => {
      let overlayActivated = this.uiSrv.overlayActivated(this.elRef.nativeElement)
      setTimeout(() => {
        if (ret?.parent && !overlayActivated) {
          this.pointRename.emit({ id: ret.input.text, graphics: ret, type: ret.type })
        }
      }, 300)

      ret.input.disabled = true// ret.type == 'location'
      ret.draw(this.selectedGraphics == ret)
      // this.pointCreate.emit({ id: ret.input.text, graphics: ret, type: ret.type })

    })

    this.clickEvts.forEach((trigger) => {
      ret.on(trigger, (evt: PIXI.interaction.InteractionEvent) => {
        this.onMouseDownOfGraphics(ret, evt)
        this.ngZone.run(() => {
          this.pointClick.emit(ret)
          if (this.showNavigationDropdown) {
            this.spawnPointObj.selectedPlan = this.mainContainerId
            this.removeSpawnMarker()
            this.refreshLocationOptions()
            this.selectedLocation = ret.code
            this.refreshPixiLocColor()
          }
        })
      })
    })

    this.clickEvts.forEach(t => {
      ret.button.on(t, (evt: PIXI.interaction.InteractionEvent) => {
        if (this.arrowTypes.includes(this.drawObj.type)) {
          //selected as origin
          evt.stopPropagation()
          if (!this.drawObj.graphics || !(this.drawObj.graphics instanceof PixiLocPoint)) {
            this.drawObj.graphics = ret
            option.zIndex = 2
            this.selectGraphics(null)
            let tmpBool = ret.showAngleIndicator
            ret.showAngleIndicator = false
            ret.draw(true)
            ret.showAngleIndicator = tmpBool
            this.selectedGraphics = ret
          } else if (this.drawObj.graphics != ret && this.drawObj.graphics instanceof PixiLocPoint) {
            //selected as destination
            this.drawObj.segments.forEach(s => this.removeGraphics(s))
            let arrow: PixiArrow = this.getLinkArrow(this.drawObj.graphics, ret)
            if (this.curveTypes.includes(this.drawObj.type)) {
              let p1 = arrow['vertices_local'][0]
              let p2 = arrow['vertices_local'][1]
              let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
              let xratio = (p1.x - p2.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
              let yratio = (p1.y - p2.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
              let len = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4
              arrow.setCurveControlPoints(new PIXI.Point(midPt.x + len * (yratio), midPt.y - len * (xratio)), new PIXI.Point(midPt.x - len * (yratio), midPt.y + len * (xratio)), this)
            }
            // this.selectGraphics(arrow)
            arrow.zIndex = 10
            // this.unhighlightGraphics(this.drawObj.graphics)
            
            // this.drawObj.graphics['draw'](false)
            this.drawObj.graphics = null//pending : add arrow && related waypoint to waypoints {fr : {pt : waypoint , gr : arrow} }
            this._mainContainer.addChild(arrow)
            this.drawingsCreated.push(arrow)
            this.onDrawingsCreated.emit(arrow)
            this.selectGraphics(arrow)
            // this.selectedGraphics = null
          }
          this.allPixiPoints.forEach((p: PixiLocPoint) => {
            let alreadyLinked = this.uniquePathDestination && p.link.map(l => l.waypoint).includes(ret) //['from','to'].some(d=>ret['link']?.[d] && ret['link']?.[d].map(l=>l['waypoint']).includes(p)
            p.button.visible = this.drawObj.graphics == null || (!alreadyLinked)
          })
        }
      })
    })

    ret.button.on('mouseover', () => {
      if (this.drawObj.graphics && this.drawObj.graphics instanceof PixiLocPoint) {
        if (this.drawObj.segments.length == 0 && this.drawObj.graphics != ret) {
          this.drawObj.segments.forEach(s => this.removeGraphics(s))
          let arrow: PixiArrow = this.getLinkArrow(this.drawObj.graphics, ret)
          this.drawObj.segments.push(arrow)
          this._mainContainer.addChild(arrow)
          arrow.draw(true)
        }
      }
    })

    ret.button.on('mouseout', () => this.drawObj.segments.forEach(s => this.removeGraphics(s)))
    return ret
  }

  getArrow(verts , type , opt = null) : PixiArrow{
    if(opt == null){
      opt = new GraphicOptions()
      opt.lineColor = new PixiCommon().hexToNumColor(this.selectedStyle.arrow.color)
      opt.fillColor = new PixiCommon().hexToNumColor(this.selectedStyle.arrow.color)
      opt.opacity = this.selectedStyle.arrow.opacity
    }
    opt.zIndex = 10
    let ret = new PixiArrow(verts, type, opt)
    if(!this.isDashboard){
      this.clickEvts.forEach(t => ret.on(t, () => this.selectGraphics(ret)))
    } 
    return ret
  }

  getLinkArrow(p1 : PixiLocPoint , p2 : PixiLocPoint , option = new GraphicOptions) : PixiArrow{ 
    let vertices = this.getLinkArrowAdjustedPoints(p1, p2 )
    let ret = this.getArrow([vertices[0] , vertices[1]] ,  this.drawObj.type )//this.getArrow(vertices[0] , vertices[1] , option , this.drawObj.type )
    ret.fromShape = (<PixiLocPoint>p1)
    ret.toShape = (<PixiLocPoint>p2)
    p1.link.push({waypoint:p2 , arrow : ret})
    p2.link.push({waypoint:p1 , arrow : ret})
    return ret
  }

  getLinkArrowAdjustedPoints(p1 , p2 ,  spaceRadius = 25 ,  type = null){ //To Be Moved to PixiArrow
    //Avoid Arrow Overlapping the Markers
    spaceRadius = spaceRadius * new PixiCommon().markerScale / this._ngPixi.viewport.scale.x
    let spaceScale1 = 1 
    let spaceScale2 = 1
    if(type != 'ctrl'){ 
      let scaleMapCfg = { //fit the shape of location marker , determine the required space base on arrow orientation
        from: { N: 3, NE: 2, NW: 2, S: 2 , SE : 2 , SW: 2 },
        to: { N: 3, NE: 2, NW: 2, S: 2 , SE : 2 , SW: 2 }
      }
      let or1 = getOrientation(p1.position, p2.position)
      let or2 = getOrientation(p2.position, p1.position)
      spaceScale1 =  p1['type'] == 'location' &&  Object.keys(scaleMapCfg.from).includes(or1) ? scaleMapCfg.from[or1] : (p1['type'] == 'waypoint' &&  or1?.includes('S') ? 2 : 1 )
      spaceScale2 =  p2['type'] == 'location' &&  Object.keys(scaleMapCfg.to).includes(or2) ? scaleMapCfg.to[or2] : (p2['type'] == 'waypoint' &&  or2?.includes('S') ? 2 : 1 )
    }

    if ((type != 'ctrl' && ( Math.hypot(p2.x - p1.x, p2.y - p1.y) <= spaceRadius * (spaceScale1 + spaceScale2)    || this.curveTypes.includes(this.drawObj.type) || this.curveTypes.includes(type)))){
      return [p1 , p2]
    }
    let height =  Math.abs(p2.y - p1.y)
    let width = Math.abs(p2.x - p1.x)
    let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width))
    let yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
    return [new PIXI.Point(p1.x + spaceRadius * spaceScale1 * xRatio , p1.y +  spaceRadius * spaceScale1 * yRatio ),
            new PIXI.Point(p2.x + ( -1) * spaceRadius * spaceScale2 * xRatio, p2.y +  (-1) * spaceRadius * spaceScale2 * yRatio)]
  }

  public drawVertex(parent : any  , point : PIXI.Point) : PixiVertex{
    let opt = new GraphicOptions(undefined,undefined,this.drawObj.segments.length == 0 ? this.highlightColor : 0xffffff, 2,1,this.highlightColor,5)
    let vertex = new PixiVertex( parent , point , this, opt)
  
    if(this.drawObj.segments.length == 0){
      vertex.interactive = true;
      if(this.mode == 'draw'){
        vertex.buttonMode = true;
        this.clickEvts.forEach(t=>{
          vertex.addListener(<any>t, () => {
            if (this.drawObj.draftLine) {
              let origin = this.drawObj.segments[0];
              this.removeGraphics(this.drawObj.draftLine)
              this.drawObj.draftLine = this.drawLine(this.drawObj.startVertex, origin['vertices'][0]);
            }
            setTimeout(() => {
              this.closePolygon()
            })
          });
        })
      }else{
        vertex.cursor = 'grab'
        this.clickEvts.forEach(t=>{
          vertex.on(t, (evt : PIXI.interaction.InteractionEvent) => {
            evt.stopPropagation()
            this.changeMode('edit','vertex', vertex ,evt)
            this.editObj.startPoint = new PIXI.Point(vertex.parent.position.x + point.x + vertex.position.x, vertex.parent.position.y + point.y +  vertex.position.y)
          })
        })
      }
    }
    // parent['polygonVertices'].push(ret)
    parent.addChild(vertex)
    return vertex
  }

  closePolygon() {
    this.drawObj.type = null
    this.drawObj.startVertex = null
    this.removeGraphics(this.drawObj.draftVertex)
    setTimeout(() => {
      let vertices = this.drawObj.segments.filter(s => s instanceof PixiVertex).map((s : PixiVertex ) => s.point)
      this.endDraw()   
      let polygon = this.getPolygon(vertices , new GraphicOptions(new PixiCommon(), undefined, this.palette.map.length > 0 ? new PixiCommon().hexToNumColor( this.palette.map[0]) : new PixiCommon().mouseOverColor, -1))
      this.drawingsCreated.push(polygon)
      this.onDrawingsCreated.emit(polygon)
      // this.selectGraphics(this.drawingsCreated[this.drawingsCreated.length - 1])
      this.selectGraphics(polygon)
    }, 100)
  }

  public getBuildingPolygon(vertices : {x : number , y : number}[], tagPosistion : {x : number , y : number}, isDashboard = false){
    let option = new  GraphicOptions() 
    option.opacity = isDashboard ? 0.0001 : 0.8
    option.fillColor = new PixiCommon().mouseOverColor
    option.lineColor = option.fillColor
    option.lineThickness = 0
    let polygon = this.getPolygon(vertices , option , isDashboard )
    this.addPixiRobotCountTagToPolygon(polygon , tagPosistion , 0 , isDashboard)
    if(!isDashboard){
      polygon.pixiRobotCountTag.option.opacity = 0.7
      polygon.pixiRobotCountTag.option.fillColor = 0xffffff
      polygon.pixiRobotCountTag.textColor = 0x333333
      polygon.pixiRobotCountTag.draw()
    }
    return polygon
  }

  public getPolygon(vertices, option = new GraphicOptions() , isDashboardBuilding = false): PixiPolygon {
    let polygon = new PixiPolygon( vertices.map(v => { return new PIXI.Point(v.x, v.y) }) , option , isDashboardBuilding);
    this._mainContainer.addChild(polygon);
    polygon.draw(false)
    if(!this.isDashboard){
      this.clickEvts.forEach(t=> polygon.on(t,(evt:PIXI.interaction.InteractionEvent)=> this.onMouseDownOfGraphics(polygon , evt)))
      polygon.on('rightdown', ()=> this.selectGraphics(polygon))
    }
    return polygon
  }


  onMouseMove(evt , triggerType = null) { 
    if(this.readonly || !['edit' , 'draw'].includes(this.mode) || this.drawObj.type == 'spawn'){
      return
    }
    let mousePos = evt.data.getLocalPosition(this._mainContainer)
    let gr : PIXI.Graphics = this.editObj?.graphics
    // console.log(gr)
    if (this.mode == 'edit' && gr) {
      if (this.editObj?.type == 'move' && gr['readonly']!=true) {
        if(gr instanceof PixiChildPoint){
          let mousePosGlobal = this._mainContainer.toGlobal(evt.data.getLocalPosition(this._mainContainer))
          let oldPosGlobal = gr.toGlobal(this.editObj.startPosition)
          let startPosGlobal = this._mainContainer.toGlobal(this.editObj.startPoint)
          let newPos = gr.toLocal(new PIXI.Point(oldPosGlobal.x + mousePosGlobal.x - startPosGlobal.x , oldPosGlobal.y + mousePosGlobal.y - startPosGlobal.y))
          gr.position.x = newPos.x
          gr.position.y = newPos.y 
        }else{
          gr.position.x = this.editObj.startPosition.x + mousePos.x -  this.editObj.startPoint.x
          gr.position.y = this.editObj.startPosition.y + mousePos.y -  this.editObj.startPoint.y
        }
        if(this.editObj.graphics instanceof PixiLocPoint){
          (<PixiLocPoint>this.editObj.graphics).onPositionChange()
        }else if(this.editObj.graphics instanceof PixiPointGroup){
          (<PixiPointGroup>this.editObj.graphics).refreshRelativePosition()
        }
        //  else if (gr instanceof PixiChildPoint) {
        //   setTimeout(() => (<PixiChildPoint>gr).pointGroup.drawBackground(undefined , <any>gr))
        // }
      }else if(this.editObj?.type == 'resize'){     
        let pixiMapLayer : PixiMapLayer =  (<PixiMapLayer>gr)
        let getLen = (p1 : PIXI.Point , p2: PIXI.Point)=> Math.hypot(p2.x - p1.x, p2.y - p1.y)
        let pivotPos = this._mainContainer.toLocal(gr.toGlobal(gr.pivot))   
        let scale = Math.max(0.05,  (getLen(pivotPos ,mousePos )/ getLen(pivotPos , this.editObj.startPoint)))
        pixiMapLayer.height = this.editObj.originalHeight * scale
        pixiMapLayer.width = this.editObj.originalWidth * scale ;
        pixiMapLayer.removeEditorFrame()
        pixiMapLayer.addEditorFrame()
        pixiMapLayer.showToolTip(gr.scale.x.toFixed(2) + ' x',evt)
      }else if(this.editObj?.type == 'rotate'){
        // let localPivot = gr instanceof PixiPointGroup ? gr.rotatePivot : gr.pivot
        let pivot =  this._mainContainer.toLocal(gr.toGlobal(gr.pivot))
        let angle = getAngle(new PIXI.Point(mousePos.x, mousePos.y), new PIXI.Point(pivot.x, pivot.y), new PIXI.Point(pivot.x, 0))
        angle = mousePos.x > pivot.x ? angle : 360 - angle
        this.ngZone.run(()=>  this.editObj.graphics.angle = !isNaN(angle % 360)? angle % 360 : this.editObj.graphics.angle)
        if( !isNaN(Number(gr.angle))){//gr['getTooltipGraphic'] && !isNaN(Number(gr.angle))
           let toolTipPosition =  gr.toGlobal((new PIXI.Point(gr.position.x - 10 , gr.position.y -65 )));   
           if(gr instanceof PixiMapLayer) {
            toolTipPosition =  gr.toGlobal(new PIXI.Point(gr.width / (2 * gr.scale.x) , 0));            
            (<PixiMapLayer>gr).rotateHandle.hideToolTip();
           }else if(gr instanceof PixiPointGroup){
            toolTipPosition =  gr.toGlobal(new PIXI.Point((<PixiPointGroup>gr).rotateHandlePos.x , (<PixiPointGroup>gr).rotateHandlePos.y ));        
            (<PixiPointGroup>gr).rotateHandle.hideToolTip();
            (<PixiPointGroup>gr).pixiChildPoints.forEach(c=>c.textSprite.angle = gr.angle * -1)
           }
           (<PixiCommon>gr).showToolTip(new PixiCommon().getRotateInfoText(gr), evt , toolTipPosition)
        }
      }else if(gr instanceof PixiVertex){
        let polygon: PixiPolygon = (<any> gr.parent) //parent : polygon , gr : vertex
        let newPixiVertexPosition = new PIXI.Point((this.editObj.startPosition.x + mousePos.x -  this.editObj.startPoint.x) , (this.editObj.startPosition.y + mousePos.y -  this.editObj.startPoint.y))
        polygon.refreshVertexPosition((<PixiVertex>gr).index , evt.data.getLocalPosition(polygon) , newPixiVertexPosition )
        // polygon.vertices[(<PixiVertex>gr).index] =  evt.data.getLocalPosition(polygon)
        // gr.position.x = (this.editObj.startPosition.x + newPos.x -  this.editObj.startPoint.x)
        // gr.position.y = (this.editObj.startPosition.y + newPos.y -  this.editObj.startPoint.y)
        // polygon.draw(true)
      }else if(this.editObj?.type == 'bezier'){
        mousePos = evt.data.getLocalPosition(gr.parent)
        gr.position.set(mousePos.x , mousePos.y);
        let arrow : PixiArrow = (<PixiArrow>(gr.parent))
        if(arrow.quadraticCurve){
          let anotherControlPt = gr == arrow.pixiControlPoint1 ? arrow.pixiControlPoint2 : arrow.pixiControlPoint1
          anotherControlPt.position.set(mousePos.x , mousePos.y)
        }
        arrow.draw(true)
      }
    }else if (this.mode == 'draw') {
      if (this.drawObj.draftLine) {
        this.removeGraphics(this.drawObj.draftLine)
      }
      if (this.drawObj.startVertex) {
        if ((triggerType == 'mousemove' && this.drawObj.type == 'polygon') || this.drawObj.type == 'line') {
          this.drawObj.draftLine = this.drawLine(this.drawObj.startVertex, new PIXI.Point(mousePos.x, mousePos.y), new GraphicOptions(undefined, undefined, undefined, undefined, undefined, 0x00CED1, (this.drawObj.type == 'line' ? this.selectedStyle.line.width : undefined)))
        } else if (this.arrowTypes.includes(this.drawObj.type)) {
          let arrow = this.getArrow([this.drawObj.startVertex, new PIXI.Point(mousePos.x, mousePos.y)], this.drawObj.type)// this.getArrow(this.drawObj.startVertex, new PIXI.Point(newPos.x, newPos.y), undefined ,this.drawObj.type)
          this._mainContainer.addChild(arrow)
          this.drawObj.draftLine = arrow
        }
      }
      if(this.drawObj.type == 'brush'){
        if(this.drawObj.graphics){
          if(this.drawObj.startVertex){
            let opt = new GraphicOptions()
            opt.zIndex = -1
            opt.baseGraphics = this.drawObj.graphics
            opt.opacity = this.selectedStyle.brush.opacity
            opt.fillColor = new PixiCommon().hexToNumColor(this.selectedStyle.brush.color)// Number(this.selectedStyle.brush.color.replace("#",'0x'))
            opt.lineColor = opt.fillColor
            opt.lineThickness = this.selectedStyle.brush.size
            this.drawLine( this.drawObj.startVertex, mousePos , opt)
            this.drawObj.graphics.drawCircle(mousePos.x , mousePos.y , this.selectedStyle.brush.size / 40 , opt)
            this.drawObj.startVertex = mousePos
          }
        }
      }
    }
  }

  onMouseDown(event: any) {
    if (!this.drawObj.type) {
      return;
    }
    let newPos = event.data.getLocalPosition(this._mainContainer)
    if(this.drawObj.type == 'pickLoc'){
      let mapContainer: PIXI.Container = this.mapContainerStore[this.lastActiveMapId_SA]
      if(mapContainer){
        let pos = event.data.getLocalPosition(mapContainer)
        this.refreshPickLoc(pos.x , pos.y)
      }   
    }else if (this.drawObj.type == 'spawn' ) {
      let spawnPos = event.data.getLocalPosition(this.mapContainerStore[this.spawnPointObj.selectedMap])
      this.initLocalizerGraphic();
      (<PIXI.Graphics>this.spawnPointObj.markerGraphic).position.set(spawnPos.x , spawnPos.y)
      if(this.spawnPointObj.alignLidar && this.spawnPointObj.x && this.spawnPointObj.y){
        this.spawnPointObj.footprint.push({x: this.spawnPointObj.x , y: this.spawnPointObj.y , angle : this.spawnPointObj.rotation})
      }   
      this.spawnPointObj.x = spawnPos.x
      this.spawnPointObj.y = spawnPos.y
      this.spawnPointObj.rosX = this.calculateRosX(this.spawnPointObj.x , this.spawnPointObj.selectedMap)
      this.spawnPointObj.rosY = this.calculateRosY(this.spawnPointObj.y, this.spawnPointObj.selectedMap)
      this.refreshLidarLayerPos()
      this.ngZone.run(()=>{
        this.selectedLocation = null
      })   
      this.refreshRobotScale()
      this.refreshSpawnMarkerPos()
      this.refreshPixiLocColor()
    }else if(this.drawObj.type == 'point' && !(this.selectedGraphics instanceof PixiLocPoint && (!this.selectedGraphics.code || this.selectedGraphics.code?.length == 0))){  
      //prevent multi touch on tablet  
      this.createWayPoint(newPos.x , newPos.y)
    } else if (this.drawObj.type == 'polygon' || this.drawObj.type == 'line') {
      if ((this.drawObj.type == 'line' && !this.drawObj.startVertex)) {
        this.mainContainer.on('touchend', (evt: PIXI.interaction.InteractionEvent) => {
          this.onMouseDown(evt)
          this.mainContainer.removeListener('touchend')  
        })
      }
      this._ngPixi.viewport.pausePlugin("drag") //* * *  SUSPEND VIEWPORT DRAGGING ON POLYGON DRAWING * * */
      if (this.drawObj.type == 'line' && this.drawObj.startVertex) {
        if (this.drawObj.draftLine) {
          this.removeGraphics(this.drawObj.draftLine)
          this.drawObj.draftLine = null
        }
        let option = new GraphicOptions()
        option.lineColor = new PixiCommon().hexToNumColor(this.selectedStyle.line.color)
        option.lineThickness = this.selectedStyle.line.width
        option.opacity = this.selectedStyle.line.opacity
        let line = new PixiCommon().getLine(this.drawObj.startVertex ,  event.data.getLocalPosition(this._mainContainer), option)
        line.zIndex = -1
        this._mainContainer.addChild(line);
        this.drawingsCreated.push(line)
        // this.onDrawingsCreated.emit(line)
        this.ngZone.run(()=> this.linesCreated.push(line))
        this.drawObj.startVertex = null
        return
      }
      if(this.drawObj.type == 'polygon' && !this.drawObj.draftLine && this.drawObj.startVertex){
        this.drawObj.draftLine = this.drawLine(this.drawObj.startVertex, new PIXI.Point(newPos.x, newPos.y), new GraphicOptions(undefined, undefined, undefined, undefined, undefined, 0x00CED1, (this.drawObj.type == 'line' ? this.selectedStyle.line.width : undefined)))
      }
      this.drawObj.startVertex = event.data.getLocalPosition(this._mainContainer) //this.convertToPixiOffset(event.offsetX, event.offsetY)//[event.offsetX, event.offsetY];
      if (this.drawObj.type == 'polygon') {
        this.drawObj.draftVertex = this.drawVertex(this._mainContainer , this.drawObj.startVertex)
        this.drawObj.segments.push(this.drawObj.draftVertex)
        if (this.drawObj.draftLine) {
          this.drawObj.draftLine.tint = 0x000000
          this.drawObj.segments.push(this.drawObj.draftLine)
          this.drawObj.draftLine = null
        }
      }
    } else if(this.drawObj.type == 'brush'){
      event.stopPropagation()
      let gr = new PIXI.Graphics()
      this.drawObj.graphics = gr
      gr.interactive = true
      this._mainContainer.addChild(gr)
      gr.beginFill()
      this.drawObj.startVertex = newPos
      let opt = new GraphicOptions()
      opt.opacity = this.selectedStyle.brush.opacity
      opt.fillColor = new PixiCommon().hexToNumColor(this.selectedStyle.brush.color)//Number(this.selectedStyle.brush.color.replace("#",'0x'))
      this.drawObj.graphics.drawCircle(newPos.x , newPos.y , this.selectedStyle.brush.size / 40 , opt)
      this.clickEndEvts.forEach(t => {
        this.mouseUpListenerObj[t] = this.renderer.listen(document,t,()=>{
          gr.endFill()
          gr.zIndex = -1
          this.ngZone.run(()=> this.brushPaintings.push(gr))
          this.drawObj = {
            type: 'brush',
            startVertex: null,
            draftVertex: null,
            draftLine: null,
            segments: [],
            graphics: null,
            brushWidth: null
          }
          Object.keys(this.mouseUpListenerObj).forEach(k=> this.mouseUpListenerObj[k]())
        })
      })
    }
  }

  createWayPoint(x , y){
    let gr = this.getPixiLocPoint()
    this.allPixiPoints.push(gr)
    this.clickEndEvts.forEach(t=>{
      this.mouseUpListenerObj[t] = this.renderer.listen(document, t , () => this.onWayPointMouseDown(gr))
    })
    gr.position.set(x , y)
    this._mainContainer.addChild(gr)
    return gr
  }

  onWayPointMouseDown(wpgr) {
    this.endDraw()
    Object.keys(this.mouseUpListenerObj).forEach(k => this.mouseUpListenerObj[k]());
    this.selectGraphics(wpgr);
    (<any>wpgr.children.filter(c => c['type'] == 'input')[0]).focus()
  }

  highlightGraphics(gr : PIXI.Graphics){
    if(gr instanceof PixiMapLayer){
      if(gr.parent){
        gr.parent.sortableChildren = true
      }
      gr.zIndex = 100    
      gr.editable = true
    }else if(gr instanceof PixiArrow || gr instanceof PixiLocPoint || gr instanceof PixiPolygon || gr instanceof PixiPointGroup){
      gr.draw(true)
    }
  }

  unhighlightGraphics(gr: PIXI.Graphics){
    let type = gr['type'] 
    if(gr instanceof PixiMapLayer){
      gr.zIndex = 2
      gr.editable = false
    }else if(gr instanceof PixiArrow || gr instanceof PixiLocPoint || gr instanceof PixiPolygon|| gr instanceof PixiPointGroup ||  gr instanceof PixiChildPoint){
      gr.draw(false)
    }
  }

  async deleteSelectedGraphics(){
    let desc = this.selectedGraphics instanceof PixiLocPoint ? `[${this.selectedGraphics['text']}]` : ''
    if((!(this.selectedGraphics instanceof PixiLocPoint)|| (<PixiLocPoint>this.selectedGraphics).text?.length) && 
        !await this.uiSrv.showConfirmDialog(this.uiSrv.translate(`Are you sure to delete the selected item ?`) + ` ${desc}`)){
      return
    }
    delete this.selectedGraphics['onInputBlur'] 
    if(this.selectedGraphics instanceof PixiChildPoint){
      this.selectedGraphics.pixiPointGroup.parentPoint.hasPointGroup = false
      this.selectedGraphics.pixiPointGroup.parentPoint.draw()
    }else if(this.selectedGraphics instanceof PixiPointGroup){
      this.selectedGraphics.parentPoint.hasPointGroup = false
      this.selectedGraphics.parentPoint.draw()
    }else{
      this.removeGraphics(this.selectedGraphics)
    }
    this.selectedGraphics = null
    this.changeDetector.detectChanges()
  }
  

  removeGraphics(gr: PIXI.Graphics) {
    this.imageUploaded = this.imageUploaded.filter(i => i != gr)
    this.drawingsCreated = this.drawingsCreated.filter(p => p != gr)
    // this.allPixiPoints = this.allPixiPoints.filter(w => w != gr)
    this.brushPaintings = this.brushPaintings.filter(p => p != gr)
    this.linesCreated = this.linesCreated.filter(l => l != gr)
    
    if(gr instanceof PixiLocPoint){
      this.pointRemove.emit({graphics:gr , id : gr?.['id']})
    }
    if(this.selectedGraphics == gr){
      this.selectGraphics(null , true)
    }
    if(gr instanceof PixiLocPoint){
      let point = <PixiLocPoint> gr
      point.link.forEach(l=> {
        l.waypoint.link = l.waypoint.link.filter(l2=>l2.waypoint != point)
        l.arrow.fromShape = null
        l.arrow.toShape = null
        this.removeGraphics(l.arrow)
      })
    } else if (gr instanceof PixiArrow &&  gr?.fromShape &&  gr?.toShape ) {
      let arrow = <PixiArrow> gr
      arrow.fromShape.link =  arrow.fromShape.link.filter(l=>l.arrow != gr)
      arrow.toShape.link =  arrow.toShape.link.filter(l=>l.arrow != gr)
    }
    if (this._ngPixi.viewport.children.includes(gr)) {
      this._ngPixi.viewport.removeChild(gr)
    }    
    if (this._mainContainer.children.includes(gr)) {
      this._mainContainer.removeChild(gr)
    }
    //Case Else
    if (gr.parent) {
      gr.parent.removeChild(gr)
    }

    if(this.drawObj.segments){
      this.drawObj.segments = this.drawObj.segments.filter(s => s != gr);
    }

    this.shapeDeleted.emit(gr)
    if (gr instanceof PixiLocPoint && (<PixiLocPoint>gr).input) {
      (<PixiLocPoint>gr).input.blur()
    }
  }

  
  startEdit(type: 'resize' | 'move' | 'rotate' | 'vertex' | 'bezier',  gr:PIXI.Graphics , evt) {
    this.editObj.type = type,
    this.editObj.graphics = gr
    this.editObj.startPoint = new PIXI.Point(evt.data.getLocalPosition(this._mainContainer).x , evt.data.getLocalPosition(this._mainContainer).y)
    this.editObj.startPosition = new PIXI.Point(gr.position.x , gr.position.y)
    this.editObj.originalWidth = gr.width
    this.editObj.originalHeight = gr.height
    this.clickEndEvts.forEach(t => this.mouseUpListenerObj[t] = this.renderer.listen(document, t, () => this.endEdit()))
  }

  endEdit() {
    this.mode = null
    if (this.editObj && this.editObj.graphics != null) {
      let gr: PIXI.Graphics = this.editObj.type == 'vertex' ? this.editObj.graphics.parent : this.editObj.graphics
      if(this.editObj?.type == 'resize'){
        this.unhighlightGraphics(gr)
        this.highlightGraphics(gr)
      }
      if(['resize' , 'rotate'].includes(this.editObj?.type) ){ //&& gr['getTooltipGraphic']
        (<PixiCommon> gr)?.hideToolTip();
        if(gr instanceof PixiMapLayer){
          (<PixiMapLayer> gr)?.rotateHandle?.hideToolTip();
          (<PixiMapLayer> gr)?.resizeHandles.forEach(h=> {
            h?.hideToolTip()
            h.setCursor();
          });
        }
      }
      Object.keys(this.mouseUpListenerObj).forEach(k=> this.mouseUpListenerObj[k]())
    }


    this.editObj = {
      type : null,
      graphics:null,
      startPoint : null,
      startPosition : null,
      originalWidth: null,
      originalHeight : null
    }
  }


  startDraw(type){
    if(this.selectedGraphics!=null){
      this.selectGraphics(null) // NEED TESTING
    }
    if(this.arrowTypes.includes(type)){
      this.allPixiPoints.forEach(p=>p.toggleButton(true))
    }
    this.drawObj.type = type;
    if(!this.arrowTypes.includes(type)){
      if(type == 'spawn' && this.spawnPointObj.selectedMap){
        this.mapContainerStore[this.spawnPointObj.selectedMap].interactive = true;
        this.clickEvts.forEach(trigger => this.mapContainerStore[this.spawnPointObj.selectedMap].on(trigger, (evt) => this.onMouseDown(evt)))
      } else {        
        this.clickEvts.forEach(trigger => this._mainContainer.on(trigger , (evt) => this.onMouseDown(evt)))
      }
    }
  }

  endDraw() {
    if( this.pickLocObj.enable || (this.pickSpawnPoint && this.drawObj?.type == 'spawn')){
      return
    }
    this._ngPixi.viewport.resumePlugin("drag") 
    if (this.arrowTypes.includes(this.drawObj?.type ) && this.drawObj?.graphics){
      this.unhighlightGraphics(this.drawObj.graphics)
    }
    this.allPixiArrows.forEach(a=>a.draw(false))
    this.allPixiPoints.forEach(p=>p.toggleButton(false))
    this.mode = null
    if (this.drawObj && this.drawObj.segments) {
      this.drawObj.segments.forEach(s => {
        if(s instanceof PixiArrow){
          this.removeGraphics(s)
        }else{
          this._mainContainer.removeChild(s)
        }
      })
    }
    if (this.drawObj && this.drawObj.draftLine) {
      this._mainContainer.removeChild(this.drawObj.draftLine)
    }
    this.drawObj = {
      type: null,
      startVertex: null,
      draftVertex: null,
      draftLine: null,
      segments: [],
      graphics: null,
      brushWidth: null
    }
    this.changeDetector.detectChanges()
    this._mainContainer.removeAllListeners()
  }

  setMapOrigin(x , y){
    let origin = this.getMapOriginMarker()
    if(!origin){
      this._mainContainer.addChild(new PixiCommon().getOriginMarker(new PIXI.Point(0 ,0)))
    }
    origin = this.getMapOriginMarker()
    origin.position.set(x , y)    
  }

  getMapOriginMarker(){
    return this._mainContainer.children.filter(c=>c['type'] == 'origin')[0]
  }

  calculateMapOrigin(rvMetaX , rvMetaY , rosHeight , meterToPixelRatio){
    return [rvMetaX * meterToPixelRatio * -1 , ( rosHeight +  rvMetaY) * meterToPixelRatio]
  }

  getGuiOrigin(map: PixiMap){
   return this.calculateMapOrigin(map.originX  , map.originY, map.initialHeight / this.util.config.METER_TO_PIXEL_RATIO , this.util.config.METER_TO_PIXEL_RATIO)
  }

  // *** v refresh arrows on waypoint clicked / moved v ***
  refreshArrows(waypoint : PIXI.Graphics = null){
    this.allPixiArrows.filter(a=>!waypoint || a.fromShape == waypoint || a.toShape == waypoint).forEach(a =>{
      a.vertices = this.getLinkArrowAdjustedPoints(a.fromShape, a.toShape , undefined, a.type)
      a.draw(a._lastDrawIsSelected)
    })
  }

  refreshRobotScale(){
    if(new PixiCommon().autoScaleOnZoomed){
      let getScale = (gr) => new PixiCommon().robotIconScale / (this._ngPixi.viewport.scale.x * gr.parent?.scale.x)
      this.robots.forEach(r=>r.setIconScale(getScale(r.pixiGraphics)))     
      this.spawnPointObj.markerGraphic?.icon.scale.set(getScale(this.spawnPointObj.markerGraphic))
    }
  }

  // *** ^ refresh arrows on waypoint clicked / moved ^ ***

  async export(){
    // console.log(await this.getBackgroundImgBase64())
    // console.log(JSON.stringify(this.getSubmitDataset()))
    this.selectGraphics(null)
    let newContainer = new PIXI.Container()
    newContainer.addChild(PIXI.Sprite.from(this.backgroundSprite.texture))
    this.drawingsCreated.filter(c => !this.arrowTypes.includes(c['type'])).forEach((c : PIXI.Graphics) => newContainer.addChild(c.clone()))
    this.brushPaintings.forEach((b: PIXI.Graphics) => newContainer.addChild(b.clone()))
    this._ngPixi.app.renderer.extract.canvas(newContainer).toBlob(function (b) {
      var a = document.createElement('a');
      document.body.append(a);
      a.download = 'map';
      a.href = URL.createObjectURL(b);
      a.click();
      a.remove();
    }, 'image/png');
  }

  async getMainContainerImgBase64(excludeDrawings = false) {
    this.selectGraphics(null)
    let done = new BehaviorSubject(null)
    let newContainer = new PIXI.Container()
    newContainer.addChild(PIXI.Sprite.from(this.backgroundSprite.texture))
    if(!excludeDrawings){
      this.drawingsCreated.filter(c => !this.arrowTypes.includes(c['type'])).forEach((c : PIXI.Graphics) => newContainer.addChild(c.clone()))
      this.brushPaintings.forEach((b: PIXI.Graphics) => newContainer.addChild(b.clone()))
    }
    let image = this._ngPixi.app.renderer.extract.image(newContainer)
    image.onload = (e) => {
      done.next(e.target['src'])
    }
    if(done.value==null){
      await done.pipe(filter(v=>v!=null),take(1)).toPromise()
    }
    return done.value.replace('data:image/png;base64,' , '')
  }

  //===================================================================================================================================================
  
  // *** v data processing v ***
  async addContainer(id , imgSrc : string , orgWidth = null, orgHeight = null , positionX = 0, positionY = 0, scale = 1, rotation = 0 , originX = 0 , originY = 0 , mapCode = undefined) : Promise<PixiMapContainer>{
    let container : PixiMapContainer = (<PixiMapContainer>await this.getPixiMap(true, imgSrc, orgWidth, orgHeight, positionX, positionY, scale, rotation))
    container.originX = originX
    container.originY = originY
    var guiOrigin = this.getGuiOrigin(container)
    container.guiOriginX = guiOrigin[0]
    container.guiOriginY = guiOrigin[1]
    this.mainContainer.addChild(container);
    this.mapContainerStore[id] = container
    container.mapCode = mapCode
    return container
  }

  removeAllContainers() {
    Object.keys(this.mapContainerStore).forEach(k => {
      this.mainContainer.removeChild(this.mapContainerStore[k])
      delete this.mapContainerStore[k]
    })
  }

  async getPixiMap(isContainer, imgSrc: string, orgWidth = null, orgHeight = null, positionX = 0, positionY = 0, scale = 1, rotation = 0) : Promise<PixiMapContainer | PixiMapLayer>{
    imgSrc = imgSrc ? (imgSrc.startsWith('data:image') ? imgSrc : ('data:image/png;base64,' + imgSrc)) : null
    let ret : PixiMapContainer | PixiMapLayer = isContainer ?  new PixiMapContainer() : new PixiMapLayer()
    if( imgSrc && (orgWidth == null || orgHeight == null)){
      let dim = await new PixiCommon().getImageDimensionFromUrl(imgSrc)
      orgWidth = dim[0]
      orgHeight = dim[1]
    }
    // this.mapWidth = orgWidth// map.originalWidth
    // this.mapHeight = orgHeight //map.originalHeight  

    // v 20220504 Show Live Lidar Red Dots , Toggle show Ros Map v
    // let sprite = isContainer ? new PIXI.Sprite() : new PIXI.Sprite(PIXI.Texture.from(imgSrc));
    // sprite.alpha = isContainer ? 1 : 0.5 //testing

    let sprite = imgSrc ?  await this.getSpriteFromUrl(imgSrc) : new PIXI.Sprite(PIXI.Texture.WHITE);
    sprite.width = imgSrc ? sprite.width : orgWidth
    sprite.height = imgSrc ? sprite.height : orgHeight
    sprite.alpha = isContainer ? 0 : 0.5 
    
    ret.addChild(sprite);
    (<PixiMap>ret).initialWidth = orgWidth ; 
    (<PixiMap>ret).initialHeight = orgHeight ; 
    ret = isContainer ? ret : this.pixiMapLayer(sprite , orgWidth , orgHeight )
    ret.width = orgWidth //map.originalWidth
    ret.height = orgHeight//  map.originalHeight
    if(!isContainer){
      // this.addRectangularBorder(<PIXI.Graphics>ret, orgWidth, orgHeight)  ; 
     //((<PixiMapLayer>ret) , orgWidth ,orgHeight)   
      this.unhighlightGraphics(<PIXI.Graphics>ret)
    }else{
      ret.pivot.set(orgWidth/2 , orgHeight/2)
    }
    ret.base64Image = imgSrc
    ret.position.set(positionX + orgWidth/2 , positionY + orgHeight/2)
    ret.scale.set( scale , scale)
    ret.angle = rotation
    ret.ROS = sprite
    return ret
  }

  async convertJMapToUniversalResolution(mapData: JMap) {
    let stdRatio = 1 / this.util.config.METER_TO_PIXEL_RATIO
    if (mapData.resolution && mapData.resolution != stdRatio) {
      mapData.imageWidth = Math.ceil(mapData.imageWidth * (mapData.resolution / stdRatio))
      mapData.imageHeight = Math.ceil(mapData.imageHeight * (mapData.resolution / stdRatio))
      mapData.base64Image = await this.getResizedBase64(mapData.base64Image, mapData.imageWidth, mapData.imageHeight)
      mapData.resolution = stdRatio
    }
  }


  async loadMapV2(mapData : JMap) : Promise<PixiMapLayer>{
    await this.convertJMapToUniversalResolution(mapData); //20221024
    let ticket = this.uiSrv.loadAsyncBegin()
    let ret : PixiMapLayer = (<PixiMapLayer>(await this.getPixiMap(false , mapData.base64Image, mapData.imageWidth, mapData.imageHeight, mapData.transformedPositionX, mapData.transformedPositionY, mapData.transformedScale, mapData.transformedAngle)))
    ret.robotBase = mapData.robotBase
    ret.mapCode = mapData.mapCode
    ret.originX = mapData.originX
    ret.originY = mapData.originY
    var guiOrigin = this.getGuiOrigin(ret)
    ret.guiOriginX = guiOrigin[0]
    ret.guiOriginY = guiOrigin[1]
    ret.dataObj = mapData
    // this._ngPixi.viewport.addChild(gr); //20220611
    this.mainContainer.addChild(ret);
    // ret.editable = true
    this.mapLayerStore[this.util.arcsApp ? mapData.robotBase : ret.mapCode] = ret
    ret.zIndex = 1
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }  

  removeMaps(){
    this.mainContainer.children.filter(c => c instanceof PixiMapLayer).forEach(c => this.mainContainer.removeChild(c))
    this.mapLayerStore = {}
    Object.keys(this.mapLayerStore).forEach(k=>delete this.mapLayerStore[k])
  }

  async loadArcsBuildings(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropList('buildings')
    this.dropdownData.buildings = ddl.data
    let buildings: DropListBuilding[] = <any>ddl.data
    buildings.filter(b=>b.polygonCoordinates && b.polygonCoordinates.length > 0).forEach(b => {
      let polygon = this.getBuildingPolygon(b.polygonCoordinates , {x : b.labelX , y : b.labelY} , true)
      polygon.arcsBuildingCode = `${b.buildingCode}`
      polygon.arcsBuildingName = `${b.name}`
    })
    // this.dropdownOptions.
    this.uiSrv.loadAsyncDone(ticket)
  }

  async loadFloorPlanDatasetV2(dataset: JFloorPlan, readonly = false, locationOnly = null, showFloorPlanName = true, setCamera = true) {
    let ret = new Subject()
    let ticket
    this.ngZone.runOutsideAngular(async () => {
      ticket = this.uiSrv.loadAsyncBegin()
      this.reset()
      await this.loadToMainContainer(dataset.base64Image, undefined, undefined, showFloorPlanName ? dataset.name : null , dataset.floorPlanCode)
      this.dijkstra = getDijkstraGraph(dataset.pathList)
      if (setCamera && dataset.viewX && dataset.viewY && dataset.viewZoom) {
        this.defaultPos = {
          x: dataset.viewX,
          y: dataset.viewY,
          zoom: dataset.viewZoom
        }
        this.setViewportCamera(this.defaultPos.x, this.defaultPos.y, this.defaultPos.zoom)
      }
      if(this.isDashboard || this.pickSpawnPoint){
        for(let i = 0 ; i < dataset.mapList.length ; i++){
          var mapData  = dataset.mapList[i];
          await this.convertJMapToUniversalResolution(mapData); //20221024
          let container : PixiMapContainer = await this.addContainer(`${mapData.mapCode}${this.util.arcsApp ? ('@' + mapData.robotBase) : ''}`,  
                                                                       mapData.base64Image,
                                                                       mapData.imageWidth, 
                                                                       mapData.imageHeight, 
                                                                       mapData.transformedPositionX, 
                                                                       mapData.transformedPositionY, 
                                                                       mapData.transformedScale, 
                                                                       mapData.transformedAngle , 
                                                                       mapData.originX , 
                                                                       mapData.originY )
          container.mapCode = mapData.mapCode
          container.robotBase = mapData.robotBase
        }
      }
      ret.next(this.loadShapesV2(dataset, readonly, locationOnly))
      if(readonly && locationOnly){
        this.mapTransformedScale = Math.max.apply(null , dataset.mapList.map(m=>m.transformedScale))
      }
    })
    ret =  await <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
    this.uiSrv.loadAsyncDone(ticket)
    this.arcsLocationTree.currentLevel = 'floorplan'
    return ret
  }

  loadShapesV2(dataset : JFloorPlan , readonly = false , locationOnly = null) : PIXI.Graphics[]{ 
    locationOnly = locationOnly!=null ? locationOnly : readonly
    let ret = []
    let addPixiGraphic = (gr : PIXI.Graphics)=>{
      ret.push(gr)
      this._mainContainer.addChild(gr)
    }

    dataset.pointList.forEach((data: JPoint) => {
      let pixiPoint : PixiLocPoint = this.getPixiLocPoint(undefined , data.pointCode , 'waypoint' , null , data.userDefinedPointType);
      pixiPoint.waypointName =  data.pointCode; //TBDelete
      pixiPoint.readonly = readonly;
      pixiPoint.orientationAngle = data.guiAngle
      pixiPoint.position.set(data.guiX , data.guiY)
      pixiPoint.dataObj = data
      pixiPoint.pointType = data.pointType
      addPixiGraphic(pixiPoint)
      if(data.groupProperties && data.groupProperties!= "" ){
        pixiPoint.hasPointGroup = true
        let group =  pixiPoint.pixiPointGroup
        group.settings = JSON.parse(data.groupProperties)
        let settings = group.settings
        group.pixiChildPoints = []
        group.pivot.set(settings.pivot.x, settings.pivot.y)
        group.position.set(settings.position.x, settings.position.y)
        group.angle = settings.angle
        data.groupMemberPointList.forEach(c => {
          let seq =  Number(c.pointCode.split("-")[c.pointCode.split("-").length - 1])
          let child = new PixiChildPoint(group, group.settings.scale , seq)
          let pos = group.toLocal(this.mainContainer.toGlobal(new PIXI.Point(c.guiX , c.guiY)))
          child.position.set(pos.x , pos.y)
          child.robotAngle = c.guiAngle - group.settings.angle
          group.pixiChildPoints.push(child)
          group.addChild(child)
          // child.draw()
        })
        group.visible = false
        //JSON.parse(data.pointGroupSettings)
      }
    })

    dataset.pathList.forEach((data: JPath) => {
      let isBidirectional = dataset.pathList.filter((d2 : JPath) =>  data.destinationPointCode == d2.sourcePointCode &&  d2.destinationPointCode == data.sourcePointCode).length > 0
      if(ret.filter(gr=>gr instanceof PixiArrow && (<PixiArrow>gr).bidirectional && (<PixiArrow>gr).fromShape.code == data.destinationPointCode && (<PixiArrow>gr).toShape.code == data.sourcePointCode).length > 0){ // check 2 way second
        return
      }
      let isCurved = data.controlPointList.length > 0
      let tmpType = 'arrow'+ (isBidirectional ? '_bi' : '') + (isCurved ? '_curved': '')
      let pixiFrPoint : PixiLocPoint =  ret.filter(s=>s instanceof PixiLocPoint && s.code == data.sourcePointCode)[0]
      let pixiToPoint : PixiLocPoint =  ret.filter(s=>s instanceof PixiLocPoint && s.code == data.destinationPointCode)[0]
      let tmpVerts = isCurved ? [pixiFrPoint.position , pixiToPoint.position] : this.getLinkArrowAdjustedPoints(pixiFrPoint, pixiToPoint)
      let pixiArrow = this.getArrow([tmpVerts[0], tmpVerts[1]], tmpType ); //this.getArrow(vertices[0] , vertices[1] , opt, r.type)
      pixiArrow.fromShape = pixiFrPoint
      pixiArrow.toShape = pixiToPoint
      pixiArrow.velocityLimit = data.maximumVelocity;
      pixiArrow.direction = data.direction;
      // pixiArrow.isBidirectional = isBidirectional
      addPixiGraphic(pixiArrow)
      pixiFrPoint.link.push({arrow : pixiArrow , waypoint : pixiToPoint})
      pixiToPoint.link.push({arrow : pixiArrow , waypoint : pixiFrPoint})   
      pixiArrow.dataObj = data   
      if(isCurved){
        let getLocalPos = (v)=>pixiArrow.toLocal(this.mainContainer.toGlobal(new PIXI.Point( v.x , v.y)))
        pixiArrow.setCurveControlPoints(getLocalPos(data.controlPointList[0])  , getLocalPos(data.controlPointList[1]));
        pixiArrow.quadraticCurve = data.controlPointList[0].x == data.controlPointList[1].x &&  data.controlPointList[0].y == data.controlPointList[1].y
      }      
      if(locationOnly){
        pixiArrow.visible = false
      }
    })
    if(this.isDashboard && this.dataSrv.getlocalStorage('uitoggle')){
      this.uitoggle = JSON.parse(this.dataSrv.getlocalStorage('uitoggle'))
    }
    this.toggleWaypoint(this.uitoggle.showWaypoint)
    this.togglePath()
    return ret
  }

  getSubmitDatasetV2(floorPlanCode = null ) : JFloorPlan {
    this.selectGraphics(null)
    let copyOriginalData = (pixiObj : PixiCommon, ret)=>{
      if(pixiObj.dataObj){
        Object.keys(pixiObj.dataObj).forEach(k=> ret[k] = pixiObj.dataObj[k])
      }
      return ret
    }

    let hasMap =  this.mainContainer.children.filter(c=> c instanceof PixiMapLayer).length > 0
    let points: JPoint[] = this.allPixiPoints.map((point: PixiLocPoint) => {
      let pt : JPoint = copyOriginalData(point , new JPoint())
      pt.floorPlanCode = floorPlanCode
      pt.guiAngle = point.orientationAngle
      pt.guiX = point.position.x 
      pt.guiY = point.position.y 
      pt.pointCode = point.code
      pt.userDefinedPointType = point.iconType
      pt.pointType = point.pointType
      pt.groupProperties = hasMap && point.hasPointGroup ? JSON.stringify(point.pixiPointGroup.settings) : ""
      if(hasMap && point.hasPointGroup){
        let group = point.pixiPointGroup
        group.refreshGraphics()
        group.refreshRelativePosition()
        group.settings.position = {x : group.position.x , y: group.position.y}
        group.settings.pivot = {x : group.pivot.x , y: group.pivot.y}
        group.settings.angle = group.angle
        group.settings.width = group.width
        group.settings.height = group.height
        pt.groupProperties = JSON.stringify(group.settings) 
        pt.groupPointCode = pt.pointCode
      }
      pt.groupMemberPointList = hasMap && point.hasPointGroup ? point.pixiPointGroup.pixiChildPoints.map(c=> {
        let ret = new JPoint()
        let pos = c.toGlobal(c.icon.pivot)
        let guiPos = this.mainContainer.toLocal(c.parent.toGlobal(c.position)) 
        ret.floorPlanCode = floorPlanCode
        ret.guiAngle = c.robotAngle + c.parent.angle
        ret.guiX = guiPos.x
        ret.guiY = guiPos.y
        ret.pointCode = `${pt.pointCode}-${(c.seq).toString().padStart(2 , '0')}`
        ret.userDefinedPointType = pt.userDefinedPointType
        ret.groupPointCode = pt.groupPointCode
        ret.positionX = pos.x
        ret.positionY = pos.y
        return ret
      }) : []
      return pt
    })

    let getJPath = (arrow : PixiArrow , reverseDirection = false, map : PixiMapLayer = null) =>{
      let path = copyOriginalData(arrow , new JPath())
      path.floorPlanCode = floorPlanCode
      path.controlPointList = arrow.isCurved? arrow.getControlPointGlobalPositions(map).map(p => { 
        let convertedPostion = map ? this.calculateRosPosition(p , map) : p
        return { x: this.util.trimNum(convertedPostion.x), y: this.util.trimNum(convertedPostion.y) } 
      }) : []
      path.controlPointList = arrow.isCurved && reverseDirection ? [path.controlPointList[1], path.controlPointList[0]] : path.controlPointList
      path.sourcePointCode = reverseDirection ? arrow.toShape.code : arrow.fromShape.code 
      path.destinationPointCode =  reverseDirection ? arrow.fromShape.code : arrow.toShape.code 
      path.direction = arrow.direction
      path.maximumVelocity = arrow.velocityLimit
      path.length = this.util.trimNum(getLength(arrow.isCurved , [arrow.fromShape.position , path.controlPointList[0] , path.controlPointList[1] , arrow.toShape.position ]) , 0)
      return path
    }
    let getPaths = (map : PixiMapLayer = null)=> this.allPixiArrows.map(a => getJPath(a, false, map)).concat(this.allPixiArrows.filter(a => a.bidirectional).map(a => getJPath(a, true , map)))
    
    let maps = this.mainContainer.children.filter(c=> c instanceof PixiMapLayer).map((map : PixiMapLayer) => {
      let m : JMap = copyOriginalData(map , new JMap())
      m.floorPlanCode = floorPlanCode
      m.robotBase = map.dataObj?.robotBase
      m.originX = map.originX
      m.originY = map.originY
      m.mapCode = map.mapCode
      m.name = map.dataObj?.name
      m.resolution = map.dataObj?.resolution
      m.base64Image = map.base64Image
      m.transformedAngle = this.util.trimNum(map.angle)
      m.transformedScale = this.util.trimNum(map.scale.x)
      m.transformedPositionX = this.util.trimNum(map.position.x - map.initialOffset?.x)
      m.transformedPositionY = this.util.trimNum(map.position.y - map.initialOffset?.y)
      m.imageHeight = this.util.trimNum(map.initialHeight, 0)
      m.imageWidth =this.util.trimNum(map.initialWidth , 0)

      m.pointList = points.map(pt=> {
        let p = new JPoint()
        let pos : PIXI.Point = map.toLocal(this.mainContainer.toGlobal(new PIXI.Point(pt.guiX, pt.guiY)))
        p.mapCode = m.mapCode
        p.robotBase = m.robotBase
        p.floorPlanCode = floorPlanCode
        p.pointCode = pt.pointCode
        p.guiAngle = this.util.trimNum(trimAngle(pt.guiAngle - map.angle))
        p.guiX = pos.x , 0
        p.guiY = pos.y , 0
        p.positionX = this.calculateRosPosition(pos, map).x
        p.positionY = this.calculateRosPosition(pos, map).y
        p.angle = (90 - p.guiAngle) / radRatio
        return p
      }).filter(p=> p.guiY > 0 && p.guiY  <= map.height / map.scale.y &&  p.guiX  > 0 && p.guiX <= map.width / map.scale.x).concat(
        Array.prototype.concat.apply([] , points.filter(pt=>pt.groupMemberPointList.length > 0).map(pt => pt.groupMemberPointList.map(c=> {
          let mapChildPt = new JPoint()
          let pos = this.calculateRosPosition(map.toLocal(new PIXI.Point(c.positionX , c.positionY)), map)
          mapChildPt.mapCode = m.mapCode
          mapChildPt.robotBase = m.robotBase
          mapChildPt.floorPlanCode = floorPlanCode
          mapChildPt.pointCode = c.pointCode 
          mapChildPt.guiX = c.guiX
          mapChildPt.guiY = c.guiY
          mapChildPt.positionX = pos.x
          mapChildPt.positionY = pos.y
          mapChildPt.angle = (90 - c.guiAngle) / radRatio
          return mapChildPt
        })))
      )
      m.pathList = JSON.parse(JSON.stringify(getPaths(map)))
      m.pathList.forEach(p=>{
        p.mapCode = m.mapCode
        p.robotBase = m.robotBase
      })
      return m
    })

    return {
      floorPlanCode: floorPlanCode,
      base64Image: this.backgroundImgBase64,
      mapList: maps,
      pointList: points,
      pathList: getPaths(),
      viewZoom: this.getViewportPosition().defaultZoom,
      viewX: this.util.trimNum(this.getViewportPosition().defaultX, 0),
      viewY: this.util.trimNum(this.getViewportPosition().defaultY, 0)
    }
  }
  
  // *** ^ data processing ^ ***

  //===================================================================================================================================================


  async sendNavigationRequestToRV() {
    let ticket = this.uiSrv.loadAsyncBegin()
    // pickLocObj.enable TBD
    let resp
    // let waypointDispName 
    if(this.pickLocObj.enable){
      resp = await this.httpSrv.rvRequest('POST', 'navigation/v1/pose', {
         x : this.pickLocObj.rosX,
         y : this.pickLocObj.rosY,
         angle :  trimAngle( 90 - this.pickLocObj.angle ) / radRatio
      })  
    }else{
      await this.httpSrv.rvRequest('POST', 'mode/v1/navigation')
      // let waypointName = this.selectedLocation
      // waypointDispName = new PixiCommon().getWayPointDispName(waypointName)
      resp = await this.httpSrv.rvRequest('POST', 'navigation/v1', {
        waypointName:  this.selectedLocation,
        navigationMode: "AUTONOMY",
        orientationIgnored: false,
        fineTuneIgnored: true
      })      
    }
    // let wpMsg = (waypointDispName ?  '- ' + waypointDispName : '')
    if (resp.status == 200 && resp.body && JSON.parse(resp.body)?.status == 'SUCCEEDED') {
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Navigation Successs") + " " + this.selectedLocation , 'success')
    } else {
      let msg = resp.body && resp.body != '' && this.uiSrv.translate(JSON.parse(resp.body)?.text) ? JSON.parse(resp.body)?.text : this.selectedLocation ; 
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Navigation Failed") + '- ' + msg, 'error')
    }      
    this.uiSrv.loadAsyncDone(ticket)
  }

  initLocalizerGraphic() {
    if (!this.spawnPointObj.markerGraphic) {
      this.spawnPointObj.markerGraphic = new PixiCommon().getRobotMarker(this.highlightColor, 0, 0, this.spawnPointObj.rotation)
      this.spawnPointObj.markerGraphic['interval'] = setInterval(() => {
        this.spawnPointObj.markerGraphic.alpha = this.spawnPointObj.markerGraphic.alpha == 1 ? 0.4 : 1
      }, 1000)
      setTimeout(()=>this.refreshRobotScale())
      // this.refreshRobotScale()
      this.mapContainerStore[this.spawnPointObj.selectedMap].addChild(this.spawnPointObj.markerGraphic)
    }
  }

  
  async sendLidarRequestToRV(changeMap = true){
    let ticket = this.uiSrv.loadAsyncBegin()
    if(changeMap){
      if (!this.dataSrv.signalRSubj.isFollowMeMode) {
        await this.httpSrv.rvRequest('POST', 'mode/v1/navigation')
      }
      // let targetMap = (<DropListMap[]>this.dropdownData.maps).filter(m => m.mapId == this.spawnPointObj.selectedMap)[0].mapCode
      await this.httpSrv.rvRequest('POST', 'map/v1/change', { mapName: this.spawnPointObj.selectedMap, useInitialPose: false, waypointName: null })
      Object.values(this.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = true)
      this.uiSrv.showNotificationBar("Map changed successfully" , 'success')
      this.spawnPointObj.rosX = 0
      this.spawnPointObj.rosY = 0
      this.spawnPointObj.rotation =  0
    } else {
      await this.getDropList()
      let poseResp: { x: number, y: number, mapName: string, angle: number } = await this.httpSrv.rvRequest('GET', 'localization/v1/pose', undefined, false)
      this.spawnPointObj.rotation = trimAngle(poseResp.angle * radRatio)
      this.spawnPointObj.rosX = poseResp.x
      this.spawnPointObj.rosY = poseResp.y
      this.spawnPointObj.selectedMap = poseResp.mapName
      this.spawnPointObj.selectedPlan = (<DropListMap[]>this.dropdownData.maps).filter(m => m.mapCode == poseResp?.mapName)[0]?.floorPlanCode
      if (this.spawnPointObj.selectedPlan == null) {
        this.uiSrv.showNotificationBar("No valid active map detected. Please change map first" , 'error')
        this.cancelFullScreen.emit()
        this.uiSrv.loadAsyncDone(ticket)
        return
      } else {
        await this.onFloorplanSelected_SA()
      }
    }  
    // this.pickSpawnPoint = false
    this.initLocalizerGraphic()
    this.spawnPointObj.markerGraphic.parent.visible = true
    this.spawnPointObj.alignLidar = true
    // this.initRoundSlider()    
    this.spawnPointObj.x = this.spawnPointObj.markerGraphic?.position.x
    this.spawnPointObj.y = this.spawnPointObj.markerGraphic?.position.y
    let lidarResp = await this.httpSrv.rvRequest('GET' , 'lidar/v1',undefined,false)
    this.uiSrv.loadAsyncDone(ticket)
    // let mapContainer : PIXI.Container = <any> (Object.values(this.mapContainerStore).filter(m=>m['mapCode'] == lidarResp['mapName'])[0])
    let mapContainer : PixiMapContainer =  <PixiMapContainer>this.mapContainerStore[this.spawnPointObj.selectedMap] //testing
    // this.initSpawnGraphic()
    this.refreshSpawnMarkerPosByRosValue();
    this.spawnPointObj.lidarPosition = new PIXI.Point( this.spawnPointObj.x  ,  this.spawnPointObj.y)
    mapContainer.ROS.alpha = 0.8
    this.spawnPointObj.lidarLayer = new PIXI.Graphics();
    mapContainer.addChild(this.spawnPointObj.lidarLayer)
    let pivotLayer = new PIXI.Graphics();
    this.spawnPointObj.lidarLayer.addChild(pivotLayer)
    pivotLayer.beginFill(0xFFFFFF, 0).drawRect(0,0, mapContainer.initialWidth, mapContainer.initialHeight).endFill()
    let pointsLayer = new PIXI.Graphics();
    pivotLayer.pivot.set(this.spawnPointObj.x  , this.spawnPointObj.y)
    pivotLayer.position.set( this.spawnPointObj.x  , this.spawnPointObj.y)
    pivotLayer.angle = 90 - this.spawnPointObj.rotation
    pivotLayer.addChild(pointsLayer)
    pointsLayer.pivot.set(pivotLayer.pivot.x , pivotLayer.pivot.y)
    pointsLayer.position.set(pivotLayer.pivot.x , pivotLayer.pivot.y)
    pointsLayer.angle = this.spawnPointObj.rotation - 90
    lidarResp.pointList.forEach((p) => {
      pointsLayer.beginFill(0xFF0000).drawCircle( this.calculateMapX(p['x']  , mapContainer.guiOriginX ), this.calculateMapY(p['y']  , mapContainer.guiOriginY) , 1.5).endFill()
    });
    this.spawnPointObj.lidarLayer['getPivotLayer'] = ()=> pivotLayer
  }

  async sendLocalizeRequestToRV(){
    // this.testPose()
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
    // if(!this.dataSrv.signalRSubj.isFollowMeMode.value){      
    //   await this.httpSrv.rvRequest('POST' , 'mode/v1/navigation')
    // }
    // await this.httpSrv.rvRequest('POST' , 'map/v1/change' , { mapName: this.spawnPointObj.selectedMap, useInitialPose: false,  waypointName: null})
    if(this.spawnPointObj.markerGraphic){
      await this.httpSrv.rvRequest('PUT' , 'localization/v1/initialPose' , 
        { x: this.calculateRosX(this.spawnPointObj.x) , 
          y : this.calculateRosY(this.spawnPointObj.y) ,
          angle: this.util.trimNum((this.spawnPointObj.rotation) /radRatio) 
        },undefined, this.uiSrv.translate('Localize'))
    }else{
      await this.httpSrv.rvRequest('PUT' , 'localization/v1/' + ((<DropListLocation[]> this.dropdownData.locations).filter(l=>l.pointCode == this.selectedLocation)[0]).pointCode,undefined,undefined, this.uiSrv.translate('Localize'))    
    }
    this.resetLidarLayer()
  }

  undoSpawnPosition(){
    let pos = this.spawnPointObj.footprint.pop()
    this.spawnPointObj.x = pos.x
    this.spawnPointObj.y = pos.y
    this.spawnPointObj.rotation = pos.angle
    this.spawnPointObj.markerGraphic.position.set(pos.x , pos.y)
    this.refreshLidarLayerPos()
  }
  
  resetLidarLayer(){
    this.spawnPointObj.alignLidar = false
    if(this.spawnPointObj.lidarLayer){
      this.spawnPointObj.lidarLayer.parent.removeChild( this.spawnPointObj.lidarLayer)
      this.spawnPointObj.lidarLayer = null
    }
  }

  refreshLidarLayerPos(){
    if(this.spawnPointObj.alignLidar && this.spawnPointObj.lidarLayer){
      this.spawnPointObj.lidarLayer.position.set(this.spawnPointObj.x - this.spawnPointObj.lidarPosition.x , this.spawnPointObj.y - this.spawnPointObj.lidarPosition.y)
      this.spawnPointObj.lidarLayer['getPivotLayer']().angle = 90 - this.spawnPointObj.rotation 
      this.refreshSpawnMarkerPos()
    }
  }
  // *** v dropdown select location v ***
  
  async getDropList(loadFp = false) {    
   // let tblList = ['floorplans','maps','locations'].concat(this.util.arcsApp? ['buildings']:[]).filter(k=>!this.dropdownData[k] || this.dropdownData[k].length == 0)
   let tblList = ['floorplans','maps'].filter(k=>!this.dropdownData[k] || this.dropdownData[k].length == 0) 
   let dropLists = await this.dataSrv.getDropLists(<any>tblList); //TBD filter floorplan => only with maps
    
    tblList.forEach(k => this.dropdownOptions[k] = dropLists.option[k]);
    tblList.forEach(k => this.dropdownData[k] = dropLists.data[k])
    // if( this.util.arcsApp && this.arcsObjs.hierarchy.building){
    //   this.dropdownOptions.floorplans = this.dropdownData['floorplans'].filter((p:DropListFloorplan)=> p.buildingId == this.arcsObjs.hierarchy.building.id).
    //                                                                     map((p:DropListFloorplan)=>{return {value : p.floorPlanCode , text : p.name}})
    // }

    // this.spawnPickObj.dropdownOptions.floorplans = dropLists.option['floorplans']
    // this.spawnPickObj.dropdownData.maps = dropLists.data['maps']
    if (loadFp && this.dropdownOptions.floorplans.length > 0) {
      this.spawnPointObj.selectedPlan = this.dropdownOptions.floorplans.map(p=>p.value.toString()).includes(this.dataSrv.getlocalStorage('lastLoadedFloorplanCode')) ?
                           this.dataSrv.getlocalStorage('lastLoadedFloorplanCode') : 
                           this.dropdownOptions.floorplans[0].value
      this.spawnPointObj.selectedMap = this.dropdownData.maps.filter((m:DropListMap)=>m.floorPlanCode ==  (<DropListFloorplan>this.spawnPointObj.selectedPlan[0]?.floorPlanCode))
      this.onFloorplanSelected_SA()
    }
    // this.dropdownOptions.floorplans.forEach(o=>o['suffix'] = 'test')
    // console.log(this.dropdownOptions.floorplans)
  }

  async setFloorplanRobotCount(){
    if(this.util.arcsApp){
      let ticket = this.uiSrv.loadAsyncBegin()
      let robotInfo : RobotStatusARCS[]  =  await this.dataSrv.httpSrv.rvRequest('GET', 'robot/v1/robotInfo' + (this.arcsRobotType ? `?robotType=${this.arcsRobotType.toUpperCase()}` : ''), undefined, false)
      this.dropdownOptions.floorplans.forEach((o : {value : string , text : string , suffix: string})=>{
        let count = robotInfo.filter(r=>r.floorPlanCode == o.value).length
        o.suffix =  count == 0 ? undefined : count.toString()
      })

      this.uiSrv.loadAsyncDone(ticket)
    }
  }

  async refreshLocationOptions(){
    if(this.pickSpawnPoint){
      this.dropdownOptions.locations = this.allPixiPoints.map(g => {return {value : g.code , text: g.code}})
    } else if(this.showNavigationDropdown){
      if(!this.dropdownData.locations || this.dropdownData.locations.length == 0){
        this.dropdownData.locations =  (await this.dataSrv.getDropList('locations')).data
      }
      this.dropdownOptions.locations =  this.dataSrv.getDropListOptions('locations' ,this.dropdownData.locations  , {floorPlanCode :this.spawnPointObj.selectedPlan ? this.spawnPointObj.selectedPlan : this.mainContainerId})
    }
  }

  async onFloorplanSelected_SA(){
    if(this.pickSpawnPoint){
      let ds = await this.dataSrv.getFloorPlanV2(this.spawnPointObj.selectedPlan)
      await this.loadFloorPlanDatasetV2(ds, true , true)
      this.spawnPointObj.selectedMap = ds.mapList[0]?.mapCode
      this.changeMode('draw','spawn')
      this.removeSpawnMarker()
      Object.values(this.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = false)
    }
    this.refreshLocationOptions()
  }
  
  onSpawnPointSelected(){
    this.removeSpawnMarker()
  }

  removeSpawnMarker(){
    if(this.spawnPointObj.markerGraphic){
      this.spawnPointObj.markerGraphic?.parent?.removeChild(this.spawnPointObj.markerGraphic)
      clearInterval(this.spawnPointObj.markerGraphic['interval'])
      this.spawnPointObj.markerGraphic = null
    }
  }

  refreshSpawnMarkerPosByJoystick(evt){
    let scale = 0.000025 * Math.min( 2 , (1 + evt.holdCount)/2)
    this.adjustSpawnMarkerPosition( evt.x * scale * this.mapContainerStore[this.spawnPointObj.selectedMap].width  , 
                                    evt.y  * scale * this.mapContainerStore[this.spawnPointObj.selectedMap].height 
                                  )
    this.refreshSpawnMarkerPosByRosValue(); 
    this.refreshLidarLayerPos();
  }

  adjustSpawnMarkerPosition(dX , dY){
    let adjustAngle = this.mapContainerStore[this.spawnPointObj.selectedMap].angle
    this.spawnPointObj.x += dX * Math.cos(adjustAngle / radRatio) - dY * Math.sin(adjustAngle / radRatio)
    this.spawnPointObj.y += - dY * Math.cos(adjustAngle / radRatio) - dX * Math.sin(adjustAngle / radRatio)
    this.refreshSpawnMarkerPos()
  }

  refreshSpawnMarkerPos(refreshRosValue = true){
    if(this.spawnPointObj.markerGraphic){
      this.spawnPointObj.markerGraphic.position.set(this.spawnPointObj.x , this.spawnPointObj.y)
      this.spawnPointObj.markerGraphic.icon.angle = 90 - this.spawnPointObj.rotation  //RV default align origin robot direction align with x-axis
      if(refreshRosValue){
        this.spawnPointObj.rosX = this.calculateRosX(this.spawnPointObj.x , this.spawnPointObj.selectedMap)
        this.spawnPointObj.rosY = this.calculateRosY(this.spawnPointObj.y, this.spawnPointObj.selectedMap)
      }
    }
  }

  refreshSpawnMarkerPosByRosValue(){
    let mapContainer : PixiMapContainer =  this.mapContainerStore[this.spawnPointObj.selectedMap];
    this.spawnPointObj.x = this.calculateMapX(this.spawnPointObj.rosX ,mapContainer?.guiOriginX)
    this.spawnPointObj.y = this.calculateMapY(this.spawnPointObj.rosY ,mapContainer?.guiOriginY)
    this.refreshSpawnMarkerPos(false)
  }

  refreshPixiLocColor(mouseOverPointCode = null){
    // this.allPixiPoints.forEach((g: PixiLocPoint) => g.draw(this.selectedLocation && g.code == this.selectedLocation))
    this.allPixiPoints.filter((g: PixiLocPoint) => g.code == mouseOverPointCode || g._lastDrawIsSelected || g._lastDrawIsMouseOver).forEach(g => {
      g.draw(this.selectedLocation && g.code == this.selectedLocation, mouseOverPointCode == g.code) //selected = false , mouseover = shapeID != null
    })
  }

  refreshSelectedPixiLoc() {
    let pixiLoc = this.allPixiPoints.filter((g: PixiLocPoint) => g.code == this.selectedLocation)[0]
    this.selectGraphics(pixiLoc)
  }

  //v 20220504 v 
  toggleRosMap(show , toggleFloorplan = false){
    this.uitoggle.showRosMap = show;
    [this.mapLayerStore, this.mapContainerStore].forEach(obj => {
      Object.keys(obj).filter(k => obj[k] && obj[k]['ROS']).forEach(k => {
        (<PixiMap>obj[k]).ROS.alpha = this.uitoggle.showRosMap ?  0.5 : 0;
        (<PixiCommon>obj[k]).visible = true
      })
    })    
    if(toggleFloorplan){
      this.backgroundSprite.visible = !this.uitoggle.showRosMap 
    }
  }

  toggleWaypoint(show = this.uitoggle.showWaypoint){
    if(this.isDashboard){
      this.dataSrv.setlocalStorage('uitoggle' , JSON.stringify(this.uitoggle))
    }
    this.uitoggle.showWaypoint = show;
    this.allPixiPoints.forEach(p=>{
      p.visible = show
      p.readOnlyPixiText.visible = this.uitoggle.showWaypointName
      p.inputBg.visible = this.uitoggle.showWaypointName
    })
  }

  togglePath(show = this.uitoggle.showPath){
    if(this.isDashboard){
      this.dataSrv.setlocalStorage('uitoggle' , JSON.stringify(this.uitoggle))
    }
    this.uitoggle.showPath = show;
    this.allPixiArrows.forEach(p=>{
      p.visible = show
      if(this.isDashboard){
      }
    })
  }

  refreshPickLoc(x , y){
    this.ngZone.run(()=>{
      this.pickLocObj.x = x
      this.pickLocObj.y = y
      this.pickLocObj.rosX = this.calculateRosX(x , this.lastActiveMapId_SA)
      this.pickLocObj.rosY = this.calculateRosY(y,  this.lastActiveMapId_SA)
      this.refreshFlagMarker()
    })
  }

  refreshPickLocByRosValue() {
    let mapContainer = this.mapContainerStore[this.lastActiveMapId_SA];
    this.pickLocObj.x = this.calculateMapX(this.pickLocObj.rosX, mapContainer?.guiOriginX)
    this.pickLocObj.y = this.calculateMapY(this.pickLocObj.rosY, mapContainer?.guiOriginY)
    this.pickLocObj.graphic.position.set(this.pickLocObj.x, this.pickLocObj.y)
    this.pickLocObj.graphic.angle = this.pickLocObj.angle
  }


  resetPickLoc(){
    if(this.pickLocObj.graphic && this.pickLocObj.graphic.parent){
      this.pickLocObj.graphic.parent.removeChild( this.pickLocObj.graphic)
    }
    Object.keys(this.pickLocObj).forEach(k=> this.pickLocObj[k] = null)
    this.pickLocObj.angle = 0
    this.pickLocObj.enable = false
  }

  refreshFlagMarker(){
    // this.toggleRosMap(true)
    if(!this.pickLocObj.graphic){
      let flagMarker = this.getFlagMarker()
      this.mapContainerStore[this.lastActiveMapId_SA].addChild(flagMarker)
      this.pickLocObj.graphic = flagMarker      
    }
    this.pickLocObj.graphic.visible = true
    this.pickLocObj.graphic.position.set(this.pickLocObj.x, this.pickLocObj.y)
  }

  getFlagMarker(){
    let svgUrl = 'assets/icons/arrow-up-circle.svg'
    try {
      let pivot = [15 , 15]
      let ret = new PIXI.Graphics()
      let icon = new PIXI.Sprite(PIXI.Texture.from(svgUrl))      
      icon.filters = [<any>new ColorReplaceFilter(0x000000,  new PixiCommon().highlightColor, 1)]
      icon.pivot.set(pivot[0] , pivot[1])
      ret.addChild(icon)
      ret.pivot.set(pivot[0] , pivot[1])
      icon.scale.set(0.25)
      let resizeGraphic = (gr)=>{   
        let scale = 1 / (this._ngPixi.viewport.scale.x * gr.parent.scale.x)
        gr.scale.set(scale, scale)
      }
      ret.on('added',()=>resizeGraphic(ret))
      this.onViewportZoomed.pipe(filter(v => v != null), takeUntil(this.onDestroy), debounceTime(5)).subscribe(() => {
        resizeGraphic(ret)
      })
      // ret.scale.set( 1 / (this._ngPixi.viewport.scale.x * ret.parent.scale.x) ,  1 / (this._ngPixi.viewport.scale.y * ret.parent.scale.y))
      return ret
    } catch (err) {
      console.log('An Error has occurred when loading ' + svgUrl)
      console.log(err)
      throw err
    }
  }
  //^ 20220504 ^

  public calculateRosPosition(position: { x: number, y: number }, map: PixiMap) {
    let origin = this.getGuiOrigin(map)
    return {
      x: this.util.trimNum((position.x - origin[0]) / this.util.config.METER_TO_PIXEL_RATIO, 5),
      y: this.util.trimNum((origin[1] - position.y) / this.util.config.METER_TO_PIXEL_RATIO, 5)
    }
  }
  
  public calculateRosY(mapY: number , mapCode = this.spawnPointObj.selectedMap) {
    return  this.util.trimNum(( this.mapContainerStore[mapCode]?.guiOriginY - mapY) / this.util.config.METER_TO_PIXEL_RATIO , 5)
  }

  public calculateRosX(mapX : number, mapCode = this.spawnPointObj.selectedMap) {
    return  this.util.trimNum((mapX - this.mapContainerStore[mapCode]?.guiOriginX) / this.util.config.METER_TO_PIXEL_RATIO , 5)
  }

  public calculateMapX(rosX: number , originX) { //TO BE REVISED
    return this.util.trimNum(rosX  * this.util.config.METER_TO_PIXEL_RATIO + originX , 5); //TBR : save METER_TO_PIXEL_RATIO to DB
  }

  public calculateMapY(rosY: number , originY) { //TO BE REVISED
    return this.util.trimNum(originY - (rosY * this.util.config.METER_TO_PIXEL_RATIO) , 5);
  }


  // *** ^ dropdown select location ^ ***
  //===================================================================================================================================================

  //v * * * * * ROBOT RENDERING * * * * * v

  switchingMap

  async changeMap_SA() {
    this.switchingMap = new Subject()
    var fpCode =  (<DropListMap>(await this.dataSrv.getDropList('maps')).data.filter((m:DropListMap) => m.mapCode == this.getFirstRobot().mapCode)[0])?.floorPlanCode
    if(!fpCode){
      var msg = "UNKNOWN MAP CODE OR NO LINKED FLOOR PLAN FROM MQTT POSE : " + this.getFirstRobot().mapCode
      this.uiSrv.showNotificationBar(msg , 'error')
      console.log(msg)
      this.switchingMap.next(false)
      this.switchingMap = null
      return false
    }
    let fpDs : JFloorPlan = await this.dataSrv.getFloorPlanV2(fpCode)  
    if (this.mainContainerId != fpDs.floorPlanCode) {
      await this.loadFloorPlanDatasetV2(fpDs, true, true)
    }
    this.switchingMap.next(false)
    this.switchingMap = null
    this.standaloneRobotChangeMap.emit(this.getFirstRobot().mapCode)
    this.refreshLocationOptions()
    if(this.liveLidarObj.show){
      await this.unsubscribeLiveLidar_SA()
      await this.subscribeLiveLidar_SA()
    }
    return true
    //pending : make lidar request and ask user for localization
  }

  async unsubscribePose_ARCS(){
    this.arcsPoseSubscription?.unsubscribe()
    if(this.signalRSubscribedMapCodes.length > 0){
      this.signalRSubscribedMapCodes.forEach(m => this.dataSrv.unsubscribeSignalR('arcsPoses', false,`${m}`))
      this.signalRSubscribedMapCodes = []
    }
  }

  async subscribeRobotsPose_ARCS(mapCodes) { 
    // TBD : mapContainerStore key change from mapCode to robotBase
    this.unsubscribePose_ARCS()
    this.signalRSubscribedMapCodes = mapCodes
    mapCodes.forEach(m=>{
      this.dataSrv.subscribeSignalR('arcsPoses',`${m}`)
    })
    // this.unsubscribePose_ARCS()
    this.arcsPoseSubscription = this.dataSrv.signalRSubj.arcsPoses.pipe(filter(v => v)).subscribe(async (poseObj) => { //{mapCode : robotId : pose}
      Object.keys(poseObj).forEach(mapCode => {
        let robotsAdded = []
        // console.log('test')
        let getPose = (robotId) => { return poseObj[mapCode][robotId] }
        let refreshPose = (r : Robot) => r.refreshPose(getPose(r.id).x, getPose(r.id).y, getPose(r.id).angle, getPose(r.id).interval, mapCode, r.robotBase)
        //all related map containers MUST be added already before calling this function/all related map containers MUST be added already before calling this function
        //let container = this.mapContainerStore[mapCode] //  + robotBase //
        let robotCodes = Object.keys(poseObj[mapCode])

        let robotCodesToAdd = robotCodes.filter(c => !this.robots.map(r => r.id).includes(c) || (this.robots.filter(r => r.id == c)[0].mapCode != mapCode))
        let robotsToUpdate = this.robots.filter(r => robotCodes.includes(r.id) && r.pixiGraphics.parent == this.getMapContainer(mapCode, r.robotBase))
        let robotsToRemove = this.robots.filter(r => r.mapCode == mapCode && !robotCodes.includes(r.id))

        robotsToRemove.forEach(r => this.removeRobot(r))
        robotCodesToAdd.forEach(code => {
          let robotMaster = (<DropListRobot[]>this.dropdownData.robots).filter(r2 => r2.robotCode == code)[0]
          if (this.arcsRobotType && robotMaster.robotType.toUpperCase() != this.arcsRobotType.toUpperCase()) {
            return
          }
          let r = this.addRobot(code, mapCode, robotMaster?.robotBase)
          r.observed = true
          robotsAdded.push(r)
          setTimeout(() => refreshPose(r))
        })
        robotsToUpdate.forEach(r => refreshPose(r))
        if(robotsAdded.length > 0 || robotsToRemove.length > 0){
          this.refreshRobotColors()
        }
      })

    })
    
  }

  async subscribePose_SA() {
    // let firstPose = await this.dataSrv.httpSrv.getRV() //TBR : call rest API for first pose
    this.dataSrv.signalRSubj.pose.pipe(takeUntil(this.onDestroy)).subscribe(async (pose) => {
      if(this.pickSpawnPoint){
        return
      }
      pose = this.dataSrv.signalRSubj.pose.value
      let robot = this.getFirstRobot()
      if (pose && !this.spawnPointObj.alignLidar && !this.dataSrv.signalRSubj.isFollowMeWithoutMap.value && !['',null, undefined].includes(pose?.mapName)) {
        //--- mapName return mapCode but we need mapId here ---
        this.getFirstRobot().mapCode = pose?.mapName
        //-----------------------------------------------------
        if(robot.mapCode!=null){
          if (!this.mapContainerStore[robot.mapCode]) {
            if (this.switchingMap != null) {
              await this.switchingMap.pipe(filter(v => v == false), take(1)).toPromise()
            } else {
              if(!await this.changeMap_SA()){
                return
              }
            }
          }
          if (robot.pixiGraphics.parent && robot.pixiGraphics.parent != this.mapContainerStore[robot.mapCode]) { //&& this.mapId == pose?.mapName
              robot.pixiGraphics.parent.removeChild(robot.pixiGraphics)
              this.mapContainerStore[robot.mapCode].addChild(robot.pixiGraphics)
              robot.observed = true
          }
        }
       
        // console.log(`x : ${pose.x} | y : ${pose.y} | angle : ${pose.angle}`)
        robot.refreshPose(pose.x, pose.y, pose.angle, pose.interval, robot.mapCode)
      }else if(this._remoteControl && pose){
        robot.observed = true
        robot.refreshPose(pose.x, pose.y, pose.angle, pose.interval, robot.mapCode)
      }
    })
  }


  async subscribeLiveLidar_SA(){
    let ticket = this.uiSrv.loadAsyncBegin()
    await this.httpSrv.rvRequest("POST","lidar/v1/laserScanToPointCloud/start")
    await this.dataSrv.subscribeSignalRs(['lidar','lidarStatus']);
    if(this.liveLidarObj.statusSubscription){
      this.liveLidarObj.statusSubscription.unsubscribe()
    }
    this.liveLidarObj.statusSubscription = this.dataSrv.signalRSubj.lidarSwitchedOn.pipe(skip(1), filter(on => !on)).subscribe(() => {
      if (this.liveLidarObj.show) {
        console.log('lidar turned off . restarting ...')
        this.httpSrv.rvRequest("POST", "lidar/v1/laserScanToPointCloud/start")
      }
    })    
    this.liveLidarObj.show = true
    this.toggleRosMap(true)
    this.uiSrv.loadAsyncDone(ticket)
    this.dataSrv.signalRSubj.lidar.pipe(skip(1)).subscribe(l=>{
      this.refreshLiveLidarGraphics()
    })
  }

  async unsubscribeLiveLidar_SA(){
    let ticket = this.uiSrv.loadAsyncBegin()
    await this.httpSrv.rvRequest("POST","lidar/v1/laserScanToPointCloud/stop")
    await this.dataSrv.unsubscribeSignalRs(['lidar' , 'lidarStatus']);
    this.liveLidarObj.show = false
    this.toggleRosMap(false)
    this.refreshLiveLidarGraphics()    
    if(this.liveLidarObj.statusSubscription){
      this.liveLidarObj.statusSubscription.unsubscribe()
    }
    this.uiSrv.loadAsyncDone(ticket)
  }


  refreshLiveLidarGraphics() {
    let lidarData = this.dataSrv.signalRSubj.lidar.value
    if (lidarData && this.liveLidarObj.graphic && lidarData.mapName != this.liveLidarObj.mapCode) {
      this.toggleRosMap(false)
      this.removeGraphics(this.liveLidarObj.graphic)
      this.liveLidarObj.graphic = null
    }
    if( this.liveLidarObj.graphic){
      this.liveLidarObj.graphic.visible =  this.liveLidarObj.show
    }
    
    if (this.liveLidarObj.show && lidarData) {
      // let mapContainer: PIXI.Container = <any>(Object.values(this.mapContainerStore).filter(m => m['mapCode'] == lidarData.mapName)[0])
      let mapContainer: PixiMapContainer = this.mapContainerStore[lidarData.mapName]
      if((!mapContainer && !this._remoteControl) || ( !mapContainer && lidarData.mapName)){
        return
      }
      if (!this.liveLidarObj.graphic) {
        this.toggleRosMap(true)
        this.liveLidarObj.mapCode = lidarData.mapName
        this.liveLidarObj.graphic = new PIXI.Graphics();
        if(this.liveLidarObj.mapCode ){
          mapContainer.addChild(this.liveLidarObj.graphic)
        }else{ //without map
          this.mainContainer.addChild(this.liveLidarObj.graphic)
        }
      }
      this.liveLidarObj.graphic.clear()
      lidarData.pointList.forEach((p) => {
        if(this.liveLidarObj.mapCode){
          this.liveLidarObj.graphic .beginFill(0xFF0000).drawCircle(this.calculateMapX(p['x'], mapContainer.guiOriginX), this.calculateMapY(p['y'], mapContainer.guiOriginY), 1.5).endFill()
        }else{
          let guiOrigin = this.calculateMapOrigin(0 , 0 , VIRTUAL_MAP_ROS_HEIGHT , this.util.config.METER_TO_PIXEL_RATIO)
          this.liveLidarObj.graphic .beginFill(0xFF0000).drawCircle(this.calculateMapX(p['x'], guiOrigin[0]), this.calculateMapY(p['y'], guiOrigin[1]), 1.5).endFill()
        }
      });
    }
  }

  //^ * * * * * ROBOT RENDERING * * * * * ^
  
  //v * * * * * TASK WAYPOINT RENDERING * * * * * v


  pathReachableV2(toCode, fromCode) {
    if (fromCode == null || fromCode == undefined) {
      return true
    }
    let hasPath = false
    try { // may be other better way to handle points not in graph?
      hasPath = this.dijkstra.graph.shortest(fromCode, toCode).path().length > 1
    } catch { }
    return hasPath
  }
  
  drawTaskPathsV2(paths : { floorPlanCode ? : string , pointCode: string , navigationMode : string}[] , floorPlanCode = null){
    let tmpPIXI = new PixiCommon()
    let pointCodes = paths.map(path => path.pointCode)
    this.allPixiPoints.forEach((p:PixiLocPoint) => p.setTaskItemSeq(''))

    this.allPixiTaskPaths.forEach(p => {
      delete p.taskItemIndex
      this.mainContainer.removeChild(p)
    })

    for (let i = 0; i < Math.max(1, paths.length - 1); i++) {
      let line = new PixiTaskPath()
      let pathFollowing = paths[i + 1] && paths[i + 1].navigationMode == 'PATH_FOLLOWING'
      //use call back function to get option to make sure that 2 graphics object wont sharing/pointing to the same option
      // let getLineThickness = (bold = false) => this.pixiElRef.lineWidth * (bold ? 2 : 1) / (this.pixiObjs.arrowContainer.scale.x * this.pixiElRef._ngPixi.viewport.scale.x)
      let lineOpt = (l) => new GraphicOptions(l, undefined, tmpPIXI.secondaryHighlightColor, -1, pathFollowing ? 0.8 : 0.5, tmpPIXI.secondaryHighlightColor, 2)
      let pointCode = pointCodes[i]
      let frPt: PixiLocPoint = this.allPixiPoints.filter(s => (floorPlanCode == null || floorPlanCode == paths[i].floorPlanCode) && s.code == pointCode)[0]
      let toPt: PixiLocPoint = this.allPixiPoints.filter(s => (floorPlanCode == null || floorPlanCode == paths[i].floorPlanCode) &&  s.code == pointCodes[i + 1] && pointCodes[i + 1] != undefined)[0]
      if (frPt) {
        frPt.taskItemIndex = frPt.taskItemIndex || frPt.taskItemIndex  == 0 ? frPt.taskItemIndex : i
        if (!frPt.taskSeq?.endsWith('...')) {
          frPt.setTaskItemSeq((frPt.taskSeq.length > 0 ? (frPt.taskSeq + ' , ') : '') + (frPt.taskSeq?.length > 5 ? ' ...' : (i + 1).toString()))
        }
      }
      if (toPt && i == pointCodes.length - 2) {
        toPt.taskItemIndex = toPt.taskItemIndex || toPt.taskItemIndex == 0 ? toPt.taskItemIndex : i + 1
        if(!toPt.taskSeq?.endsWith('...')){
          toPt.setTaskItemSeq((toPt.taskSeq.length > 0 ? (toPt.taskSeq + ' , ') : '') + ( (toPt.taskSeq?.length > 5 ? ' ...' : (i + 2).toString())))
        }
      }
      if (frPt && toPt) {
        let getGlobalPosition = (s) => this.mainContainer.toLocal(s.parent.toGlobal(s.position))    
        if (pathFollowing && this.pathReachableV2(pointCodes[i + 1] , pointCode)) {
          let paths = this.dijkstra.graph.shortest(frPt.code, toPt.code).path()
          for (let j = 0; j < paths.length - 1; j++) {
            line = new PixiTaskPath()
            let frCodej = paths[j]
            let toCodej = paths[j + 1]
            let p1j = this.allPixiPoints.filter(s => s.code == frCodej)[0]
            let p2j = this.allPixiPoints.filter(s => s.code == toCodej)[0]
            let pathData = this.dijkstra.paths.filter(p=>p.sourcePointCode == p1j.code && p.destinationPointCode == p2j.code )[0]
            let isCurved = pathData.controlPointList.length > 0
            if (isCurved) {
              let getLine = (opt) => tmpPIXI.getCurve(getGlobalPosition(p1j), getGlobalPosition(p2j), pathData.controlPointList[0], pathData.controlPointList[1], opt, this , true);
              (<PixiTaskPath> getLine(lineOpt(line)))
            } else {
              (<PixiTaskPath> tmpPIXI.getLine(getGlobalPosition(p1j), getGlobalPosition(p2j), lineOpt(line), this, true))     
            }
            line.targetCodes = line.targetCodes ? line.targetCodes.concat([toPt.code]) : [toPt.code]
            this.mainContainer.addChild(line)
            line.taskItemIndex = i
          }
        } else {
          let tmpOpt = lineOpt(line)
          tmpOpt.opacity = 0.5
          tmpOpt.lineThickness = 4;
          (<PixiTaskPath> tmpPIXI.getDashedLine(getGlobalPosition(frPt), getGlobalPosition(toPt), lineOpt(line),undefined,undefined,this))
           Object.assign(new PixiTaskPath() , line)
          this.mainContainer.addChild(line)
          line.taskItemIndex = i
        }

        toPt.on('mouseover', ()=>{ //recolor lines to highlight the path
          this.allPixiTaskPaths.filter(p=>p.taskItemIndex == toPt.taskItemIndex- 1).forEach(p=>{
            p.tint = new PixiCommon().mouseOverColor
            p.zIndex = 10
          })
        })
        toPt.on('mouseout', ()=>{
          this.allPixiTaskPaths.filter(p=>p.taskItemIndex == toPt.taskItemIndex - 1).forEach(p=>{
            p.tint = new PixiCommon().secondaryHighlightColor
            p.zIndex = 0
          })
        })
      }
    }
  }

  
  taskSubscribed = false
  async subscribeTaskStatus_SA(){
    if(this.taskSubscribed){
      return 
    }
    let itemList = []
    if(!this.dataSrv.dataStore.action){
      this.dataSrv.dataStore.action = {}
      let tmp = await this.dataSrv.getDropList('actions')
      tmp.data.forEach((a: DropListAction) => this.dataSrv.dataStore.action[a.alias] = a.name)
    }
    await this.dataSrv.subscribeSignalRs(['taskArrive', 'taskProgress','taskDepart'])
    await this.dataSrv.refreshTaskStatus()
    this.dataSrv.signalRSubj.taskActive.pipe(filter(v=>!v)).subscribe(async() => {
      this.taskShowing = null
      this.allPixiPoints.forEach((p: PixiLocPoint) =>{
        p.setTaskItemSeq('')
        delete p['taskItemIndex']
      })
      itemList = []
    })

    this.dataSrv.signalRSubj.taskActive.pipe(filter(v=>v)).subscribe(async(task) => {
      if(!this.taskShowing){
        task.taskItemList.forEach(move => {
          let pointCode = move['movement']['waypointName']
          if (itemList.length == 0 || (itemList[itemList.length - 1]['pointCode'] != pointCode)) {
            itemList.push({
              floorPlanCode: this.mainContainerId,
              pointCode: pointCode,
              navigationMode: move['movement']['navigationMode']
            })
          }
        })
        this.taskShowing = task.taskId
        this.drawTaskPathsV2(itemList , this.mainContainerId)
        // if(!this.taskActionDropdownData){
        //   sessionStorage.setItem((await this.dataSrv.getDropList('actions')).data)
        // }
      }
    })
    
    this.dataSrv.signalRSubj.taskItemIndex.subscribe(i => {
      this.allPixiPoints.filter(p => p.taskItemIndex == this.dataSrv.signalRSubj.taskItemIndex.value).forEach((p: PixiLocPoint) => {
        let actionName = this.dataSrv.dataStore.action?.[this.dataSrv.signalRSubj.taskActive.value['taskItemList'][this.dataSrv.signalRSubj.taskItemIndex.value]['actionList']?.[i]?.['alias']]
        if (actionName) {
          p.toolTipContent = `${p.text} ${actionName ? ':' : ''} ${actionName}`
        }
      })
      
      this.allPixiPoints.filter(p => p.taskItemIndex <= i).forEach((p: PixiLocPoint) => {
        let idxs = itemList.filter(taskItm => taskItm.pointCode == p.code).map(taskItm => itemList.indexOf(taskItm))
        let idxsNotExecuted = idxs.filter(idx => idx > i)
        let currIdxs = idxs.filter(idx => idx == i || (this.dataSrv.signalRSubj.isMovingInTask.value && (idx == i - 1)))
        p.taskItemIndex = currIdxs.length > 0 ? currIdxs[0] : (idxsNotExecuted.length > 0 ? Math.min.apply(null, idxsNotExecuted) : Math.max.apply(null, idxs))
        let dispVal = currIdxs.length > 0 ? (currIdxs[0] + 1).toString() : ((idxs.filter(idx => idx <= i).map(idx => (idx + 1).toString()).slice(0,3)).join(' , ') + (idxs.length > 3 ?  ' ...' : '' ))
        p.setTaskItemSeq(dispVal, undefined, true)
      })
      
      // !!! IMPORTANT !!! //
       // TBR : this.mainContainer.children.filter(c => c instanceof PixiTaskPath).forEach
      this.allPixiTaskPaths.forEach((p: PixiTaskPath) => {
        p.visible = this.dataSrv.signalRSubj.isMovingInTask.value && p.taskItemIndex == i - 1
        p.alpha = 0.7
      })
      this.allPixiPoints.filter(p => p.taskItemIndex == i).forEach((p: PixiLocPoint) => {
        p.setTaskItemSeq((p.taskItemIndex + 1).toString(), undefined, !this.dataSrv.signalRSubj.isMovingInTask.value, this.dataSrv.signalRSubj.isMovingInTask.value)
      })
      this.allPixiPoints.filter(p => p.taskItemIndex > i).forEach((p: PixiLocPoint) => {
        p.setTaskItemSeq((p.taskItemIndex + 1).toString())
      })
    })
    this.taskSubscribed = true
  }

  getViewportPosition(){
    return{
      defaultZoom: this.util.trimNum(this._ngPixi.viewport.scale.x)!= 0 ?  this.util.trimNum(this._ngPixi.viewport.scale.x) : 1 ,
      defaultX: this.util.trimNum(this._ngPixi.viewport.center.x),
      defaultY: this.util.trimNum(this._ngPixi.viewport.center.y)
    }
  }

  convertToMainContainerPosition(gr : PIXI.Graphics){
    return this.mainContainer.toLocal(gr.parent.toGlobal(gr.position))
  }

  addPixiRobotCountTagToPolygon(polygon : PixiPolygon , position : {x : number , y : number} , robotCount = 0 ,  readonly = false){
    let option = new GraphicOptions()
    option.fillColor = new PixiCommon().mouseOverColor
    return new PixiRobotCountTag(polygon , position , this , option , readonly)
  }

  setBuildingRobotCount(buildingCode : string , robotCount : number){
    let polygon = this.allPixiPolygon.filter((p : PixiPolygon)=> p.arcsBuildingCode == buildingCode)[0]
    polygon.pixiRobotCountTag.robotCount = robotCount
  }

  //^ * * * * * TASK WAYPOINT RENDERING * * * * * ^
}


//#######################################################################################################################################################


export class GraphicOptions{
  public baseGraphics : PIXI.Graphics
  public opacity : number;
  public fillColor: number;
  public position : PIXI.Point;
  public zIndex : number;
  public lineThickness : number;
  public lineColor : number;
  constructor( parentGraphics = new PIXI.Graphics(), pos = new PIXI.Point(0,0), fillColor = 0x0000000, zIndex = 1,alpha = 1 , lineColor = 0x0000000 , lineThickness = 2 , clone = false ){
    this.baseGraphics = parentGraphics
    this.opacity = alpha
    this.fillColor = fillColor
    this.position = pos
    this.zIndex = zIndex
    this.lineColor = lineColor
    this.lineThickness = lineThickness
    if(!clone){
      this.baseGraphics['graphicOptions'] = this
    }
  }

  clone(){
    return new GraphicOptions(this.baseGraphics , new PIXI.Point(this.position.x, this.position.y) , this.fillColor , this.zIndex , this.opacity , this.lineColor , this.lineThickness , true)
  }
}


//#######################################################################################################################################################


export class Robot {
  private parent : DrawingBoardComponent
  public set alert(v){
    this._alert = v
    this.pixiGraphics.pixiAlertBadge.visible = v
  }
  public get alert(){
    return this._alert
  }
  private _alert = false
  public mapCode
  public robotBase
  public id: string;
  public rosPose  = { position: { x: null, y: null }, angleRad: 0, frame_id: '' };
  public pose = { position: { x: null, y: null }, angle: 0, frame_id: '' };
  public pixiGraphics = new PixiCommon()
  public clicked = new EventEmitter();
  public tapped = new EventEmitter();
  private _enabled = true
  util: GeneralUtil
  private robotCfg
  type = "DEFAULT"
  private movingRef
  pose$ : Observable<any>
  private _observed = false
  public get observed(){
    return this._observed
  }
  public set observed(v){
    this._observed = v  
    if (v) {  
      this.pixiGraphics.visible = true
      this.parent.refreshRobotScale()  
      this.parent.ngZone.run(() => {
        if (this.parent.loadingTicket) {
          this.parent.uiSrv.loadAsyncDone(this.parent.loadingTicket)
          this.parent.loadingTicket = null
        }
        this.parent.overlayMsg = null
        if(this.parent._fullScreen && !this.parent._remoteControl){
          this.parent.removeSpawnMarker()                  
          this.parent.pickSpawnPoint = false
          this.parent.fullScreen = false
          this.parent.changeMode(null)
          this.parent.toggleRosMap(false)
        }
        // Object.values(this.mapContainerStore).forEach(c => {
        //   if (c['backgroundSprite']) {
        //     c['backgroundSprite'].visible = false
        //   }
        // })
      })  
    }
  }

  public get offline() {
    return this._offline
  }
  public set offline(v) {
    this._offline = v
    if(this._offline && this.pixiGraphics){
      this.pixiGraphics.alpha = 0.4
    }else if(this.pixiGraphics){
      this.pixiGraphics.alpha = 1
    }
  }
  _offline = false

  set enabled(b) {
    this._enabled = b
    this.refreshStatus();
  }

  get enabled() {
    return this._enabled;
  }

  get visualCfg() {
    let type = Object.keys(this.robotCfg).includes(this.type.toUpperCase()) ? this.type : "DEFAULT"
    return this.robotCfg[type]
  }

  get viewPortPosition(){
    return this.parent.mainContainer.toLocal(this.pixiGraphics.parent.toGlobal(new PIXI.Point(this.pixiGraphics.position.x ,this.pixiGraphics.position.y)))
  }

  constructor(id, mapCode, robotBase , generalUtils : GeneralUtil, viewport : DrawingBoardComponent) {
    this.id = id
    this.robotBase = robotBase
    this.util = generalUtils;
    this.parent = viewport;
    this.mapCode = mapCode
    this.robotCfg = this.util.config.robot;
    this.refreshStatus();
    this.pixiGraphics = this.getPIXIGrahics()
    this.pixiGraphics.on("mouseover", (evt: PIXI.interaction.InteractionEvent) => this.pixiGraphics.showToolTip(this.id ,evt))
    this.pixiGraphics.on("mouseout", () => this.pixiGraphics.hideToolTip())

    this.pixiGraphics.on('added',()=>{
      this.pixiGraphics.parent.sortableChildren = true
      this.pixiGraphics.parent.zIndex = 1000
      this.pixiGraphics.zIndex = 1000
    })
    this.pixiGraphics.interactive = this.util.arcsApp;
    ["click" , "tap"].forEach(trigger=>{
      this.pixiGraphics.on(trigger, (evt) => {
        this.clicked.emit(evt)
      });
    })
    // this.pixiGraphics.visible = true;
    // this.pixiGraphics.x = this.pose.position.x
    // this.pixiGraphics.y = this.pose.position.y
    this.pixiGraphics.visible = false
    // if(this.util.standaloneApp && dataSrv && viewport && dataSrv.signalRSrv.enabled){// auto change map/floorplan & refresh robot pose if connected to signalR 
    //   // dataSrv.subscribeSignalR('pose')
    //   this.initPoseSync(dataSrv , viewport)
    // }
  }

  public setIconScale(scale = new PixiCommon().robotIconScale){
    (<PIXI.Graphics>this.pixiGraphics.icon).scale.set(scale);
    (<PixiCommon>this.pixiGraphics.pixiAlertBadge.icon).scale.set(scale * 1.2)
  }

  public getPIXIGrahics(fillColor = this.visualCfg.fillColor , x = 0 , y = 0 , angle = 0){
    return new PixiCommon().getRobotMarker(new PixiCommon().hexToNumColor(fillColor) , x , y , angle)
  }

  public hideFromMap() {
    this.pixiGraphics.visible = false;
  }

  public showOnMap() {
    this.pixiGraphics.visible = true;
  }

  private refreshStatus() {
    this.pixiGraphics.interactive = this._enabled;
    this.pixiGraphics.buttonMode = this._enabled;
  }

  private getMapOrigin() {
    if (this.mapCode) {
      return [this.parent?.getMapContainer(this.mapCode , this.robotBase)?.guiOriginX, this.parent?.getMapContainer(this.mapCode , this.robotBase)?.guiOriginY]
    }
    else if(this.parent._remoteControl){
      return [0 , 0]
    } else {
      return [this.parent?.getMapOriginMarker().position.x, this.parent?.getMapOriginMarker().position.y]
    }
  }

  
  public calculateMapX(rosX: number , originX = this.getMapOrigin()[0]) { //TO BE REVISED
    // return (rosX + this.util.config.map.origin_x * -1) / this.util.config.map.resolution
    //   * this.util.config.MAP_RESOLUTION;
    return rosX  * this.util.config.METER_TO_PIXEL_RATIO + originX; //TBR : save METER_TO_PIXEL_RATIO to DB
  }

  public calculateMapY(rosY: number, originY = this.getMapOrigin()[1]) { //TO BE REVISED
    // return (yHeight ? yHeight : this.drawingBoard.backgroundSprite.height) -
    //   ((rosY + this.util.config.map.origin_y * -1) / this.util.config.map.resolution)
    //   * this.util.config.MAP_RESOLUTION;
    return originY - (rosY * this.util.config.METER_TO_PIXEL_RATIO);
  }

  // public async startPosePolling(pollingRefreshIntervalMs = this.util.config.DASHBOARD_MAP_REFRESH_INTERVAL) : Promise<Observable<any>>{
  //   //pending : SEPARATE APPLICATION CONFIG? use config url : need to decide whether the standalone api would include robot latest pose & robot status
  //   this.pose$ = await this.parent.httpSrv.polling("Robot/latestPose?",{},{robotId:this.id},undefined, this.util.getRvApiUrl() ,pollingRefreshIntervalMs,this.parent.onDestroy)
  //   this.pose$.subscribe((pose) => {
  //     //emit change Map if pose.mapId != this.standaloneLatestActiveMapId
  //     this.refreshPose(pose.x, pose.y, undefined , pollingRefreshIntervalMs)
  //   })
  //   return this.pose$
  // }

  enforcePose(){
    this.pixiGraphics.x =  this.pose.position.x;
    this.pixiGraphics.y = this.pose.position.y;
    this.pixiGraphics.icon.angle =  this.pose.angle;
    this.pixiGraphics.visible = true
  }

  public refreshPose(rosX, rosY, angle =  this.pose.angle, endInMs = null, mapCode = null , robotBase = null, noTransition = false , hasOriginMarker = false) {
    if (this.movingRef) {
      clearInterval(this.movingRef);
      this.movingRef = null;
    }
    this.enforcePose()
    angle = 90 -  angle * radRatio//To BE Confirmed
    const orgX = this.pose.position.x
    const orgY = this.pose.position.y
    const orgAngle = this.pose.angle
    this.rosPose.position.x = rosX
    this.rosPose.position.y = rosY
    var origins = [undefined , undefined]
    if(hasOriginMarker){
      origins = [this.parent.getMapOriginMarker().position.x , this.parent.getMapOriginMarker().position.y ] 
    }else if(mapCode){
      let container : PixiMapContainer =  this.parent.getMapContainer(mapCode , robotBase)
      if(!container){
        console.log(`ERROR : Map not found : [${mapCode}] (ROBOT BASE [${robotBase}])`)
        return 
      }
      origins = this.parent.getGuiOrigin(container)
    }else{
      origins = this.parent.calculateMapOrigin(0,0, VIRTUAL_MAP_ROS_HEIGHT , this.parent.util.config.METER_TO_PIXEL_RATIO)
    }
    this.pose.position.x = this.calculateMapX(rosX , origins[0])
    this.pose.position.y = this.calculateMapY(rosY , origins[1])
    this.pose.angle = angle
    // this.pixiGraphics.angle = angle
    if( noTransition || !this.util.config.MOVE_USING_TRANSITION || orgX == null || orgY == null ||  this.parent.lastActiveMapId_SA != mapCode){
      this.parent.lastActiveMapId_SA = mapCode ? mapCode : this.parent.lastActiveMapId_SA
      this.enforcePose()
      if(this.parent.cameraTraceEnabled){
        this.parent.relocateCamera()
      }
      if(orgX == null || orgY == null){
        this.parent.refreshRobotScale()
      }
      return
    }
    this.parent.lastActiveMapId_SA = mapCode ? mapCode : this.parent.lastActiveMapId_SA

    let diff_x = this.pose.position.x - orgX ;
    let diff_y = this.pose.position.y - orgY ;
    let diff_angle = this.pose.angle - orgAngle
    
    diff_angle = diff_angle > 180 ? (diff_angle - 360) : diff_angle < -180 ? (360 + diff_angle) : diff_angle
    if (diff_x !== 0 || diff_y !== 0) {
      this.pixiGraphics.visible = true  
      const frameIntervalMs = 50
      let move = endInMs != null ? Math.min(5000 / frameIntervalMs, Math.floor(endInMs / frameIntervalMs)) : 15; //Max 5 second Delay
      if (orgX != null && orgY != null) {
        let step_x = diff_x / move ;
        let step_y = diff_y / move ;
        let step_angle = diff_angle / move;
        // kill the previous
      
        this.movingRef = setInterval(() => {
          if (move > 1) {
            this.pixiGraphics.x = this.pixiGraphics.x + step_x;
            this.pixiGraphics.y = this.pixiGraphics.y + step_y;
            this.pixiGraphics.icon.angle = this.pixiGraphics.icon.angle + step_angle;
            if(this.parent.cameraTraceEnabled){
              this.parent.relocateCamera()
            }
            move--;
          } else {
            // this.pixiGraphics.x = this.pose.position.x;
            // this.pixiGraphics.y = this.pose.position.y;
            // this.pixiGraphics.angle =  this.pose.angle;
            clearInterval(this.movingRef);
            this.movingRef = null;
          }
        }, frameIntervalMs );
      }
    }
  }
}

//#######################################################################################################################################################


export class PixiLine extends PIXI.Graphics{
  public vertices
  public type 
}

export class PixiCircle extends PIXI.Graphics{
  public vertices
  public type 
  public radius
}

export class PixiTaskPath extends PixiLine{
  targetCodes ? 
  taskItemIndex ?
}

//#######################################################################################################################################################


export class PixiCommon extends PIXI.Graphics{
  dataObj
  pixiAlertBadge : PixiCommon
  imgEditHandleSize = 5
  floorplanShapeTypePrefix = 'fp_'
  autoScaleOnZoomed = true  //* * * TO BE CONFIGURED * * */
  locationPrefixDelimiter = '%'
  toolTip? : PixiToolTip
  highlightColor? = 0xFE9802// 0xFF6358//0x30C5FF  // 0xff9800// 0xFC33FF
  secondaryHighlightColor? = 0xFF6358
  mouseOverColor? = 0x00CED1
  arrowTypes? = ['arrow','arrow_bi','arrow_bi_curved','arrow_curved']
  pointTypes? = ['location','waypoint']
  curveTypes? = ['arrow_bi_curved' , 'arrow_curved']
  markerScale? = 0.45 //* * * TO BE CONFIGURED * * */
  arrowHeadScale? = 0.45 //* * * TO BE CONFIGURED * * */
  arrowThicknessScale? = 0.8 //* * * TO BE CONFIGURED * * */
  arrowHeadLength? = 17.5 * this.arrowHeadScale//* * * TO BE CONFIGURED * * */;
  type? 
  toolTipDelay = null
  robotIconScale = 0.1
  border : PixiBorder
  icon

  constructor(){
    super()
    this.toolTip = new PixiToolTip(this)
  }

  public async getImageDimensionFromUrl(src) {
    return new Promise((resolve, reject) => {
      let img = new Image()
      img.onload = () => resolve([img.width, img.height])
      img.onerror = (e) => {
        console.log("Fail to load Image : " + src)
        console.log(e)
      }
      img.src = src
    })
  }

  public drawBorder(points, lineColor = this.highlightColor) {
    let border = new PixiBorder(this , points , lineColor)
    this.addChild(border)
    this.border = border
    border.draw()
  }  

  public getRobotMarker(fillColor , x = 0 , y = 0 , angle = 0){
    let pivot  = [150, 200]// TO BE RETRIEVED FROM config
    let robot = this
    // let svgUrl = 'assets/icons/robot.svg'

    robot.position.set(x,y)
    robot.icon = this.getRobotIcon(fillColor)
    robot.icon.angle = angle
    robot.addChild(robot.icon)
    robot.pivot.set(pivot[0] , pivot[1])
    this.pixiAlertBadge = new PixiCommon()
    this.pixiAlertBadge.icon = new PixiCommon()
    this.pixiAlertBadge.addChild(this.pixiAlertBadge.icon)
    let badgeOffset = {x : 0 , y : -200}
    this.pixiAlertBadge.icon.beginFill(0xFF0000).drawCircle(0 + badgeOffset.x , 0 + badgeOffset.y , 75).endFill()
    this.pixiAlertBadge.icon.beginFill(0xFFFFFF).drawRect(-10 + badgeOffset.x , -50 + badgeOffset.y , 20 , 60).endFill()
    this.pixiAlertBadge.icon.beginFill(0xFFFFFF).drawRect(-10 + badgeOffset.x , 30 + badgeOffset.y , 20 , 20).endFill()
    this.pixiAlertBadge.icon.angle = -90
    //this.pixiAlertBadge.addChild(new PIXI.Sprite(PIXI.Texture.from('assets/icons/alert.svg')))
    this.pixiAlertBadge.visible = false
    robot.addChild(this.pixiAlertBadge)
    this.pixiAlertBadge.position.set(robot.pivot.x, robot.pivot.y)
    this.pixiAlertBadge.zIndex = 2
    robot.sortableChildren = true
    // robot.icon = icon
    robot.zIndex = 100//20220611
    return robot
  }

  public getRobotIcon(fillColor){
    let filters = this.getRobotColorFilters(fillColor)
    let svgUrl = 'assets/icons/robot.svg'
    let pivot  = [150, 200]// TO BE RETRIEVED FROM config
    let icon
    try {
      icon = new PIXI.Sprite(PIXI.Texture.from(svgUrl))
    } catch (err) {
      console.log('An Error has occurred when loading ' + svgUrl)
      console.log(err)
      throw err
    }
    icon.filters = filters.defaultFilters
    icon.pivot.set(pivot[0] , pivot[1])
    icon.position.set(pivot[0] , pivot[1])
    icon.scale.set(new PixiCommon().robotIconScale)
    icon.interactive = true
    icon.cursor = 'pointer'
    icon.on("mouseover" , ()=> icon.filters = filters.mouseOverFilters)
    icon.on("mouseout" , ()=> icon.filters = filters.defaultFilters)
    return icon
  }


  public getRobotColorFilters(fillColor){
    return {
      defaultFilters : [
        <any>new ColorReplaceFilter(0x000000, 0xEEEEEE, 0.8),
        <any>new ColorOverlayFilter(fillColor, 0.4) , 
        new OutlineFilter(2.5 , fillColor , 0.5),
        new GlowFilter({color: fillColor , distance: 50, outerStrength: 0 })
      ],
      mouseOverFilters : [
        <any>new ColorReplaceFilter(0x000000, 0xEEEEEE, 0.8),
        <any>new ColorOverlayFilter(fillColor, 0.6) , 
        new OutlineFilter(3.5 , fillColor , 0.5),
        new GlowFilter({color: fillColor , distance: 50, outerStrength: 1 })
      ]
    }
  }

  public getWayPointDispName(name){
    return name.split(this.locationPrefixDelimiter)[name.split(this.locationPrefixDelimiter).length -1]
  }

  public getOriginMarker(p: PIXI.Point, option : GraphicOptions = new GraphicOptions()){
    let ret = option.baseGraphics;
    ret.lineStyle(3 , 0xFF0000 ).moveTo(p.x - 15, p.y).lineTo(p.x + 15 , p.y);
    ret.lineStyle(3 , 0xFF0000 ).moveTo(p.x , p.y - 15 ).lineTo(p.x , p.y + 15);
    ret['type'] = 'origin'
    return ret
  }

  public getLine(p1: PIXI.Point, p2: PIXI.Point, option : GraphicOptions = new GraphicOptions() , masterComponent : null | DrawingBoardComponent = null , tint = false) : PixiLine{
    let ret : PixiLine = <PixiLine> option.baseGraphics;
    let draw = (clear = false)=>{
      if(clear){
        ret.clear() //becareful if option argument != null 
      }
      let lineColor = tint ? 0xFFFFFF : option.lineColor
      let lineThickness = option.lineThickness / ((ret.parent? ret.parent.scale.x : 1) * (masterComponent ? masterComponent._ngPixi.viewport.scale.x : 1))
      ret.lineStyle(lineThickness, lineColor, option.opacity).
          moveTo(p1.x, p1.y).lineTo(p2.x, p2.y);
      ret.zIndex = option.zIndex
      ret.tint = tint ? option.lineColor : ret.tint
      ret.vertices = ret.vertices ?  ret.vertices : [p1, p2];
      ret.type = ret.type ? ret.type : 'line'
    }
    draw()
    if(masterComponent && new PixiCommon().autoScaleOnZoomed){
      masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
      ret.on('added', ()=>draw(true))
    }
    return ret
  }

  public getLines(points : PIXI.Point[], option : GraphicOptions = new GraphicOptions() , closeLoop = true , masterComponent : null | DrawingBoardComponent = null , scaleGraphic = null){
    let ret : PixiLine = <PixiLine> option.baseGraphics;
    let draw = (clear = false)=>{
      if(clear){
        ret.clear() //becareful if option argument != null 
      }
      for(let i = 0 ; i < ( closeLoop? points.length : points.length - 1 ) ; i ++){
        let fr = points[i]
        let to = (i == points.length - 1 ? points[0] : points[i+1] )
        let lineThickness = option.lineThickness / ((scaleGraphic ? scaleGraphic.scale.x : (ret.parent? ret.parent.scale.x : 1)) * (masterComponent ? masterComponent._ngPixi.viewport.scale.x : 1))
        ret.lineStyle(lineThickness, option.lineColor, option.opacity).moveTo(fr.x, fr.y).lineTo(to.x, to.y);
        ret.zIndex = option.zIndex
        ret.vertices = ret.vertices ?  ret.vertices : points;
        ret.type = ret.type ? ret.type : 'lines'
      }
    }
    draw()
    if(masterComponent && new PixiCommon().autoScaleOnZoomed){
      masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
      ret.on('added', ()=>draw(true))
    }
    return ret
  }

  public getCurve(p1, p2, cp1, cp2 , opt : GraphicOptions = new GraphicOptions(), masterComponent : null | DrawingBoardComponent = null , tint = false){
    let ret : PixiLine = <PixiLine> opt.baseGraphics;
    let draw = (clear = false)=>{
      if(clear){
        ret.clear() //becareful if option argument != null 
      }
      let lineColor = tint ? 0xFFFFFF : opt.lineColor
      ret.lineStyle(opt.lineThickness / ((ret.parent? ret.parent.scale.x : 1) * (masterComponent ? masterComponent._ngPixi.viewport.scale.x : 1)), lineColor , opt.opacity).moveTo(p1.x,p1.y).bezierCurveTo(cp1.x, cp1.y , cp2.x , cp2.y , p2.x , p2.y)
      ret.zIndex = opt.zIndex
      ret.tint = tint ? opt.lineColor :  ret.tint 
      ret.vertices = ret.vertices ?  ret.vertices : [p1, p2 ,cp1, cp2];
      ret.type = ret.type ? ret.type : 'line'
    }
    if(masterComponent && new PixiCommon().autoScaleOnZoomed){
      masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
      ret.on('added', ()=>draw(true))
    }
    return ret
  }

  public getDashedLine( p1 : PIXI.Point, p2 : PIXI.Point, option = new GraphicOptions() , dashlen = 3, spacelen = 2 , masterComponent : null | DrawingBoardComponent = null  ) : PixiLine { // from https://blog.csdn.net/weixin_26750481/article/details/108131397
    let gr: PixiLine = <PixiLine> option.baseGraphics
    let orgDashLen = dashlen
    let orgSpaceLen = spacelen
    let draw = (clear = false)=>{
      if(clear){
        gr.clear() //becareful if option argument != null 
      }
      let lineThickness = option.lineThickness / (masterComponent ?  masterComponent._ngPixi.viewport.scale.x  : 1)
      dashlen = orgDashLen * lineThickness
      spacelen = orgSpaceLen * lineThickness
      let x = p2.x - p1.x
      let y = p2.y - p1.y
      let hyp = Math.sqrt((x) * (x) + (y) * (y))
      let units = hyp / (dashlen + spacelen)
      let dashSpaceRatio = dashlen / (dashlen + spacelen)
      let dashX = (x/units) * dashSpaceRatio
      let dashY = (y/units) * dashSpaceRatio
      let spaceX = (x/units ) - dashX;
      let spaceY = (y/ units) - dashY;
      let x1= p1.x
      let y1 =p1.y
      gr.lineStyle(lineThickness, option.lineColor,option.opacity)
      gr.moveTo(x1 , y1) 
      while(hyp > 0){
        x1 += dashX;
        y1 += dashY;
        hyp -=dashlen;
        if(hyp < 0){
          x1 = p2.x;
          y1 = p2.y
        }
        gr.lineTo(x1 , y1)
        x1 += spaceX
        y1 += spaceY
        gr.moveTo(x1 , y1)
        hyp -= spacelen
      }
      gr.moveTo(p2.x,p2.y)
      gr.vertices = gr.vertices ? gr.vertices : [p1, p2];
      gr.type = gr.type? gr.type : 'dashed_line'
    }
    draw()    
    if(masterComponent && new PixiCommon().autoScaleOnZoomed){
      masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
      gr.on('added', ()=>draw(true))
    }
    return gr
  }

  public getCircle(p: PIXI.Point, radiusPx = 20, option = null , masterComponent : null | DrawingBoardComponent = null ) : PixiCircle{
    option = option ? option : new GraphicOptions()
    let ret: PixiCircle = <PixiCircle>option.baseGraphics;
    ret.lineStyle(option.lineThickness, option.lineColor).beginFill(option.fillColor, option.opacity).drawCircle(p.x, p.y, radiusPx).endFill();
    ret.type = ret.type ? ret.type : 'circle'
    ret.vertices = ret.vertices ? ret.vertices : [p];
    ret.radius = ret.radius ? ret.radius : radiusPx;
    ret.zIndex = option.zIndex;
    let setScale = ()=> ret.scale.set( 1/ ((ret.parent? ret.parent.scale.x : 1) * (masterComponent ? masterComponent._ngPixi.viewport.scale.x : 1)))
    if(masterComponent && new PixiCommon().autoScaleOnZoomed){
      setScale()
      masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>{
        setScale()
      })
    }
    return ret
  } 

  public getPolygon(points : PIXI.Point[], option = new GraphicOptions()): PixiPolygon {
    let ret = <PixiPolygon> option.baseGraphics;
    ret.vertices = ret.vertices ? ret.vertices : points;
    ret.beginFill(option.fillColor, option.opacity);
    ret.drawPolygon(points);
    ret.endFill();
    return ret
  }

  public hexToNumColor(hexString : string){
    return Number( hexString.replace("#",'0x'))
  }

  public numToHexColor(color : number){
    return "#"+ color.toString(16).padStart(6,'0')
  }

  get viewport(){
    return this.getViewport()
  }

  getMasterComponent() : DrawingBoardComponent{
    return this.getViewport()?.['DrawingBoardComponent']
  }

  public getViewport(g = this) : Viewport {
    return g instanceof Viewport? g : (g.parent ? this.getViewport(<any>g.parent) : null)
  }

  // public addTooltipObj(gr : PixiCommonGeometry | PIXI.Graphics = this){
  //   let toolTip = new PixiCommonGeometry()
  //   toolTip['type'] = 'toolTip'
  //   gr.addChild(toolTip)
  //   gr['getTooltipGraphic'] = ()=> toolTip
  // }  

  getTooltipGraphic(){
    return this.toolTip
  }

  showToolTip(content , evt , position = null , delay = false){
    if(!content || content.length == 0){
      return
    }
    if (delay && this.toolTip.delay == null) {
      this.toolTip.delay = 750
      setTimeout(() => {
        if (this.toolTip.delay!= null) {
          this.toolTip.show(content ,evt , position)
        }
      }, this.toolTip.delay )
    } else if (!delay) {
      this.toolTip.show(content  ,evt , position)
    }    
  }

  hideToolTip(){
    this.toolTip.delay = null
    this.toolTip.hide()
  }


  getRotateInfoText(gr:PixiCommon | PIXI.Graphics = this){
    return (gr.angle < 180 ? '+' + gr.angle.toFixed(2) : '-' + (360 - gr.angle).toFixed(2)) + "°"
  }

  public getLength(isCurved : boolean, vertices) { 
    if (isCurved) {
      return new Bezier(vertices[0].x, vertices[0].y, vertices[3].x, vertices[3].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y).length()
    } else {
      return Math.hypot(vertices[0].x - vertices[3].x, vertices[0].y - vertices[3].y)
    }
  }
}


//#######################################################################################################################################################
export class PixiToolTip extends PIXI.Graphics{
  text : PIXI.Text = new PIXI.Text(null , {fill:"#FFFFFF" , fontSize : 14})
  parent : PixiCommon
  delay : number
  hidden = true
  content : string
  constructor(_parent){
    super()
    this.parent = _parent
    this.addChild(this.text)
  }
  get stage(){
    return this.getViewport().parent
  }

  public getViewport(g = this.parent) {
    return g?.children.filter(c=>c instanceof Viewport)[0] ? 
             g?.children.filter(c=>c instanceof Viewport)[0] 
            : (g instanceof Viewport? g : (g.parent ? this.getViewport(<any>g.parent) : null))
  }

  show(content : string , mouseEvt ,position : PIXI.Point ){
    if(!this.stage.children.includes(this)){
      this.stage.addChild(this)
    }
    this.clear()
    this.content = content
    this.text.text = this.content
    this.position = position? this.stage.toLocal(position) : mouseEvt.data.getLocalPosition(this.stage)
    this.position.y += this.position.y < 40 ? 40 : (-40)
    // this.toolTip.position.x -= this.toolTip.position.x + this.toolTip.width > this.viewport.width ? this.toolTip.width : 0
    this.beginFill(0x000000 , 0.6).drawRoundedRect(-5, - 5,this.width + 10 ,this.height + 10, 3).endFill()
    this.visible = true
    this.hidden = false
  } 

  hide(){
    this.visible = false
    this.delay = null
    this.hidden = true
  }
}

export class PixiAngleAdjustHandle extends PixiCommon{
  parentGraphics : PixiCommon
  constructor(_parentGraphics , points = null){
    super()
    this.parentGraphics = _parentGraphics
    points = points ? points : [new PIXI.Point(-10 ,- 65), new PIXI.Point(10 , -65) , new PIXI.Point(0 , - 90)]
    this.lineStyle(0).beginFill(this.highlightColor ,0.8).drawPolygon(points).endFill()
    this.visible = false
    this.interactive = true
    this.cursor = 'crosshair'
    this.zIndex = 10
    this.parentGraphics.addChild(this)
    this.on("mousedown", (evt: PIXI.interaction.InteractionEvent) => {
      if(!this.parentGraphics.getMasterComponent()?.readonly){
        evt.stopPropagation()
        this.parentGraphics?.getMasterComponent().changeMode('edit', 'rotate', this, evt)
      }
    })
    this.on("mouseover", (evt: PIXI.interaction.InteractionEvent) =>{
      this.showToolTip(new PixiCommon().getRotateInfoText(this), evt)
    })
    this.on("mouseout", () => this.hideToolTip())
  }  
}

export class PixiPointGroup extends PixiCommon{
  readonly type = 'pointGroup'
  parentPoint : PixiLocPoint
  pixiChildPoints : PixiChildPoint[] 
  settings : { 
    custom : boolean,
    space : number,
    pivot : {x : number , y : number},
    position  : {x : number , y : number},
    relativePosition : {x : number , y : number},
    angle : number,
    bgWidth : number,
    bgHeight : number,
    width : number,
    height : number,
    scale: number,
    robotCount: number,
    row: number,
    column : number,
    neverCustomized : boolean,
    // rowOptions : {value :  number , text : string }[]
    // columnOptions : {value :  number , text : string }[]
  } = {
    custom : false,
    space : 1,
    pivot : null,
    position : null,
    relativePosition: null,
    angle : 0,
    width : 0,
    height : 0,
    bgWidth : 0,
    bgHeight : 0,
    scale: 1,
    robotCount: 3,
    row: 1,
    column : 3,
    neverCustomized : true
    // rowOptions : [],
    // columnOptions : []
  }  
  masterComponent : DrawingBoardComponent
  rotateHandle : PixiRotateHandle
  bgRectangle = new PixiCommon()
  selected = false 
  currentFormation = {
    row: 0,
    column : 0,
    space : 0,
    robotCount : 0
  }
  maxRow
  maxCol
  iconSprite: PIXI.Sprite
  iconSpriteDimension
  svgUrl = 'assets/icons/arrow-up.svg'
  rotateHandlePos = new PIXI.Point(0,0)

  constructor(_parentPoint){
    super()
    this.iconSprite = new PIXI.Sprite(PIXI.Texture.from(this.svgUrl))   
    this.interactive = true
    this.sortableChildren = true
    this.masterComponent = _parentPoint.getMasterComponent()
    this.parentPoint = _parentPoint
    this.masterComponent.mainContainer.addChild(this)
    // this.refreshColumnRowOptions()
    if(this.parentPoint._lastDrawIsSelected){
      this.refreshGraphics()
    }
    this.addChild(this.bgRectangle)
    this.masterComponent.clickEvts.forEach(t => this.on(t,(evt:PIXI.interaction.InteractionEvent)=>{
      if(!this.settings.custom){
        this.masterComponent.changeMode('edit', 'move', this, evt)
        evt.stopPropagation()
        this.draw(true)
      }
    }))
  }

  // this.angleHandle = new PixiAngleAdjustHandle(this, [new PIXI.Point(0, 0), new PIXI.Point(this.settings.scale * ROBOT_ACTUAL_LENGTH_METER /2, 0) ,  new PIXI.Point(this.settings.scale * ROBOT_ACTUAL_LENGTH_METER / 4, this.settings.scale * ROBOT_ACTUAL_LENGTH_METER / 2 )])
  // this.angleHandle.pivot.set(this.angleHandle.width / 2 , - (this.settings.scale * ROBOT_ACTUAL_LENGTH_METER + this.bgRectangle.height / 2))
  async draw(selected = false) {
    this.selected = selected
    if(selected){
      this.masterComponent.selectedGraphics = this
    }
    if(!this.settings.custom && this.masterComponent.editObj.graphics != this){
      this.refreshRotateHandle()
    }
    let top = Math.min.apply(null , this.pixiChildPoints.map(p=>p.position.y))
    let left = Math.min.apply(null , this.pixiChildPoints.map(p=>p.position.x))
    let right = Math.max.apply(null ,this.pixiChildPoints.map(p=>p.position.x)) + this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    let btm = Math.max.apply(null , this.pixiChildPoints.map(p=>p.position.y)) + this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    this.drawBackground(new PIXI.Point(right, btm), new PIXI.Point(left, top))
    this.pixiChildPoints?.forEach(c => {
      c.robotIconScale = this.settings.scale
      c.editable = this.settings.custom
      c.draw()
    })
  }

  refreshGraphics() { //TBD : enhance performance by getting single sprite for all PixiChildPoint instead of multiple
    let rosMapScale = (<any>Object.values(this.masterComponent.mapLayerStore)[0])?.scale?.x
    let scale = rosMapScale * this.masterComponent.util.config.METER_TO_PIXEL_RATIO
    let scaleChanged =  this.settings.scale!= scale
    this.settings.scale = scale
    if ( (!this.settings.custom && (scaleChanged || !this.pixiChildPoints))) {
      this.createNewUniformChildPoints()
    } else if (scaleChanged || this.pixiChildPoints) {
      this.loadChildWayPoints()
    }
    this.draw(this.selected)
    this.refreshParentPointGraphic()    
    // this.pixiChildPoints.forEach(c=>c.scale.set(1/this.parentPoint.scale.x , 1/this.parentPoint.scale.y))
  }

  loadChildWayPoints(){
    if (!this.settings.relativePosition) {
      this.refreshRelativePosition()
    }
    this.pixiChildPoints.forEach(c=>c.draw())
  }

  createNewUniformChildPoints(){
    this.clear()
    let scale = this.settings.scale
    this.resetChildPoints()
    this.pixiChildPoints = []
    let spacePx = Math.round(scale * this.settings.space)
    let lengthPx = Math.round(scale * ROBOT_ACTUAL_LENGTH_METER)
    let k = 0
    let columnCntOfRemainderRow = this.settings.robotCount % this.settings.column == 0 ? this.settings.column : (this.settings.robotCount % this.settings.column)
    for (let i = 0; i < this.settings.row; i++) {
      let lastRowPaddingX = i == this.settings.row - 1 ? ((this.settings.column - columnCntOfRemainderRow) * (lengthPx + spacePx))/2 : 0
      let withOneRobotOnly = this.settings.robotCount - this.pixiChildPoints.length <= this.settings.row - i
      for (let j = 0; j < (withOneRobotOnly ? 1 : (i == this.settings.row - 1 ? columnCntOfRemainderRow : this.settings.column)); j++) {
        lastRowPaddingX = withOneRobotOnly ? (lengthPx + lengthPx) * (this.settings.column - 1) / 2 : lastRowPaddingX
        k = k + 1
        let childPoint = new PixiChildPoint(this, scale , k)
        childPoint.position.set(lastRowPaddingX + j * (spacePx + lengthPx), i * (spacePx + lengthPx))
        this.pixiChildPoints.push(childPoint)
      }
    }
    this.settings.bgWidth = spacePx * Math.max(0, this.settings.column - 1) + (scale * ROBOT_ACTUAL_LENGTH_METER) * this.settings.column
    this.settings.bgHeight = spacePx * Math.max(0, this.settings.row - 1) + (scale * ROBOT_ACTUAL_LENGTH_METER) * this.settings.row
    this.pivot.set(this.settings.bgWidth / 2, this.settings.bgHeight / 2)
    if(!this.settings.relativePosition){
      this.settings.relativePosition = {x : 0 , y :  - (this.settings.bgHeight + (scale * ROBOT_ACTUAL_LENGTH_METER)) / 2}
    }
    this.position.set(this.parentPoint.x + this.settings.relativePosition.x, this.parentPoint.y +  this.settings.relativePosition.y)
  }
  
  resetChildPoints(){
    this.pixiChildPoints?.forEach(c => c.parent.removeChild(c))
    this.pixiChildPoints = null
  }

  adjustRowCount(){
    this.settings.column = this.settings.column > this.settings.robotCount ? this.settings.robotCount : this.settings.column 
    this.masterComponent.ngZone.run(() => this.settings.row = Math.ceil(this.settings.robotCount / this.settings.column))
    this.resetChildPoints()
    this.refreshGraphics()    
  }

  adjustColumnCount() {
    this.settings.row = this.settings.row > this.settings.robotCount ? this.settings.robotCount : this.settings.row 
    this.masterComponent.ngZone.run(() => this.settings.column = Math.ceil(this.settings.robotCount / this.settings.row))
    this.resetChildPoints()
    this.refreshGraphics()
  }

  refreshPosition() {
    this.position.set(this.parentPoint.position.x + this.settings.relativePosition.x, this.parentPoint.position.y + this.settings.relativePosition.y)
  }

  refreshRelativePosition() {
    this.settings.relativePosition = new PIXI.Point(this.position.x - this.parentPoint.position.x, this.position.y - this.parentPoint.position.y)
  }

  refreshRotateHandle(position : PIXI.Point = this.rotateHandlePos){
    this.rotateHandle?.parent?.removeChild(this.rotateHandle)
    if(!this.settings.neverCustomized){
      return
    }   
    let len = this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    //TBR
    this.rotateHandle = new PixiRotateHandle(this, this.settings.bgWidth , [new PIXI.Point(0 - len / 4, - len / 5), new PIXI.Point(0, - len / 1.5), new PIXI.Point(len / 4, - len / 5)] , position)       
    this.addChild(this.rotateHandle);
    this.rotateHandle.draw()
    this.rotateHandle.visible = true
  }

  drawBackground(bottomRightCorner: PIXI.Point  = new PIXI.Point(0 , 0) , topLeftCorner : PIXI.Point  = new PIXI.Point(0 , 0)) {    
    let selected = this.selected  && !this.settings.custom // this.masterComponent.editObj.graphics == this
    this.bgRectangle.interactive = !this.settings.custom
    this.bgRectangle.cursor = selected ? "move" : (!this.settings.custom ? 'pointer' : 'default')
    this.bgRectangle.zIndex = -1
    let color = selected? this.highlightColor : 0xdddddd
    this.bgRectangle.clear()
    if(!this.settings.custom){
      this.rotateHandlePos.x = topLeftCorner.x + (bottomRightCorner.x  - topLeftCorner.x)/2
      this.rotateHandlePos.y =  topLeftCorner.y
      // let orgPivot = new PIXI.Point(this.pivot.x , this.pivot.y)       
      // let refPos = this.toGlobal(new PIXI.Point(this.pixiChildPoints[0].position.x , this.pixiChildPoints[0].position.y))
      this.settings.bgWidth = bottomRightCorner.x - topLeftCorner.x
      this.settings.bgHeight = bottomRightCorner.y - topLeftCorner.y
      // this.pivot.set(topLeftCorner.x + (bottomRightCorner.x - topLeftCorner.x) / 2, topLeftCorner.y + (bottomRightCorner.y - topLeftCorner.y) / 2)
      // // let diff = new PIXI.Point(this.pixiChildPoints[0].position.x - this.toLocal(refPos).x, this.pixiChildPoints[0].position.y - this.toLocal(refPos).y)
      // this.position.set(this.position.x -  +  (this.pivot.x - orgPivot.x) , this.position.y  +  (this.pivot.y - orgPivot.y))
      this.refreshRelativePosition()
      this.bgRectangle.lineStyle(0.1 * this.settings.scale , color , selected ? 0.4 : 0.7 , 1).moveTo(topLeftCorner.x, topLeftCorner.y).lineTo(bottomRightCorner.x,  topLeftCorner.y).lineTo(bottomRightCorner.x, bottomRightCorner.y).lineTo(topLeftCorner.x, bottomRightCorner.y).lineTo(topLeftCorner.x, topLeftCorner.y)
      this.bgRectangle.beginFill(color, selected ? 0.2 : 0.7).drawRect(topLeftCorner.x , topLeftCorner.y,  this.settings.bgWidth ,  this.settings.bgHeight).endFill()

    }
    if(selected){
      this.refreshRotateHandle()
    }else{
      this.rotateHandle?.parent?.removeChild(this.rotateHandle)
    }
  }

  refreshParentPointGraphic(){
    setTimeout(()=>{
      let parentSelected  = this.masterComponent.selectedGraphics == this.parentPoint
      this.parentPoint.input.disabled = !parentSelected
      if(this.parentPoint.angleIndicator){
        this.parentPoint.angleIndicator.visible = parentSelected
      }
      if(this.parentPoint.angleIndicatorCircleBg){
        this.parentPoint.angleIndicatorCircleBg.visible = parentSelected
      }
    })
  }
}

export class PixiChildPoint extends PixiCommon {
  readonly type = 'childPoint'
  pixiPointGroup : PixiPointGroup
  robotIconScale
  actualLengthPx
  icon : PIXI.Graphics
  _editable = false
  selected = false
  _angle = this.angle
  seq = 0
  textSprite : PIXI.Sprite
  set robotAngle (v){
    this._angle = v
    this.icon.angle = v
  }

  get robotAngle(){
    return this._angle
  }

  set editable(v){
    this._editable = v
    this.interactive = v
    this.cursor = v ? 'pointer' : 'default'
    this.zIndex = v ? 20 : 1
  }
  get editable(){
    return this._editable
  }
  constructor( _pointGroup : PixiPointGroup , _robotIconScale : Number , seq : number){
    super()
    this.seq = seq
    this.pixiPointGroup = _pointGroup
    this.robotIconScale = _robotIconScale
    this.zIndex = 10
    this.draw()
    this.pixiPointGroup.addChild(this)
    this.pixiPointGroup.masterComponent.clickEvts.forEach(t => this.on(t,(evt:PIXI.interaction.InteractionEvent)=>{
      setTimeout(()=>{
        this.draw(true)
        evt.stopPropagation()
        this.cursor = 'move'
        this.pixiPointGroup.masterComponent.selectedGraphics = this
        this.pixiPointGroup.masterComponent.changeMode('edit', 'move', this, evt)
        this.pixiPointGroup.children.filter(c=>c!=this && c instanceof PixiChildPoint).forEach(c=> {
          (<PixiChildPoint>c).draw()
        })
      })
    }))
  }

  async draw(selected = false){
    if(!this.icon || (this.robotIconScale  * ROBOT_ACTUAL_LENGTH_METER != this.actualLengthPx || this.selected != selected)){
      this.selected = selected
      let color = selected ? this.highlightColor : this.mouseOverColor
      this.actualLengthPx = this.robotIconScale * ROBOT_ACTUAL_LENGTH_METER
      this.icon?.parent?.removeChild(this.icon)
      this.icon = new PIXI.Graphics()
      let iconSprite = new PIXI.Sprite(this.pixiPointGroup.iconSprite.texture)
      if(!this.pixiPointGroup.iconSpriteDimension){
        this.pixiPointGroup.iconSpriteDimension = await this.getImageDimensionFromUrl(this.pixiPointGroup.svgUrl) 
      }
      iconSprite.scale.set(this.actualLengthPx /  this.pixiPointGroup.iconSpriteDimension[0], this.actualLengthPx /  this.pixiPointGroup.iconSpriteDimension[1])
      this.icon.addChild(iconSprite)
      this.icon.filters = [<any> new ColorReplaceFilter(0x000000, color, 1)]
      this.icon.pivot.set(this.actualLengthPx/ 2,this.actualLengthPx / 2)
      this.icon.position.set(this.actualLengthPx / 2, this.actualLengthPx / 2)
      this.icon.angle = this.robotAngle      
      this.icon.beginFill(color , 0.2).lineStyle(0.1 * this.robotIconScale ,color, 1 , 0).drawRoundedRect(0 , 0 ,  this.actualLengthPx , this.actualLengthPx , 0.1 * this.robotIconScale ).endFill()
      let text = new PIXI.Text(this.seq.toString() , { fontFamily: 'Arial', fontSize : 50 , fill : '#FFFFFF'})     
      this.textSprite =  new PIXI.Sprite(text.texture)
      this.textSprite.zIndex = 20
      this.textSprite.pivot.set(text.width/2 , text.height/2) 
      this.textSprite.position.set(this.icon.pivot.x , this.icon.pivot.y)
      this.textSprite.scale.set( iconSprite.height/(3 * this.textSprite.height) , iconSprite.height/ (3 * this.textSprite.height))
      this.textSprite.angle = this.pixiPointGroup.angle * - 1
      this.sortableChildren = true
      this.addChild(this.textSprite)
      this.addChild(this.icon)
    }
    if(!selected){
      this.cursor = this.editable ? 'pointer' : 'default'
    }
    this.pixiPointGroup.refreshParentPointGraphic()
  }
}

export class PixiLocPoint extends PixiCommon {
  id
  uiSrv
  waypointName // full code
  set hasPointGroup(v){
    if(!this.pixiPointGroup && v){
      this.pixiPointGroup = new PixiPointGroup(this)
      this.centerAndZoom()
    }else if (this.pixiPointGroup && !v){
      this.pixiPointGroup.parent.removeChild(this.pixiPointGroup)
      this.pixiPointGroup = null
    }    
  }
  get hasPointGroup(){
    return this.pixiPointGroup != null && this.pixiPointGroup !=undefined
  }
  pixiPointGroup? : PixiPointGroup
  onDelete = new Subject()
  get code(){
    return this.text
  }
  type = 'waypoint'
  option : GraphicOptions
  link : {arrow : PixiArrow , waypoint : PixiLocPoint}[] = []
  button : PIXI.Graphics
  readonly = false
  iconType = null
  pointType = "NORMAL"
  onInputBlur : EventEmitter<any> = new EventEmitter()
  get orientationAngle(){
    return this.angleIndicator?.angle
  }
  set orientationAngle(v){
    if(this.angleIndicator){
      this.angleIndicator.angle = v
    }
  }
  get text(){
    return this.input?.text ? this.input?.text : this.myText
  }
  set text(t){
    if(this.input){
      this.input.text = t
    }
    this.myText = t
    this.draw(this._lastDrawIsSelected)
  }
  myText = null
  badge : PIXI.Graphics 
  badgeCnt = 0
  input : PixiTextInput
  _lastDrawIsSelected = false
  _lastDrawIsMouseOver = false
  txtInputCfg = {
    input: { zIndex: "10001" , fontSize: '20pt', padding: '10px', width: '120px', color: '#000000', textAlign: 'center', fontWeight:'400' },
    box: {
      default: { rounded: 5 },
      focused: { fill: 0xE1E3EE, rounded: 5, stroke: { color: 0xABAFC6, width: 2 } },
      disabled: { rounded: 5 }
    }
  }

  angleIndicator : PixiAngleAdjustHandle

  taskItemSeqLabel :  PIXI.Graphics 
  taskSeq = ''
  showAngleIndicator = true
  angleIndicatorCircleBg : PIXI.Graphics
  seqMarkerColor  = this.secondaryHighlightColor
  seqMarkerFlashInterval = null
  toolTipContent
  taskItemIndex : number
  dataObj : JPoint
  icon : PIXI.Sprite 
  iconContainer = new PIXI.Graphics();
  iconUrl 
  inputBg = new PIXI.Graphics()
  readOnlyPixiText = new PIXI.Text("")
  rosX 
  rosY

  set color(v){
    this.option.fillColor = Number(v.replace("#","0x"))
    this.option.lineColor = this.option.fillColor
  }


  get isLocation(){
    return this.type == 'location' 
  }


  constructor(type , text = null , opt : GraphicOptions = new GraphicOptions , showAngleIndicator = false , uiSrv = null , iconUrl = null , iconType = null){
    super()    
    this.addChild(this.inputBg)
    this.iconType = iconType
    this.icon = iconUrl ? PIXI.Sprite.from(iconUrl) : null
    this.iconUrl = iconUrl
    this.uiSrv = uiSrv
    this.option = opt
    this.option.baseGraphics = this
    this.sortableChildren = true
    this.type = type// this.isLocation ? 'location' : 'waypoint'
    this.text = text
    this.zIndex = 1
    this.showAngleIndicator = showAngleIndicator
    this.initAngleIndicator()

    // this.addTooltipObj(this.angleIndicator)    
    this.on('added', () => {
      setTimeout(() => this.onViewPortZoomed());
      this.getMasterComponent().onViewportZoomed.pipe(filter(v => v != null)).subscribe(() => this.onViewPortZoomed())
      // (<Viewport>this.getViewport())?.on('zoomed', () => onViewportZoomed.next(true))
      // onViewportZoomed.pipe(filter(v => v != null)).subscribe(() => this.onViewPortZoomed())
    })
    this.addChild(this.getWayPointButton())
    this.on("mouseover" , (evt :  PIXI.interaction.InteractionEvent)=>{
      if(!this._lastDrawIsSelected){
        this.showToolTip(this.toolTipContent ? this.toolTipContent : this.text , evt, undefined , this.readOnlyPixiText.visible)
        this.draw(false, true)
      }
    })
    this.on("mouseout",()=>{
      this.hideToolTip()
      if(!this._lastDrawIsSelected){
        this.draw(false)
      }
    })
  }

  
  refreshRosPositionValue(){
    let drawingBoard = this.getMasterComponent()
    let map : PixiMap =  <any>drawingBoard?.mainContainer.children.filter(c=> c instanceof PixiMapLayer)[0]
    if(drawingBoard && drawingBoard.util.standaloneApp && map){
      let globalPosition = (<any>map).toLocal(drawingBoard.mainContainer.toGlobal(new PIXI.Point(this.position.x, this.position.y)))
      let positions = drawingBoard.calculateRosPosition({x : globalPosition.x , y : globalPosition.y} , map)
      this.rosX = positions.x
      this.rosY = positions.y
    }else if (!map){
      this.rosX = undefined
      this.rosY = undefined
    }
  }

  refreshPositionByRosValue(){
    let drawingBoard = this.getMasterComponent()
    let map : PixiMap =  <any>drawingBoard?.mainContainer.children.filter(c=> c instanceof PixiMapLayer)[0]
    if(drawingBoard && drawingBoard.util.standaloneApp && map){
      let mapPosition = { x: drawingBoard.calculateMapX(this.rosX, map.guiOriginX), y: drawingBoard.calculateMapY(this.rosY, map.guiOriginY) }
      let localPosition = drawingBoard.mainContainer.toLocal((<any>map).toGlobal({ x: mapPosition.x, y: mapPosition.y }))
      this.position.set(localPosition.x , localPosition.y)
      drawingBoard.refreshArrows(this)
    }
  }

  onPositionChange(){
    this.getMasterComponent()?.refreshArrows(this);
    this.pixiPointGroup?.refreshPosition();
    this.getMasterComponent()?.ngZone.run(()=> (<PixiLocPoint>this.getMasterComponent()?.selectedGraphics).refreshRosPositionValue())
  }

  onViewPortZoomed = ()=>{
    let zoomThreshold = 0.5 
    let zeroThreshold = 0.025
    let exceedsThreshold = this.getViewport() && this.getMasterComponent()?.mapTransformedScale && this.getViewport().scale.x < zoomThreshold / this.getMasterComponent()?.mapTransformedScale
    let scale = (Math.min(zoomThreshold, this.getViewport()?.scale.x) - zeroThreshold) / (zoomThreshold - zeroThreshold)
    // if (this.getViewport() && this.getMasterComponent()?.mapTransformedScale && this.getViewport().scale.x  < zoomThreshold) {
    //   this.input.visible = this._lastDrawIsSelected ? true : false
    //   this.inputBg.visible = this._lastDrawIsSelected ? true : false
    // } else {
    //   this.input.visible = true
    //   this.inputBg.visible = true
    // }
    this.setScale(this._lastDrawIsSelected || !exceedsThreshold ? 1 : Math.min(1 , Math.sqrt(scale)))
    // this.pointGroup?.refreshUi()
  }

  setScale(weight = 1) {
    let viewport: Viewport = this.getViewport()
    let scaleX = this.markerScale * weight / (new PixiCommon().autoScaleOnZoomed && viewport ? viewport.scale.x  * this.parent.scale.x : 1)
    let scaleY = this.markerScale * weight / (new PixiCommon().autoScaleOnZoomed && viewport ? viewport.scale.y  * this.parent.scale.y : 1) 
    this.scale.set(scaleX, scaleY)
  }

  toggleButton(show){
    this.interactive = !show
    this.button.visible = show
  }

  async draw(selected = false , isMouseOver = false) {    
    this._lastDrawIsSelected = selected
    this._lastDrawIsMouseOver = isMouseOver
    let useInput = !this.readonly && this.getMasterComponent()?.waypointEditable && selected
    this.refreshTextInput(selected , isMouseOver , useInput)

    let opt = this.option.clone()
    opt.lineColor = selected ? this.highlightColor : ( isMouseOver ? this.mouseOverColor : opt.lineColor)
    opt.fillColor = selected ? this.highlightColor : ( isMouseOver ? this.mouseOverColor : opt.fillColor)

    if( this.taskItemSeqLabel){
      this.iconContainer?.parent?.removeChild(this.iconContainer)
      this.taskItemSeqLabel.tint = isMouseOver ? this.mouseOverColor : this.seqMarkerColor
      if(this.taskItemSeqLabel['isHollow']){
        this.taskItemSeqLabel['text'].style['fill'] = this.taskItemSeqLabel.tint
        this.taskItemSeqLabel['text'].style['stroke'] =  this.taskItemSeqLabel.tint
      }
    }
    if (this.isLocation && this.taskSeq.length == 0) {
      this.beginFill( opt.fillColor,  opt.opacity).drawCircle(0, -40, 20).drawPolygon([new PIXI.Point(-18.8, -33), new PIXI.Point(18.8, -33), new PIXI.Point(0, 0)]).endFill()
      this.beginFill(0xffffff,  opt.opacity).drawCircle(0, -40, 10).endFill()
    } else if(this.taskSeq.length == 0) {
      if(this.icon){
        this.iconContainer?.parent?.removeChild(this.iconContainer)
        this.icon.parent?.removeChild(this.icon)     
        this.iconContainer = new PIXI.Graphics()
        this.iconContainer.height = 50
        this.iconContainer.width = 50
        this.iconContainer.position.set(-25 , -40)
        let dimemsion = await this.getImageDimensionFromUrl(this.iconUrl) 
        if(dimemsion[0] > 50 || dimemsion[1] > 50){
          this.icon.scale.set(70/(Math.max(dimemsion[0], dimemsion[1])))
        }
        this.iconContainer.addChild(this.icon)
        this.icon.filters = [<any>new ColorReplaceFilter(0x000000, opt.fillColor, 0)]
        this.icon.position.set(dimemsion[0] > dimemsion[1] ? 0 : (50 - dimemsion[0] * this.icon.scale.x) / 2, dimemsion[1] > dimemsion[0] ? 0 : (50 - dimemsion[1] * this.icon.scale.y) / 2)
        this.addChild( this.iconContainer)
      }else{
        this.iconContainer?.parent?.removeChild(this.iconContainer)
        this.getCircle(new PIXI.Point(0, 0), 10,  opt)
      }
    }
    this.interactive = true

    this.cursor = selected && !this.readonly ? 'move' : 'pointer'
    this.refreshBadge()
    this.setScale()
    this.removeChild(this.angleIndicatorCircleBg);
    this.angleIndicatorCircleBg = null
    if (this.showAngleIndicator && this.angleIndicator) {
      this.angleIndicator.visible = selected
      if (selected) {
        this.angleIndicatorCircleBg = new PIXI.Graphics();
        this.angleIndicatorCircleBg.lineStyle(2, 0xFFD100, 0.5).beginFill(0xFFD100, 0.1).drawCircle(0, 0, 65).endFill()
        this.addChild(this.angleIndicatorCircleBg);
      }
    }
    this.zIndex = selected? 20 : 1
    if(!isMouseOver && !selected){
      // this.input.visible = selected && !this.readonly && this.getMasterComponent()?.waypointEditable
      // this.inputBg.visible =  true
      // this.readOnlyPixiText.visible = !this.input.visible
      this.onViewPortZoomed()
    }
    this.refreshRosPositionValue()
    if(this.pixiPointGroup){
      this.pixiPointGroup.refreshGraphics()
      this.pixiPointGroup.visible = selected
    }
    if(this.getMasterComponent()?.isDashboard){
      this.readOnlyPixiText.visible = selected || this.getMasterComponent()?.uitoggle.showWaypointName
      this.inputBg.visible = selected || this.getMasterComponent()?.uitoggle.showWaypointName
    }
    return this
  }

  refreshTextInput(selected : boolean , isMouseOver : boolean , useInput = false){
    let setTxtColor = (focused = false)=>{
      let color =  this.txtInputCfg.input.color   
      if(isMouseOver){
        color = this.numToHexColor( this.mouseOverColor)
      }else if(this.taskSeq?.length>0){
        color = this.numToHexColor(this.seqMarkerColor)
      }else if( selected && !focused){
        color = this.numToHexColor( this.highlightColor)
      }
      if(!useInput){
        this.readOnlyPixiText.style.fill = color
      }else{
        this.input.setInputStyle( "color" , color)
      }
    }
    this.txtInputCfg.input.color = new PixiCommon().numToHexColor(this.option.fillColor)
    let cfg = JSON.parse(JSON.stringify(this.txtInputCfg))
    let getInputWidth = ()=> Math.min(300 , Math.max(120 ,  this.text ?  this.text.length * 17.5 : 120))
    cfg.input.textAlign = getInputWidth()  >= 300  ? 'left' : 'center'
    cfg.input.color =  selected ? this.highlightColor : this.option.fillColor
    cfg.input.width =  getInputWidth() + 'px'
    this.clear()
    if(!this.input){
      this.input = new PixiTextInput(cfg)
      this.input.position.set(- (10 +  getInputWidth()/2), this.isLocation ? 0 : 15)
      this.input['type'] = 'input'
      this.addChild(this.input);
      let inputEl : HTMLInputElement = this.input.htmlInput;
      inputEl.addEventListener('input', (e) => {
        inputEl.value = (<any>e.target)?.value?.toUpperCase()?.substring(0, wayPointCodeMaxLength)
      })
      this.input.on('blur' , ()=> {       
          this.onInputBlur?.emit()
          if(!this.readonly){
            this.text = this.input.text
            this.input.parent?.removeChild(this.input)
            this.input = null //refresh Width
            this.draw(true)
            setTxtColor()    
          }
      })
      if(!this.readonly){
        this.input.on('focus',()=>  setTxtColor(true))
      }
    }
    this.inputBg.zIndex = -10
    this.inputBg.clear()
    this.input.disabled = this.uiSrv?.isTablet || !selected || (this.isLocation && this.text?.length) || this.readonly
    this.input.text = this.text
    if(!useInput){
      this.input.visible = false
      this.readOnlyPixiText.visible = true
      if(!this.children.includes(this.readOnlyPixiText)){
        this.readOnlyPixiText.anchor.set(0.5)
        //pivot.set(this.readOnlyPixiText.width/2 , this.readOnlyPixiText.height/2)
        this.readOnlyPixiText.position.set(this.input.position.x + this.input.width/2 , this.input.position.y + this.input.height/2 )
        this.addChild(this.readOnlyPixiText)
      }
      this.readOnlyPixiText.text = this.text.length > 15 ? this.text.substring(0 , 15) + '...' : this.text
      this.inputBg.lineStyle(0).beginFill(0xffffff, 0.7).drawRect(-this.readOnlyPixiText.width / 2 - 10 , this.readOnlyPixiText.height - 7, this.readOnlyPixiText.width + 20, this.readOnlyPixiText.height + 10 ).endFill()
    } else {
      this.input.visible = true
      this.readOnlyPixiText.visible = false
      this.inputBg.lineStyle(0).beginFill(0xffffff, 0.7).drawRect(this.input.position.x, this.input.position.y, this.input.width, this.input.height).endFill()
    }
    setTxtColor()  
  }



  refreshBadge(cnt = this.badgeCnt){
    this.badgeCnt = cnt
    if(this.badge){
      this.removeChild(this.badge)
    }
    if(this.type=='location' && this.badgeCnt){
      this.badge = new PIXI.Graphics()
      this.addChild(this.badge)
      this.badge.beginFill(0xffffff).drawCircle(0,0, 13).endFill()
      this.badge.beginFill(0x999999).drawCircle(0,0, 12).endFill()
      this.badge.position.set(20,-50)
      let content = new PIXI.Text(this.badgeCnt.toString(), { fontFamily: 'Arial', fill: 0xffffff, fontSize : 16 })
      this.badge.addChild(content)
      content.position.set(-4.5 * (this.badgeCnt.toString().length), -9.5)
    }
  }

  getWayPointButton(){
    this.button =  new PIXI.Graphics()  
    this.button.beginFill(0x000000, 0.15).drawRoundedRect(-40 ,-40 + (this.type == 'location' ? -35 : 0) , 80 , 100 + (this.type == 'location' ? 15 : 0) , 5).endFill()
    this.button.zIndex = 0
    this.button['type'] = 'button'
    this.button.interactive = true
    this.button.cursor = 'pointer'
    this.button.visible = false
    return this.button
  }

  setTaskItemSeq(v: string, color: number = this.secondaryHighlightColor, hollow = false, flash = false) {
    this.taskSeq = v
    this.drawTaskItemIndexLabel(color, hollow)
    if (flash) {
      this.seqMarkerFlashInterval = setInterval(() => { this.drawTaskItemIndexLabel(color, !this.taskItemSeqLabel?.['isHollow']) }, 1500)
    } else if (this.seqMarkerFlashInterval) {
      clearInterval(this.seqMarkerFlashInterval)
    }
  }

  onIconTypeChange() {
    if (this.getMasterComponent()) {
      let base64 = (<DropListPointIcon[]>this.getMasterComponent().dropdownData.iconTypes).filter(t => t.code == this.iconType)[0]?.base64Image
      this.iconUrl = base64 && base64.length > 0 ? base64 : null
      this.icon = this.iconUrl ? PIXI.Sprite.from(this.iconUrl) : null
      this.draw(true)
    }
  }

  drawTaskItemIndexLabel(color : number, hollow){
    let textColor = hollow ? color : 0xFFFFFF
    if(this.taskItemSeqLabel){
      this.removeChild(this.taskItemSeqLabel)
    }
    if(this.taskSeq.length > 0){
      this.taskItemSeqLabel = new PIXI.Graphics()
      this.taskItemSeqLabel['type'] = 'remarks'
      this.taskItemSeqLabel['isHollow'] = hollow
      this.addChild(this.taskItemSeqLabel)
      const textSprite = new PIXI.Text(this.taskSeq, { fontFamily: 'Arial', fill: textColor, fontSize : 35 , strokeThickness: 1 , stroke:  textColor});
      this.taskItemSeqLabel.addChild(textSprite)
      this.seqMarkerColor =  color 
      this.taskItemSeqLabel.tint =  this.seqMarkerColor 
      textSprite.position.set((-1 / 2) * textSprite.width, 0)
      this.taskItemSeqLabel['text'] = textSprite
      this.taskItemSeqLabel.lineStyle(2 , 0xffffff).beginFill(0xffffff , hollow ? 0 : 1).drawRect((-1 / 2) * textSprite.width - 10, 0, textSprite.width + 20, textSprite.height).endFill()
      this.taskItemSeqLabel.position.set(0,-textSprite.height * 0.75 )
    }
    setTimeout(()=>this.draw())
    // this.iconContainer?.parent?.removeChild(this.iconContainer)
  }


  initAngleIndicator(){
    if(this.showAngleIndicator){
      this.angleIndicator = new PixiAngleAdjustHandle(this)
      return
    }
    // this.angleIndicator = new PixiCommon()
    // this.angleIndicator.lineStyle(0).beginFill(this.highlightColor ,0.8).drawPolygon([new PIXI.Point(-10 ,- 65), new PIXI.Point(10 , -65) , new PIXI.Point(0 , - 90)]).endFill()
    // this.angleIndicator.visible = false
    // this.angleIndicator.interactive = true
    // this.angleIndicator.cursor = 'crosshair'
    // this.angleIndicator.zIndex = 10
    // this.addChild(this.angleIndicator)
  }

  centerAndZoom(){
    if(this.pixiPointGroup?.pixiChildPoints?.[0]){
      let zoomWidth = (this.pixiPointGroup.pixiChildPoints?.[0]?.robotIconScale * ROBOT_ACTUAL_LENGTH_METER) * this.getMasterComponent().util.config.METER_TO_PIXEL_RATIO
      let vp =  this.getViewport()
      let idx = Math.floor(this.pixiPointGroup?.pixiChildPoints?.length / 2) 
      let zoomPos = this.getMasterComponent()?.mainContainer.toLocal(this.pixiPointGroup?.toGlobal(new PIXI.Point(this.pixiPointGroup.pixiChildPoints?.[idx]?.x , this.pixiPointGroup.pixiChildPoints?.[idx]?.y)))
      vp?.snapZoom({removeOnComplete: true, width: zoomWidth, interrupt: false, time: 1500 , center : zoomPos})
      for(let i = 0 ; i < 60 ; i ++ ){
        setTimeout(()=> {
          this.getMasterComponent()?.onViewportZoomed.next(true) 
          this.getMasterComponent()?.refreshArrows()      
        }, i * 25)
      }
    }
  }
}


//#######################################################################################################################################################


export class PixiArrow extends PixiCommon {
  id
  vertices_local
  vertices: PIXI.Point[]
  option : GraphicOptions
  type = 'arrow'
  arrowType
  parent
  velocityLimit = 1
  direction = 'FORWARD'
  _lastDrawIsSelected = false
  fromShape : PixiLocPoint
  toShape: PixiLocPoint
  pixiControlPoint1 : PIXI.Graphics
  pixiControlPoint2 : PIXI.Graphics
  dataObj : JPath
  quadraticCurve = false
  
  get isCurved (){
    return this.type == 'arrow_curved' || this.type == 'arrow_bi_curved'
  }
  get bidirectional (){
    return this.type == 'arrow_bi_curved' || this.type == 'arrow_bi'
  }
  
  constructor(verts : PIXI.Point[] , type , opt:GraphicOptions = new GraphicOptions(undefined,undefined,undefined,10)){
    super()
    this.type = type
    this.option = opt
    this.vertices = verts
    this.vertices_local = [new PIXI.Point(0, 0), new PIXI.Point(this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y)]
    this.draw()
    this.on('added',()=>this.draw())
  }

  draw(selected = false) {
    this._lastDrawIsSelected = selected
    this.vertices_local = [new PIXI.Point(0, 0) , new PIXI.Point(this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y)]
    let opt = this.option.clone()
    let scale = new PixiCommon().autoScaleOnZoomed && this.getViewport() ? 1 / (this.getViewport().scale.x * this.parent?.scale.x) : 1
    opt.lineColor = selected ? this.highlightColor : opt.lineColor
    opt.fillColor = selected ? this.highlightColor : opt.fillColor
    opt.baseGraphics = this
    opt.lineThickness = opt.lineThickness * this.arrowThicknessScale * scale
    this.clear()
    this.lineStyle(opt.lineThickness, opt.lineColor)
 
    if (this.pixiControlPoint1 && this.pixiControlPoint2) { //this.children.filter(c => c['type'] == 'bezier_ctrl_pt1').length > 0
      //pending : store local position of control point instead of that to mapContainer
      let vertices = this.vertices_local.slice()
      let cp1gr = this.pixiControlPoint1 //this.children.filter(c => c['type'] == 'bezier_ctrl_pt1')[0]
      let cp2gr = this.pixiControlPoint2 // this.children.filter(c => c['type'] == 'bezier_ctrl_pt2')[0]
      let cp1 = cp1gr.position
      let cp2 = cp2gr.position
      cp1gr.visible = selected
      cp2gr.visible = selected
      this.getBezierSection(selected , vertices.slice(), [cp1 , cp2].slice() , opt , 7.5 * Math.sqrt(scale)) //testing
 
      
      if (selected) {
        this.getDashedLine(cp2, vertices[1], new GraphicOptions(this, undefined, undefined, undefined, 0.15,undefined,opt.lineThickness  ))
        this.getDashedLine(cp1, vertices[0], new GraphicOptions(this, undefined, undefined, undefined, 0.15,undefined,opt.lineThickness ))
      }
    } else {
      this.getLine(this.vertices_local[0], this.vertices_local[1], opt);
      this.getArrowHead(this.vertices_local[0], this.vertices_local[1], opt, ((this.type == 'arrow_bi' || this.type == 'arrow_bi_curved') ? 'both' : 'right'))
      delete this['p3']
    }
    this.position.set(this.vertices[0].x, this.vertices[0].y)
    this.zIndex = selected ? opt.zIndex + 10 : - 1
    this.setClickEventArea()  
    if(this.getMasterComponent()?.isDashboard){
      this.hitArea = null
    }
    return this
  }


  setCurveControlPoints(p1: PIXI.Point, p2: PIXI.Point , masterComponent : DrawingBoardComponent = null) {
    masterComponent = masterComponent ? masterComponent :this.getMasterComponent() 
    this.pixiControlPoint1 = this.getCircle(new PIXI.Point(0, 0), masterComponent.handleRadius, new GraphicOptions(undefined, undefined, this.highlightColor, undefined, 0.5, undefined, 0), masterComponent);
    this.pixiControlPoint2 = this.getCircle(new PIXI.Point(0, 0), masterComponent.handleRadius, new GraphicOptions(undefined, undefined, this.highlightColor, undefined, 0.5, undefined, 0), masterComponent);
    this.pixiControlPoint1.position = p1; //new PIXI.Point(midPt.x + len *  (yratio) , midPt.y + len * (1/xratio));// adjustPos[0] ;
    this.pixiControlPoint2.position = p2; // new PIXI.Point(midPt.x - len *  (yratio) , midPt.y - len * (1/xratio));//adjustPos[1] ;
    [this.pixiControlPoint1, this.pixiControlPoint2].forEach(h => {
      h.buttonMode = true
      // h['type'] = 'bezier_ctrl_pt' + (arrow.children.length + 1)
      h.interactive = true
      h.cursor = 'move'
      this.addChild(h)
      masterComponent.clickEvts.forEach(t => {
        h.on(t, (evt: PIXI.interaction.InteractionEvent) => {
          evt.stopPropagation()
          masterComponent.changeMode('edit', 'bezier', h, evt)
        })
      })
    })
    this.draw()
  }

  getControlPointGlobalPositions(map : PixiMapLayer | PixiMapContainer  = null):{x:number , y : number}[]{
    let getPosFrPoint = (p : PIXI.Point , convert = false)=>{ 
      let p2 = convert ? (map ? map.toLocal(this.toGlobal(p)) : this.getMasterComponent().mainContainer.toLocal(this.toGlobal(p))) : p
      return {x :p2.x , y : p2.y} 
    }
    if(this.pixiControlPoint1 && this.pixiControlPoint2){
      return [getPosFrPoint(this.pixiControlPoint1.position , true) , getPosFrPoint(this.pixiControlPoint2.position , true)]
    }else{
      return [getPosFrPoint(this.fromShape.position) , getPosFrPoint(this.toShape.position)]
    }
  }

  setApproxHitAreaOfBezierCurve(vertices : PIXI.Point[] , ctrlPts : PIXI.Point[]){
    let hitAreaVertices1 = []
    let hitAreaVertices2 = []
    let sectionDelta = 0.01
    let prevCenter = {x : vertices[0].x, y:vertices[0].y}
    for(let i = sectionDelta; i < 1; i+=sectionDelta){
      let hitAreaWidth = 10
      let tmpPts = getBezierSectionPoints(vertices,ctrlPts , i , 1 )
      let newCenter = {x :tmpPts.xa , y: tmpPts.ya}
      let radius = Math.hypot(newCenter.x - prevCenter.x, newCenter.y - prevCenter.y)
      // this.lineStyle(1,0x000000).drawCircle(newCenter.x , newCenter.y , radius)
      let intersections = intersectionsOfCircles({x:newCenter.x , y:newCenter.y , r:radius},{x:prevCenter.x , y:prevCenter.y , r:radius})
      if(intersections['point_1'] && intersections['point_2']){
        let p1 = new PIXI.Point(intersections['point_1'].x , intersections['point_1'].y)
        let p2 = new PIXI.Point(intersections['point_2'].x , intersections['point_2'].y)
        let height =  Math.abs(p2.y - p1.y)
        let width = Math.abs(p2.x - p1.x)
        let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
        let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width))
        let yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
        p1 = new PIXI.Point(midPt.x + hitAreaWidth * xRatio, midPt.y + hitAreaWidth * yRatio)
        p2 = new PIXI.Point(midPt.x - hitAreaWidth * xRatio, midPt.y - hitAreaWidth * yRatio)
        hitAreaVertices1.push(p1.x, p1.y)
        hitAreaVertices2.unshift(p2.x, p2.y)
      }
      prevCenter = { x: newCenter.x, y: newCenter.y }
    }
    // this.drawPolygon(hitAreaVertices1.concat(hitAreaVertices2))
    this.hitArea = new PIXI.Polygon(hitAreaVertices1.concat(hitAreaVertices2))
  }

  getBezierSection( selected , vertices : PIXI.Point[] , ctrlPts : PIXI.Point[] , opt : GraphicOptions , space = 25) {
    const x1 = vertices[0].x 
    const y1 = vertices[0].y
    const x2 = vertices[1].x 
    const y2 = vertices[1].y
    const bx1 = ctrlPts[0].x
    const by1 = ctrlPts[0].y
    const bx2 = ctrlPts[1].x
    const by2 = ctrlPts[1].y
    // let getLen = (x, y, x0, y0) => Math.sqrt((y0 - y) * (y0 - y) + (x0 - x) * (x0 - x))
    // let chord =  getLen(x1 , y1, x2 , y2);
    // let cont_net = getLen(x1, y1, bx1, by1) + getLen(bx1, by1, bx2, by2) + getLen(x2, y2, bx2, by2);
    let arc_length = new Bezier(x1, y1, x2, y2, bx1, by1, bx2, by2).length()// (cont_net + chord) / 2;
    let t0 = Math.min(0.49, Math.max(0, space/ arc_length))
    let t1 = 1 - t0
    let pts = getBezierSectionPoints(vertices, ctrlPts, t0, t1)
  
    this.lineStyle(opt.lineThickness , opt.lineColor).moveTo(pts.xd, pts.yd).bezierCurveTo(pts.xc, pts.yc, pts.xb, pts.yb, pts.xa, pts.ya)
    if (this.type == 'arrow_bi_curved' || this.type == 'arrow_bi') {
      this.getArrowHead(new PIXI.Point(pts.xb, pts.yb), new PIXI.Point(pts.xa, pts.ya), opt, 'right')
    }
    this.getArrowHead(new PIXI.Point(pts.xd, pts.yd), new PIXI.Point(pts.xc, pts.yc), opt, 'left')
    if(!selected){
      this.setApproxHitAreaOfBezierCurve([new PIXI.Point(pts.xd, pts.yd), new PIXI.Point(pts.xa, pts.ya)], 
                                         [new PIXI.Point(pts.xc, pts.yc), new PIXI.Point(pts.xb, pts.yb)])
    }else{
      this.hitArea = null
    }
  }


  getArrowHead(p1: PIXI.Point, p2: PIXI.Point, option: GraphicOptions = new GraphicOptions(), type: 'left' | 'right' | 'both'): PIXI.Graphics {
    let PI = Math.PI;
    let d1 = 225 * PI / 180 - 20;
    let d2 = 135 * PI / 180 + 20;
    let scale = new PixiCommon().autoScaleOnZoomed && this.getViewport() ? 1 / this.getViewport().scale.x : 1
    let cosDelta = (d) => this.arrowHeadLength * scale * Math.cos(Math.atan2(p2.y - p1.y, p2.x - p1.x) + d)
    let sinDelta = (d) => this.arrowHeadLength * scale * Math.sin(Math.atan2(p2.y - p1.y, p2.x - p1.x) + d)
    option.baseGraphics.interactive = true
    option.baseGraphics.cursor = 'pointer'
    if (type == 'right' || type == 'both') {
      this.getPolygon([p2, new PIXI.Point(p2.x + cosDelta(d1), p2.y + sinDelta(d1)), new PIXI.Point(p2.x + cosDelta(d2), p2.y + sinDelta(d2))], option)
    }
    if (type == 'left' || type == 'both') {
      this.getPolygon([p1, new PIXI.Point(p1.x - cosDelta(d1), p1.y - sinDelta(d1)), new PIXI.Point(p1.x - cosDelta(d2), p1.y - sinDelta(d2))], option)
    }
    return option.baseGraphics
  }

  
  setClickEventArea( buttonHeight = 20){
    if(this.curveTypes.includes(this.type)){
      return
    }
    let p1 = this.vertices_local[0]
    let p2 = this.vertices_local[1]
    let height =  Math.abs(p2.y - p1.y)
    let width = Math.abs(p2.x - p1.x)
    let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width))
    let yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
    let vertices = [new PIXI.Point(p1.x + buttonHeight * yRatio ,  p1.y - buttonHeight * xRatio ) , 
                    new PIXI.Point(p1.x - buttonHeight * yRatio ,  p1.y + buttonHeight * xRatio ) ,
                    new PIXI.Point(p2.x - buttonHeight * yRatio ,  p2.y + buttonHeight * xRatio ) ,
                    new PIXI.Point(p2.x + buttonHeight * yRatio ,  p2.y - buttonHeight * xRatio ) ]
    this.hitArea = new PIXI.Polygon(vertices)
    // this.zIndex = -1
    return this
  }
}

interface PixiMap {
  mapCode?: string
  robotBase?: string
  originX: number
  originY: number
  type: string
  ROS: PIXI.Sprite
  initialWidth: number
  initialHeight: number
  dataObj : JMap
  base64Image : string
  guiOriginX: number
  guiOriginY: number
}

export class PixiMapLayer extends PixiCommon implements PixiMap {
  mapCode?: string
  robotBase?: string
  dataObj : JMap
  originX: number
  originY: number
  guiOriginX: number
  guiOriginY: number
  
  readonly type = "mapLayer"
  initialWidth: number
  initialHeight: number
  initialOffset: PIXI.Point
  ROS: PIXI.Sprite
  _editable: boolean
  base64Image : string
  
  set editable(v) {
    this._editable = v
    this.removeEditorFrame()
    if (v && this.getViewport()) {
      this.addEditorFrame()
      this.getMasterComponent()?.onViewportZoomed.pipe().subscribe(()=>{
        if(this.getMasterComponent()?.selectedGraphics == this){
          this.removeEditorFrame()
          this.addEditorFrame()
        }
      })
    }
  }
  rotateHandle : PixiRotateHandle
  resizeHandles: PixiResizeHandle[]

  addRectangularBorder(width , height , lineColor = this.highlightColor) {
    width = width/this.scale.x
    height = height / this.scale.y 
    let borderWidth = this.getMasterComponent().lineWidth/ (this.scale.x * this.getViewport().scale.x)
    let points = [
      new PIXI.Point(borderWidth/2 , borderWidth/2),
      new PIXI.Point(width  - borderWidth/2, borderWidth/2),
      new PIXI.Point(width  - borderWidth/2, height - borderWidth/2),
      new PIXI.Point(borderWidth/2, height - borderWidth/2)
    ]
    this.drawBorder(points , lineColor)
  }

  addEditorFrame(width = null, height = null) {
    if (this.getMasterComponent().uiSrv.isTablet) {
      return
    }
    if(this.border == null){
      this.addRectangularBorder( this.initialWidth * this.scale.x  , this.initialHeight * this.scale.y)
    }
    width = width ? width : this.width
    height = height ? height : this.height
    let rotateHandleRadius = this.imgEditHandleSize * 1.3
    this.sortableChildren = true
    // if (!this['getTooltipGraphic']) {
    //   new PixiCommonGeometry().addTooltipObj(this)
    // }
    let rotateHandle = new PixiRotateHandle(this , width)
    this.rotateHandle = rotateHandle
    this.addChild(rotateHandle);
    rotateHandle.draw()

    this.resizeHandles = [];
    ['nw', 'ne', 'se', 'sw'].forEach(k => {
      let resizeHandle = new PixiResizeHandle(this , k ,width , height)
      resizeHandle.draw()
      this.addChild(resizeHandle);
      this.resizeHandles.push(resizeHandle)
    })
  }

  removeEditorFrame() {
    this.children.filter(c => c instanceof PixiRotateHandle || c instanceof PixiResizeHandle || c instanceof PixiBorder).forEach(c => {
      if(c instanceof PixiRotateHandle || c instanceof PixiResizeHandle){
        c.hideToolTip()
      }
      this.removeChild(c)
    })
    this.border = null
  }
}

export class PixiBorder extends PIXI.Graphics{
  readonly type = 'border'
  points : PIXI.Point[]
  parent : PixiCommon
  lineColor : number
  constructor(_parent :PixiCommon , _points :  PIXI.Point[] , _lineColor : number = null ){
    super()
    this.points = _points
    this.parent = _parent
    this.lineColor = _lineColor == null ? this.parent.highlightColor : _lineColor
  }
  draw(){
    this.clear()
    let p0 = this.points[this.points.length - 1]
    let opt = new GraphicOptions()
    opt.baseGraphics = this
    opt.lineColor = this.lineColor
    opt.lineThickness = this.parent.getMasterComponent().lineWidth/(this.parent.scale.x * this.parent.getViewport().scale.x), this.lineColor
    this.lineStyle(opt.lineThickness ).moveTo(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y)
    this.points.forEach(p => {
      this.parent.getDashedLine(p0, p, opt)
      p0 = p
    })
  }
}

export class PixiResizeHandle extends PixiCommon{
  readonly type = 'imgEditHandle'
  parent : PixiMapLayer
  orientation : 'nw' | 'ne' | 'se' | 'sw'
  x :number
  y: number
  frameWidth : number 
  frameHeight : number 
  constructor(_parent : PixiMapLayer , _orientation : string , _frameWidth : number , _frameHeight : number  ){
    super()
    this.parent = _parent
    this.orientation = (<any> _orientation)
    this.frameWidth  =  _frameWidth
    this.frameHeight  =  _frameHeight
  }

  draw() {
    let edgeLength = this.parent.imgEditHandleSize * 2 / (this.parent.scale.x * this.parent.getViewport().scale.x)
    let cornersMap = {
      nw: [0, 0],
      ne: [this.frameWidth / this.parent.scale.x - edgeLength, 0],
      se: [this.frameWidth / this.parent.scale.x - edgeLength, this.frameHeight / this.parent.scale.y - edgeLength],
      sw: [0, this.frameHeight / this.parent.scale.y - edgeLength]
    }
    this.clear()
    this.width = this.frameWidth  / this.parent.scale.x
    this.height = this.frameWidth / this.parent.scale.y
    // this['orientation'] = k == 'nw' ? 315 : (k == 'ne' ? 45 : k == 'se' ? 135 : 225)
    this.beginFill(this.parent.highlightColor).drawRect(cornersMap[this.orientation][0], cornersMap[this.orientation][1], edgeLength, edgeLength).endFill();
    this.zIndex = 2;
    this.interactive = true
    this.setCursor()
    // this.cursor = getShiftedOrientation() + '-resize'
    this.on('mouseover', (evt: PIXI.interaction.InteractionEvent) => {
      if(this.parent?.toolTip?.hidden){
        this.showToolTip(this.parent.scale.x.toFixed(2) + ' x', evt)
      }
    })
    this.on('mouseout', () => this.hideToolTip())
    this.parent.getMasterComponent().clickEvts.forEach(t => {
      this.on(t, (evt: PIXI.interaction.InteractionEvent) => {
        evt.stopPropagation();
        this.parent?.getMasterComponent()?.changeMode('edit', 'resize', this.parent, evt)
      })
    })
  }

  setCursor(){
    let orientations = ['n' , 'ne' , 'e' , 'se' , 's' , 'sw' , 'w' , 'nw']
    let index =  (orientations.indexOf(this.orientation) + Math.round(Math.max(0 , (this.parent.angle)) / 45))%8
    this.cursor =  orientations[index] + '-resize'
  }
}

export class PixiRotateHandle extends PixiCommon{
  readonly type = 'imgEditHandle'
  parent : PixiCommon
  frameWidth : number 
  polygonVertices
  pos
  constructor(_parent : PixiCommon , _frameWidth : number , _polygonVertices : PIXI.Point[] = null , _position: PIXI.Point = new PIXI.Point(0,0)){
    super()
    this.parent = _parent
    this.frameWidth = _frameWidth
    this.polygonVertices = _polygonVertices
    this.pos = _position
  }
  draw(){
    this.clear()
    if(this.polygonVertices){
      this.beginFill(this.highlightColor).drawPolygon(this.polygonVertices).endFill();
      this.position.set( this.pos.x ,  this.pos.y)
    }else{
      this.beginFill(this.highlightColor).drawCircle(this.frameWidth / 2, 0, this.imgEditHandleSize * 1.3 / this.parent.getViewport().scale.x).endFill();
    }
    this.width = this.parent.width
    this.height = this.parent.height
    this.zIndex = 2;
    this.interactive = true
    this.cursor = 'crosshair'
    this.on('mouseover', (evt: PIXI.interaction.InteractionEvent) => {
      if (this.parent?.toolTip?.hidden && !isNaN(Number(this.parent?.angle))) {
        this.showToolTip((this.parent.angle < 180 ? '+' + this.parent.angle.toFixed(2) : '-' + (360 - this.parent.angle).toFixed(2)) + "°", evt)
      }
    })
    this.on('mouseout', () => this.hideToolTip())
    this.on('mousedown', (evt: PIXI.interaction.InteractionEvent) => {
      evt.stopPropagation()
      this.parent?.getMasterComponent()?.changeMode('edit', 'rotate', this.parent, evt)
    });
    this.scale.set(1 / this.parent.scale.x, 1 / this.parent.scale.y)
  }
}


export class PixiMapContainer extends PixiCommon implements PixiMap {
  mapCode?: string
  robotBase?: string
  originX: number
  originY: number
  guiOriginX: number
  guiOriginY: number
  readonly type = "mapContainer"
  ROS: PIXI.Sprite
  initialWidth: number
  initialHeight: number
  dataObj : JMap
  base64Image : string
}

export class PixiVertex extends PixiCommon{
  readonly type = 'vertex'
  index : number
  option : GraphicOptions
  parent : PixiCommon
  point : PIXI.Point
  masterComponent : DrawingBoardComponent
  constructor( _parent : PixiCommon , _point : PIXI.Point , _masterComponent : DrawingBoardComponent , _option : GraphicOptions){
    super()
    this.point = _point
    this.parent = _parent
    this.option = _option
    this.option.baseGraphics = this
    this.masterComponent = _masterComponent
    this.draw()
    // this.getCircle(this.point, this.parent.getMasterComponent().handleRadius/(this.parent.scale.x * this.parent.getViewport().scale.x) , this.option);
  }
  draw(){
    this.clear()
    this.getCircle(this.point, this.masterComponent.handleRadius/(this.parent.scale.x *  this.masterComponent._ngPixi.viewport.scale.x),  this.option )
  }
}

export class PixiPolygon extends PixiCommon{
  public pixiRobotCountTag : PixiRobotCountTag
  public vertices : PIXI.Point[] = []
  public pixiVertices : PixiVertex[] = []
  public arcsBuildingName = null
  public arcsBuildingCode = null
  readonly type = "polygon" 
  constructor(_vertices: PIXI.Point[] , _graphicOption : GraphicOptions  , _isDashBoardBuilding : boolean ){
    super()
    this.vertices = _vertices
    this.graphicOption = _graphicOption 
    this.isDashboardBuilding = _isDashBoardBuilding
    this.interactive = true
    if(this.isDashboardBuilding){
      this.on('mouseover' , (evt: PIXI.interaction.InteractionEvent)=>{
        if(this.arcsBuildingName){
          this.hideToolTip()
          this.showToolTip(this.arcsBuildingName, evt , this.toGlobal(new PIXI.Point(this.pixiRobotCountTag.position.x , this.pixiRobotCountTag.position.y )) , true )
        }
        this.graphicOption.opacity = 0.3
        this.graphicOption.lineThickness = 3 /this.getMasterComponent()?._ngPixi.viewport.scale.x
        this.draw()
        this.pixiRobotCountTag.textColor = 0x333333
        this.pixiRobotCountTag.option.fillColor = 0xffffff
        this.pixiRobotCountTag.option.opacity = 0.7
        this.pixiRobotCountTag.draw()
      })
      this.on('mouseout' , ()=>{
        if(this.arcsBuildingName){
          this.hideToolTip()
        }
        this.graphicOption.opacity = 0.0001
        this.graphicOption.lineThickness = 0
        this.draw()
        this.pixiRobotCountTag.textColor = 0xffffff
        this.pixiRobotCountTag.option.fillColor  = this.mouseOverColor
        this.pixiRobotCountTag.option.opacity = 1
        this.pixiRobotCountTag.draw()
      });
      ['touchstart', 'mousedown'].forEach(clickEvt => {
        this.on(clickEvt , (evt: PIXI.interaction.InteractionEvent)=>{
          this.getMasterComponent().arcsLocationTree.building = {code : this.arcsBuildingCode  , name : this.arcsBuildingName }
          this.getMasterComponent().onBuildingSelected.emit(this.arcsBuildingCode)          
        })
      })
    }
  }
  isDashboardBuilding : boolean
  graphicOption : GraphicOptions
  draw(selected = false , fillColor = null) {
    let option = this.graphicOption
    option.fillColor = fillColor ? Number(fillColor) : option.fillColor 
    this.clear()
    this.removeChild(this.border)
    if(selected){
      this.drawBorder(this.vertices)
      if(this.pixiVertices.length == 0){
        for (let i = 0; i < this.vertices.length; i++) {
          let vertexGr = this.getMasterComponent()?.drawVertex(this, this.vertices[i])
          this.pixiVertices.push(vertexGr)
          vertexGr.index = i
          this.addChild(vertexGr)
        }
      }
    }else{
      this.pixiVertices = []
      this.removeChildren()
    }
    if(this.pixiRobotCountTag && ! this.children.includes(this.pixiRobotCountTag)){
      this.addChild(this.pixiRobotCountTag)
    }
    this.lineStyle(this.isDashboardBuilding ? option.lineThickness : 0 , option.lineColor).beginFill(option.fillColor, selected ? 0.8: option.opacity).drawPolygon(this.vertices).endFill();
    this.cursor = selected ? 'move' : 'pointer'
    this.zIndex = option.zIndex
  }

  refreshVertexPosition(vertexIndex : number , vertexPosition : PIXI.Point , pixiVertexPosition : PIXI.Point){
    this.vertices[vertexIndex] = vertexPosition
    this.pixiVertices[vertexIndex].position.set(pixiVertexPosition.x , pixiVertexPosition.y)
    this.draw(true)
    if (this.pixiRobotCountTag && !inside(this.pixiRobotCountTag.position, this.vertices)) {
      let tagPos = centroidOfPolygon(this.vertices)
      if (!inside(tagPos, this.vertices)) {
        tagPos = { x: (this.vertices[0].x + this.vertices[1].x) / 2, y: (this.vertices[0].y + this.vertices[1].y) / 2 }
      }
      this.pixiRobotCountTag.position.set(tagPos.x , tagPos.y)
    }
  }

}

export class PixiRobotCountTag extends PixiCommon{
  readonly type = 'vertex'
  option : GraphicOptions
  polygon : PixiPolygon
  masterComponent : DrawingBoardComponent
  _robotCount : number = 0
  set robotCount(v){
    this._robotCount = v
    this.draw()
  }
  get robotCount(){
    return this.robotCount
  }
  readonly = true
  radius = 15
  originalPosition
  textColor = 0xffffff
  pixiText : PIXI.Text 
  
  constructor(_parent: PixiPolygon, _point: {x:number , y : number}, _masterComponent: DrawingBoardComponent, _option: GraphicOptions, _readonly = true) {
    super()
    this.position = new PIXI.Point(_point.x , _point.y)
    this.polygon = _parent
    this.option = _option
    this.option.baseGraphics = this
    this.masterComponent = _masterComponent
    // this.textColor = this.readonly ? 0x000000 : 0xffffff
    this.pixiText = new PIXI.Text(this._robotCount.toString(), { fontFamily: 'Arial', fill: this.textColor, fontSize : this.radius });
    this.pixiText.anchor.set(0.5)
    this.addChild(this.pixiText)
    this.polygon.pixiRobotCountTag = this
    this.readonly = _readonly
    //this.readonly = true // testing
    _masterComponent.onViewportZoomed.subscribe(() => this.scale.set(1/ (this.masterComponent._ngPixi.viewport.scale.x)))
    this.polygon.addChild(this)
    this.draw()
    // this.getCircle(this.point, this.parent.getMasterComponent().handleRadius/(this.parent.scale.x * this.parent.getViewport().scale.x) , this.option);
  }

  draw() {
    this.clear()
    this.beginFill(this.option.fillColor , this.option.opacity).drawCircle(0, 0, this.radius).endFill() 
    this.originalPosition = { x: this.position.x, y: this.position.y }    
    this.pixiText.text = this._robotCount?.toString()
    this.pixiText.style = { fontFamily: 'Arial', fill: this.textColor, fontSize : this.radius }
    // let circle = this.getCircle(this.point, this.masterComponent.handleRadius / (this.parent.scale.x * this.masterComponent._ngPixi.viewport.scale.x), this.option)
    if (!this.readonly) {
      this.interactive = true
      this.cursor = 'move'
      this.on('mousedown', (evt: PIXI.interaction.InteractionEvent) => {
        this.originalPosition = { x: this.position.x, y: this.position.y }
        evt.stopPropagation()
        this.masterComponent?.selectGraphics(this)
        this.masterComponent?.onMouseDownOfGraphics(this, evt)
        this.cursor = 'move'
      })
      this.masterComponent?.clickEndEvts.forEach(t => {
        this.on(t, () => {
          if (!inside(this.position, this.polygon.vertices)) {
            this.position = new PIXI.Point(this.originalPosition.x , this.originalPosition.y)
            this.masterComponent?.uiSrv.showNotificationBar('Out of Boundary')
          }
        })
      })
    }
    this.zIndex = 2
  }
}


//#######################################################################################################################################################




// initBuildingPolygon_ARCS(gr : PixiCommon, vertices , shapeJData){
//   let buildingId =  shapeJData['buildingId']
//   let buildingName =  this.dropdownData.buildings.filter((b:DropListBuilding)=>b.buildingId ==  buildingId)[0]?.['buildingName']
//   let hoverBorder = new PIXI.Graphics()
//   // gr.addTooltipObj()
//   hoverBorder = this.getPolygon(vertices , new GraphicOptions(new PixiCommon(),undefined,undefined,undefined,0,new PixiCommon().mouseOverColor, 8), true)
//   gr.addChild(hoverBorder)
//   gr.interactive = true
//   gr.removeAllListeners()
//   hoverBorder.visible = false
//   gr.on('mouseover', (evt : PIXI.interaction.InteractionEvent) =>{
//     gr.showToolTip(buildingName ,evt)
//     hoverBorder.visible = true
//   })
//   gr.on('mouseout', ()=> {
//     gr.hideToolTip()
//     hoverBorder.visible = false
//   })
//   gr.on('mousedown',()=>{
//     this.ngZone.run(async()=>{       
//       let ticket2 = this.uiSrv.loadAsyncBegin()
//       let fps =  <DropListFloorplan[]>(await this.dataSrv.getDropList('floorplans')).data
//       let floorplans = <DropListFloorplan[]>(fps.filter((p:DropListFloorplan) => p.buildingId == Number((<ShapeJData> buildingId))))
//       let defaultFp = floorplans.filter(fp=>fp.isBuildingDefaultPlan)[0] // pending : get from property
//       if(!defaultFp){
//         this.uiSrv.showNotificationBar('No floorplan assigned to this building' ,'warning')
//         this.uiSrv.loadAsyncDone(ticket2)
//         return
//       }else{
//         this.dropdownData.floorplans = floorplans
//         this.dropdownOptions.floorplans = this.dataSrv.getDropListOptions('floorplans', floorplans)
//         let ds = await this.dataSrv.getFloorplanFullDs(defaultFp.planId)            
//         await this.loadFloorPlanFullDataset(ds, true, true , true)            
//         this.arcsObjs.hierarchy.building = {
//           id: buildingId, name: buildingName 
//         }
//         this.arcsObjs.selectedPlan = defaultFp.planId      
//         this.uiSrv.loadAsyncDone(ticket2)
//       }     
//     })
//   })
// }


  // addBadgeToPolyon(gr: PIXI.Graphics, position = null , movable = true ) { //TO BE MOVED to PixiPolygon
  //   // USED FOR ARCS TO DISPLAY SITE ROBOT COUNT
  //   //TESTED with gr['type'] == 'polygon' ONLY , be careful when using the function with other graphics types , e.g. img
  //   let x = gr.width /2
  //   let y = gr.height/2
  //   let drawOrgin = (pos = null)=>{
  //     if(gr['vertices']){
  //       let xs = gr['vertices'].map(v => v['x'])
  //       let ys = gr['vertices'].map(v => v['y'])
  //       x = pos ? pos.x : ((Math.max.apply(null,xs) + Math.min.apply(null,xs))/2) 
  //       y = pos ? pos.y : ((Math.max.apply(null,ys) + Math.min.apply(null,ys))/2) 
  //       gr['origin'] = new PIXI.Point(x, y)
  //     }
  //     let color = 0x000000
  //     let circle = new PixiCommon().getCircle(new PIXI.Point(), this.handleRadius * 3, new GraphicOptions(undefined, undefined, color, undefined, 0.6, color , 0),this)
  //     circle['type'] = 'origin'
  //     circle.zIndex = 10
  //     gr.sortableChildren = true
  //     gr.addChild(circle)
  //     circle.position.set(x, y)
  //     gr['setBadgeText'] = (text)=>{ 
  //       let content = new PIXI.Text(text.toString(), { fontFamily: 'Arial', fill: 0xffffff, fontSize : 17 })
  //       if(circle['content']){
  //         circle.removeChild(content)
  //       }
  //       circle['content'] = content
  //       circle.addChild(content)
  //       content.position.set(-4.5 * (text.toString().length), -9.5)
  //     }

  //     if(movable){
  //       circle.interactive = true
  //       circle.cursor = 'move'
  //       circle.on('mousedown',(evt:PIXI.interaction.InteractionEvent)=>{
  //         circle['originalPosition'] = {x : circle.position.x , y: circle.position.y}
  //         evt.stopPropagation()
  //         this.selectGraphics(null)
  //         this.selectedGraphics = circle
  //         this.onMouseDownOfGraphics(circle , evt)
  //         circle.cursor = 'move'
  //       })
  //       this.clickEndEvts.forEach(t=>{
  //         circle.on(t, ()=>{          
  //           if (!inside(circle.position, gr['vertices'])) {
  //             circle.position = circle['originalPosition'] 
  //             this.uiSrv.showNotificationBar('Out of Boundary')
  //           }
  //           gr['origin'] = circle.position
  //         })
  //       })
  //     }
  //   }

  //   drawOrgin(position)

  //   if(gr['draw']){
  //     let oldDraw =  gr['draw']
  //     gr['draw'] = function() {
  //       gr['origin'] = gr.children.filter(c=>c['type'] == 'origin')[0]?.position
  //       oldDraw.apply(this, arguments);
  //       if(!arguments[0]){ //not selected , unhighlight ,  = will remove children
  //         drawOrgin(gr['origin'])
  //       }
  //     }
  //   }
  // }



