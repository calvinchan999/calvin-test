import { Component, AfterViewInit, Input, ViewChild, ElementRef, EventEmitter, Injectable, Inject, Output, ChangeDetectorRef, Renderer2, HostListener, NgZone, OnInit , OnDestroy } from '@angular/core';
import { NgPixiViewportComponent } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-viewport.component';
import {PixiMapViewport, PolygonType } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-viewport';
import { PixiGraphicStyle } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import * as PIXI from 'pixi.js';
import * as PixiTextInput from 'pixi-text-input';
// import { Pose2D } from 'src/app/models/floor-plan.model';
import { BehaviorSubject, merge, Observable, of, Subject, timer } from 'rxjs';
import { debounce, debounceTime, filter, min, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';
import { centroidOfPolygon, getAngle , getDijkstraGraph, getLength, getOrientation, getOrientationByAngle , inside, intersectionsOfCircles, trimAngle, trimNum} from 'src/app/utils/math/functions';
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
import {DataService} from 'src/app/services/data.service';
import { ShapeJData , MapJData, FloorPlanDataset, MapDataset, robotPose, DropListFloorplan, DropListLocation, DropListMap, DropListAction, DropListBuilding, JMap, JPoint, JPath, JFloorPlan, DropListRobot, DropListPointIcon, RobotStatusARCS, JChildPoint, FloorPlanAlertTypeDescMap } from 'src/app/services/data.models';
import { AuthService } from 'src/app/services/auth.service';
import * as roundSlider from "@maslick/radiaslider/src/slider-circular";
import {GraphBuilder, DijkstraStrategy} from "js-shortest-path"
import { TxtboxComponent } from '../txtbox/txtbox.component';
import { PositionService } from '@progress/kendo-angular-popup';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';
import { ArcsDashboardComponent } from 'src/app/arcs/arcs-dashboard/arcs-dashboard.component';
import { ConfigService } from 'src/app/services/config.service';
import {AdjustmentFilter} from '@pixi/filter-adjustment';
import { GetImage, GetImageDimensions} from 'src/app/utils/graphics/image';
import { ConvertColorToHexadecimal , ConvertColorToDecimal} from 'src/app/utils/graphics/style';
import { DRAWING_STYLE } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import { IDraw as IDraw, IReColor, Pixi1DGraphics, PixiBorder, PixiCircle, PixiCurve, PixiDashedLine, PixiGraphics, PixiLine, PixiToolTip } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-base-graphics';
import { style } from '@angular/animations';
import {calculateMapOrigin, calculateMapX, calculateMapY} from './pixi-ros-conversion'
import {  PixiContainer} from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-base-container';
import { PixiPath, PixiChildPoint, PixiWayPoint, PixiMap, PixiMapContainer, PixiEditableMapImage, PixiPointGroup, PixiBuildingPolygon, PixiRobotCountTag, PixiRobotMarker, PixiRosMapOriginMarker, PixiTaskPath, PixiMapGraphics, PixiEventMarker } from '../../utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics'
import { GetResizedBase64, GetResizedCanvas, GetSpriteFromUrl } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-functions';
import { MqService } from 'src/app/services/mq.service';
import { RobotService, RobotState } from 'src/app/services/robot.service';
import { FloorPlanState, MapService } from 'src/app/services/map.service';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ArcsEventDetectionDetailComponent } from 'src/app/arcs/arcs-dashboard/arcs-event-detection-detail/arcs-event-detection-detail.component';

// adapted from
// http://jsfiddle.net/eZQdE/43/

export const radRatio = 180 / 3.14159265358979323846264338327950288419716939937510
const VIRTUAL_MAP_ROS_HEIGHT = 20


//pending : add curved arrow default curved (rescontrol point ) 
@Component({
  selector: 'uc-drawing-board', //*** TO BE REVISED , need to revise CSS */
  templateUrl: './map-2d-viewport.component.html',
  styleUrls: ['./map-2d-viewport.component.scss']
})

export class Map2DViewportComponent implements OnInit , AfterViewInit , OnDestroy{
  standaloneModule : {
    common : CommonModule,
    data : DataModule , 
    navigation : NavigationModule,
    localization : LocalizationModule,
    lidarPointCloud : PointCloudModule , 
    robot : StandaloneRobotModule,
    site ? : SiteModule,
    task : TaskModule,
    ui : UiModule 
  }

  arcsModule : {
    common : CommonModule,
    data : DataModule ,
    robot : ARCSRobotModule,
    site  : SiteModule,
    navigation ? : NavigationModule,
    localization? : LocalizationModule,
    lidarPointCloud? : PointCloudModule ,
    task : TaskModule,
    ui : UiModule
  }

  commonModule : CommonModule

  datasetModule : {

  }

  get module(){
    return this.util.arcsApp ? this.arcsModule : this.standaloneModule
  }

  
  
  @ViewChild(NgPixiViewportComponent) public _ngPixi: NgPixiViewportComponent;
  @ViewChild('uploader') public uploader
  @ViewChild('angleSlider') public angleSlider : ElementRef
  @ViewChild('kendoAngleSlider') public kendoAngleSlider 
  _waypointEditable = false
  @Input() set waypointEditable(v) {
    this._waypointEditable = v
    if (this.viewport) {
      this.viewport.settings.waypointEditable = v
    }
  }
  get waypointEditable(){
    return this._waypointEditable
  }
  @Input() uploadMustMatchOriginalSize = false
  @Input() showWaypointType = false
  @Input() arcsParent : ArcsDashboardComponent
  @Input() polygonType : PolygonType
  @Input() loadMapContainers = false
  
  get viewport(){
    return <PixiMapViewport>this._ngPixi?.viewport
  }

  get withMapLayer(){
    return Object.values(this.viewport.mapLayerStore).length > 0
  }

  id = 0;
  get selectedGraphics() : any{
    return this.viewport?.selectedGraphics 
  }

  @Input() set selectedGraphics(g){
    if(this.viewport){
      this.viewport.selectedGraphics = g
    }
    // this.ngZone.run(()=> this.selectedGraphicsChange.emit(g))
  }

  subscriptions = []
  _pickSpawnPoint = false
  _readonly = false
  @Output() imageUploaded = new EventEmitter<{base64 : string , width : number , height : number}>()
  
  @Input() set arcsRobotColors(v){
    if(this.module.robot && this.module.robot instanceof ARCSRobotModule){
      this.module.robot.robotColors = v
      this.module.robot.refreshRobotColors()
    }
  }  
  @Input() set arcsRobotType (v){
    this.module.robot.robotType = v
  }
  get arcsRobotType(){
    return this.module.robot.robotType
  }

  @Input() set  selectedFloorPlanCode(v){
    this.module.data.selectedFloorPlanCode = v
    this.selectedFloorPlanCodeChange.emit(v)
  }
  get selectedFloorPlanCode(){
    return this.module.data.selectedFloorPlanCode 
  }
  @Output() selectedFloorPlanCodeChange: EventEmitter<any>  = new EventEmitter();
  @Input() subscribeTask = false
  @Input() customInitialViewPosition = true
  @Input() hideRelocationButton = false
  @Input() showScanButton = false
  @Input() height;
  @Input() width;
  @Input() backgroundImgBase64;
  @Input() canUploadMultiImg = true
  @Input() hideButton : any = { } //keys : all, polygon , brush , arrow , upload , point , export , delete , line , manual
  @Input() disableButton : any = { } //keys : all, polygon , brush , arrow , upload , point , export , delete , line
  @Input() set overlayMsg(v){
    this.commonModule.ui.overlayMessage = v
  }
  get overlayMsg(){
    return  this.commonModule.ui.overlayMessage 
  }
  
  @Input() set readonly (v){
    this._readonly = v
    if(this.viewport){
      this.viewport.readonly = v
    }
  }
  get readonly (){
    return this._readonly
  }
  _showRobot = false
  @Input() set showRobot(v){
    this._showRobot =  v
    if(this.viewport){
      this.viewport.settings.showRobot = v
    }
  } 
  get showRobot(){
    return this._showRobot
  }
  @Input() showDropdown = false
  @Input() engineerMode = false
  @Input( ) showRosToggle = false
  @Input() setupWayPointIcon = false
  @Input() testWayPointName = "WAYPOINT"
  @ViewChild('ucPointTextBox') ucPointTextBox : TxtboxComponent
  @ViewChild('container') containerElRef : ElementRef;
  // @Output() beginDrawPolygon: EventEmitter<any> = new EventEmitter();
  // @Output() onDrawingsCreated: EventEmitter<any> = new EventEmitter();
  @Output() robotClicked: EventEmitter<any> = new EventEmitter();
  @Output() fileLoad : EventEmitter<any> = new EventEmitter();
  @Output() selectedGraphicsChange : EventEmitter<any> = new EventEmitter(); 
  @Output() graphicsUnselected : EventEmitter<any> = new EventEmitter(); 
  @Output() scanClicked: EventEmitter<any> = new EventEmitter();
  // @Output() pickMapClicked : EventEmitter<any> = new EventEmitter();
  // @Output() onBuildingSelected: EventEmitter<any> = new EventEmitter(); 
  @Output() onSiteSelected: EventEmitter<any> = new EventEmitter(); 
  @Output() confirmSpawnPick : EventEmitter<any> = new EventEmitter(); 
  @Output() addLocalWayPointClicked:  EventEmitter<any> = new EventEmitter(); 
  @Output() cancelPopupScreen : EventEmitter<any> = new EventEmitter(); 
  @Output() terminateRemoteControl :  EventEmitter<any> = new EventEmitter(); 
  @Output() demoWaypointLoaded :  EventEmitter<any> = new EventEmitter(); 
  @Output() to3D :  EventEmitter<any> = new EventEmitter(); 
  @Input() background = 0xFFFFFF
  
  disableKendoKeyboardNavigation = false

  @Input() set uitoggle(v){
    this.module.ui.toggle = v
  }

  @Input() set popupScreen(b) {
    this.commonModule.ui._popupScreen = b
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

  // drawingsCreated = []; //TO BE REMOVED (REVISE export() FIRST )
  get pixiRosMapOriginMarker(): PixiRosMapOriginMarker {
    return this.mainContainer.children.filter(c => c instanceof PixiRosMapOriginMarker).map(c => <PixiRosMapOriginMarker>c)?.[0]
  }

  robotBasesOptions : {value : string , text : string}[] = []
  // brushPaintings = []; //to implement undo easily , not included in drawingsCreated
  // linesCreated = []; //to implement undo easily , not included in drawingsCreated
  mainContainerId


  get robotModule (){
    return this.util.arcsApp? this.arcsModule?.robot : this.module?.robot
  }
  get robots() : Robot[]{
    return this.robotModule?.robots
  } 


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

  public initDone = new BehaviorSubject(false);


  PIXI = PIXI
  set editData(v){
    if(this.viewport){
      this.viewport.editData = v
    }
  }
  get editData(){
    return this.viewport?.editData
  }

  set mode(v){
    if(this.viewport){
      this.viewport.mode = v
    }
  }
  get mode(){
    return this.viewport?.mode
  }

  mouseUpListenerObj = {}
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
    markerLight : {color : "#cbacec" , opacity: 1 },
  }
  point = {type : 'waypoint'}

  mapHeight
  mapWidth
  mapOrgin = {x: 0 , y :0}
  mapLoaded = false
  backgroundSprite : PIXI.Sprite =  new PIXI.Sprite()
  uniquePathDestination = true


  loadingTicket = null
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


  public onDestroy = new Subject()
  public set mainContainer(v){
    this.viewport.mainContainer = v
  }

  public get mainContainer(){
    return this.viewport?.mainContainer
  }
  
  //storing objects for ARCS only , not used in standalone
  @Input() set site(v){
    this.module.site.locationTree.site = v
  }
  
  @Input() set arcsLocationTree(v){
    this.module.site.locationTree = v
    this.arcsLocationTreeChange.emit(v)
  }

  @Output() arcsLocationTreeChange = new EventEmitter()


  confirmPending = false

  textInputFocused(selectedGraphicOnly = true){
    return selectedGraphicOnly? (<any>this.selectedGraphics?.children.filter(c=>c['type'] == 'input')[0])?.htmlInput === document.activeElement :  document.activeElement.tagName.toUpperCase()=='INPUT'
  }

  @HostListener('document:keydown.delete', ['$event'])
  onDeleteKeyDown(event: KeyboardEvent) {
    if(this.suspended || this.readonly || this.hideButton['all']|| this.hideButton['delete'] || (this.textInputFocused() && ((<any>this.selectedGraphics)?.text?.length > 0)) ){
      return
    }
    if(this.selectedGraphics && !(this.selectedGraphics instanceof PixiWayPoint && DRAWING_STYLE.arrowTypes.includes(this.viewport.createData?.type))  && !this.uiSrv.overlayActivated(this.elRef.nativeElement)){
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
      if(this.selectedGraphics instanceof PixiWayPoint && !(<PixiWayPoint> this.selectedGraphics)?.text?.length){
        this.deleteSelectedGraphics()
      }
      this.viewport.mode = null
    }
    if(this.selectedGraphics && !this.uiSrv.overlayActivated(this.elRef.nativeElement) ){
      let inputs = this.selectedGraphics.children.filter(c=>c['type'] == 'input')
      if(inputs.length > 0){
        (<any>inputs[0]).blur()
      }
    }
  }

  addSubtractKeyStep = 1
  @HostListener('document:keydown.,', ['$event'])
  @HostListener('document:keydown.dot', ['$event'])
  onAddSubtractKeyDown(event: KeyboardEvent) {
    if(this.module.localization?.previewData.alignLidar){
      this.addSubtractKeyStep +=  this.addSubtractKeyStep< 100 ? 0.1 : 0
      let tmp =  this.module.localization?.previewData.rotation + (event.key == ',' ? 0.1 : -0.1) *  this.addSubtractKeyStep
      this.module.localization.previewData.rotation = (360 + tmp)%360 //tmp > 180 ? tmp - 360  : (tmp < - 180 ? 360 + tmp : tmp )
      this.module.localization?.refreshPos()
      this.module.localization?.refreshLidarLayerPos()
    }
  }

  @HostListener('document:keyup.,', ['$event'])
  @HostListener('document:keyup.dot', ['$event'])
  onAddSubtractKeyUp(){
    this.addSubtractKeyStep = 1
  }

  arrowKeyStep = 1
  @HostListener('document:keydown.arrowup', ['$event'])
  @HostListener('document:keydown.arrowdown', ['$event'])
  @HostListener('document:keydown.arrowleft', ['$event'])
  @HostListener('document:keydown.arrowright', ['$event'])
  moveGraphicsByArrowNavKey(event: KeyboardEvent){
    if(this.textInputFocused(false) || (!this.module.localization?.previewData.alignLidar && (this.suspended || this.readonly))){
      return
    }
    this.arrowKeyStep +=  this.arrowKeyStep< 100 ? 0.1 : 0
    let xIncre = (event.key == 'ArrowLeft'? -1 : (event.key == 'ArrowRight' ? 1 : 0)) * this.arrowKeyStep
    let yIncre = (event.key == 'ArrowUp'? 1 : (event.key == 'ArrowDown' ? -1 : 0)) * this.arrowKeyStep
    if(this.module.localization?.previewData.alignLidar){
      this.disableKendoKeyboardNavigation = true
      this.module.localization?.adjustPos(xIncre , yIncre)
      this.module.localization?.refreshLidarLayerPos();
    }else if(this.selectedGraphics && (!(this.selectedGraphics instanceof PixiPath))){
      if(this.selectedGraphics instanceof PixiChildPoint){
        let oldPosMainContainer = this.mainContainer.toLocal(this.selectedGraphics.parent.toGlobal(this.selectedGraphics.position))
        let newPosMainContainer = new PIXI.Point(oldPosMainContainer.x + xIncre , oldPosMainContainer.y - yIncre ) //-yIncre reason to be found out
        let newPos = this.selectedGraphics.parent.toLocal(this.mainContainer.toGlobal(newPosMainContainer))
        this.selectedGraphics.position.set(newPos.x , newPos.y);
      }else{
        this.selectedGraphics.position.x += xIncre
        this.selectedGraphics.position.y -= yIncre
      }
      (<PixiGraphics>this.selectedGraphics).events.dragging.emit()
    } else if (this.viewport.selectedGraphicsList){
      this.viewport.selectedPixiPaths.filter(p=>p.isCurved).forEach(p=>{
        p.vertices[2].x += xIncre ; 
        p.vertices[2].y -= yIncre ; 
        p.vertices[3].x += xIncre ; 
        p.vertices[3].y -= yIncre ; 
      })
      this.viewport.selectedGraphicsList.forEach(g=>{
        g.position.x += xIncre
        g.position.y -= yIncre;
        (g).events.dragging.emit()
      })
      // this.viewport.selectedPixiPaths.filter(p=>p.isCurved).forEach(p=>{
      //   let pos1 = this.mainContainer.toLocal((<PixiCurve>p.segment).pixiControlPoint1.parent.toGlobal((<PixiCurve>p.segment).pixiControlPoint1.position));
      //   let pos2 = this.mainContainer.toLocal((<PixiCurve>p.segment).pixiControlPoint2.parent.toGlobal((<PixiCurve>p.segment).pixiControlPoint2.position));
      //   pos1.x += xIncre;
      //   pos1.y -= xIncre; 
      //   pos2.x += xIncre;
      //   pos2.y -= xIncre; 
      //   (<PixiCurve>p.segment).pixiControlPoint1.position =(<PixiCurve>p.segment).pixiControlPoint1.parent.toLocal(this.mainContainer.toGlobal(pos1)) ;
      //   (<PixiCurve>p.segment).pixiControlPoint2.position =(<PixiCurve>p.segment).pixiControlPoint2.parent.toLocal(this.mainContainer.toGlobal(pos2)) ;
      //   (<PixiCurve>p.segment).draw()
      // });
    }
  }
  @HostListener('document:keyup.arrowup', ['$event'])
  @HostListener('document:keyup.arrowdown', ['$event'])
  @HostListener('document:keyup.arrowleft', ['$event'])
  @HostListener('document:keyup.arrowright', ['$event'])
  onArrowKeyUp(event: KeyboardEvent){
    if(this.module.localization?.previewData.alignLidar){
      this.disableKendoKeyboardNavigation = false
    }
    this.arrowKeyStep = 1
  }

  constructor( public mapSrv : MapService, public robotSrv : RobotService, public util: GeneralUtil, public changeDetector: ChangeDetectorRef,private renderer: Renderer2 , public dataSrv : DataService, public configSrv : ConfigService,
              public uiSrv : UiService,  public httpSrv : RvHttpService, public elRef : ElementRef, public ngZone : NgZone , public authSrv : AuthService , public mqSrv : MqService) {
      this.commonModule = new CommonModule(this)
      if(this.util.standaloneApp){
        const robotModule =  new StandaloneRobotModule(this.commonModule) 
        this.standaloneModule = {
          common : this.commonModule,
          data : this.commonModule.data,
          robot: robotModule,
          navigation: new NavigationModule(this.commonModule),
          localization: new LocalizationModule( this.commonModule),
          lidarPointCloud: new PointCloudModule(this.commonModule),
          task : new TaskModule(this.commonModule),
          ui : this.commonModule.ui
        }  
      }else{
        const robotModule =  new ARCSRobotModule(this.commonModule) 
        this.arcsModule = {
          common : this.commonModule,
          data : this.commonModule.data,
          robot: robotModule,
          site : new SiteModule(this.commonModule),
          task : new TaskModule(this.commonModule),
          ui : this.commonModule.ui
        }  
      }
      this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }

  
  async ngOnInit(){
    this.overlayMsg = this.showRobot && this.util.standaloneApp ? this.uiSrv.translate("Initializing ...") : this.overlayMsg 
    // console.log(`window height : ${window.innerHeight} , window width : ${window.innerWidth}  `)
    if(!this.uiSrv.Map2DViewportComponents.includes(this)){
      this.uiSrv.Map2DViewportComponents.push(this)
    }
  }

  async ngAfterViewInit() {
    // await this.getDropList()
    this.init()
    // if (this.showDropdown) {
    //   this.getDropList(this.module?.localization?.pickingMap)
    // }
  }

  async ngOnChange(evt){

  }

  async init() {
    await this.commonModule.data.initDropDown()
    this.defaultPointType = (<DropListPointIcon[]>this.commonModule.data.dropdownData.iconTypes).filter(t=> !t.base64Image || t.base64Image.length == 0)[0].code//TBR
    let ret = new Subject()
    setTimeout(async () => {
      this.onDestroy.next()
      this.module.ui.toggle.darkMode = this.showRobot
      if (this.showRobot && this.dataSrv.getLocalStorage('uitoggle')) {
        let storedToggle = JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) //SHARED by 2D & 3D viewport
        Object.keys(storedToggle).forEach(k => {
          if (Object.keys(this.module.ui.toggle).includes(k)) {
            this.module.ui.toggle[k] = storedToggle[k]
          }
        })
        // this.module.ui.toggle = JSON.parse(this.dataSrv.getlocalStorage('module.ui.toggle'))
      }
      if (!this.width || !this.height) {
        this.width = this.elRef.nativeElement.parentElement.offsetWidth
        this.height = this.elRef.nativeElement.parentElement.offsetHeight
      }
      this._ngPixi.size = { width: this.width, height: this.height }
      // this.viewport['Map2DViewportComponent'] = this
      this.reset()

      // let bgContainer = new PIXI.Container()
      this.backgroundSprite = this.backgroundImgBase64 ? await GetSpriteFromUrl(this.backgroundImgBase64, this.uiSrv.isTablet) : new PIXI.Sprite()
      this.mainContainer.addChild(this.backgroundSprite)
      this.backgroundSprite.zIndex = -1

      if (this.backgroundImgBase64 && !this.customInitialViewPosition) {
        this.viewport.zoomPercent(this.util.config.MAP_ZOOM_PERCENTAGE, true);
        this._ngPixi.flyTo(this.mainContainer.width / 2, this.mainContainer.height / 2)
      } else if (this.defaultPos?.x && this.defaultPos?.y & this.defaultPos.zoom) {
        this.setViewportCamera(this.defaultPos.x, this.defaultPos.y, this.defaultPos.zoom)
      }
      this.viewport.selectedGraphicsChange.pipe(takeUntil(this.onDestroy)).subscribe((evt) => {
        this.selectedGraphicsChange.emit(evt)
        if (evt && evt instanceof PixiWayPoint &&  this.commonModule.data.selectedPointCode != evt.text ) {
          this.commonModule.data.selectedPointCode = evt.text
        }
      })
      this.viewport.graphicsUnselected.pipe(takeUntil(this.onDestroy)).subscribe((evt) => this.graphicsUnselected.emit(evt))
      this.viewport.mode = null;
      this.viewport.readonly = this.readonly
      // this.viewport.on('zoomed',()=>this.onViewportZoomed.next(true))
      this.viewport.settings.waypointEditable = this.waypointEditable
      this.viewport.settings.polygonType = this.polygonType
      this.viewport.settings.showRobot = this.showRobot
      Object.keys(this.viewport.settings).forEach(k => {
        this.viewport.settings[k] = this[k]
      })

      this._ngPixi.app.renderer.transparent = false
      this._ngPixi.app.renderer.backgroundColor = this.background

      // this.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(this.onDestroy)).subscribe(()=>{
      //   this.refreshRobotScale()
      // })      
      this.uiSrv.loadAsyncDone(this.loadingTicket)
      this.initDone.next(true)
      ret.next(true)
    })
    return <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
  }


  ngOnDestroy() {
    try{
      this.uiSrv.Map2DViewportComponents = this.uiSrv.Map2DViewportComponents.filter(c => c != this)
      this.subscriptions.forEach(s=>s.unsubscribe())
      // if(this.mqPoseSubscribed){
      //   this.mqSrv.unsubscribeMQTT('poseDeviation')
      //   this.mqSrv.unsubscribeMQTT('pose')
      // }
      if(this.module.robot instanceof ARCSRobotModule){
        this.module.robot.unsubscribePose()
      }
    }catch{}
     this.onDestroy.next()
  }
  
  public resumeViewportPlugin(pluginName){
    this.viewport.resumePlugin(pluginName)
  }

  public suspendViewportPlugin(pluginName){
    this.viewport.pausePlugin(pluginName)
  }

  async reset() {
    this.mainContainerId = null
    this.viewport.removeChildren()
    this.viewport.parent?.children?.filter(c => c instanceof PixiToolTip).forEach(c => c.parent.removeChild(c))
    this.mainContainer = new PixiContainer();
    this.viewport.addChild(this.mainContainer)
    this.viewport.mapContainerStore = {};
    this.viewport.mapLayerStore = {};
    this.mainContainer.interactive = true
    this.viewport.interactive = true
    this.mainContainer.sortableChildren = true;

    if (!this.util.standaloneApp) {
      this.arcsModule.robot.robots = []
    } else {
      this.module.localization.previewData.footprint = []
      this.module.navigation.resetTarget()

      if (this.showRobot && this.robots.length == 0) {
        this.overlayMsg = this.uiSrv.translate("Select Starting Postion")
        // this.mqPoseSubscribed = true
        this.module.robot.addRobot(this.dataSrv.robotProfile?.robotCode, null)

        this.standaloneModule.robot.subscribeRobotPose()
        // await this.pixiElRef.loadFloorPlanFullDataset(await this.dataSrv.getFloorplanFullDs(fpId) , true , true)
        // this.addRobot(this.dataSrv.robotMaster?.robotCode , null);
        // this.subscribePose_SA()
      }
    }

  }
  
  get initDone$(){
    return this.initDone.pipe(filter(v => v == true), take(1))
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

  setViewportCamera(x , y, zoom = this.viewport.scale.x , smooth = false , smoothMs = 500) {
    this.viewport.scale.set(zoom, zoom)   
    this._ngPixi.flyTo(x, y, smooth ? smoothMs : 0)     
  }

  // changeMode(mode : 'create'  , type = null  , gr : PIXI.Graphics = null, evt = null){
  //   // if(this.module.localization?.localizing && this.createData?.type == 'localize' && type != 'localize'){
  //   //   return
  //   // }
  //   this.viewport.mode = null
  //   // this.mode = mode    
  //   Object.keys(this.mouseUpListenerObj).forEach(k=> this.mouseUpListenerObj[k]())
  //   if(mode == 'create'){
  //     this.viewport.startCreate(type)
  //   }else if(mode == 'edit'){
  //     this.viewport.startEdit(type , gr ,evt)
  //   }
  // }


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
      
      let imgDimension = await GetImageDimensions(url.toString())
      let width = imgDimension[0]
      let height = imgDimension[1]
      
      this.imageUploaded.emit({
        base64: url.toString(),
        width : width,
        height: height
      })

      

      if (this.uploadMustMatchOriginalSize && (width != (this.mapWidth ? this.mapWidth : this.backgroundSprite.texture.width) || height !=  (this.mapHeight ?  this.mapHeight : this.backgroundSprite.texture.height))) {
        this.uiSrv.showWarningDialog(this.uiSrv.translate("Uploaded image must be of same dimiension and resolution of original image"));
        this.uiSrv.loadAsyncDone(ticket)
        return
      }

      if (this.setupWayPointIcon) {
        this.loadDemoWaypoint(this.testWayPointName, url.toString())
      } else {
        await this.loadToMainContainer(url.toString(), width, height, undefined, undefined, undefined)
        let zoom = Math.min(this.viewport.screenHeight / height, this.viewport.screenWidth / width)
        this.setViewportCamera(width / 2, height / 2, zoom)
      }
      this.uiSrv.loadAsyncDone(ticket)


      event.target.value = null
    }
  }

  loadDemoWaypoint(waypointName: string, iconBase64: string) {
    this.viewport.allPixiWayPoints.forEach(p=> p.parent.removeChild(p));
    let wp = this.getPixiWayPoint(undefined, waypointName, undefined , iconBase64)
    wp.pixiText.visible = true
    wp.readonly = true
    this.mainContainer.addChild(wp)
    this.setViewportCamera(wp.position.x, wp.position.y)
    this.demoWaypointLoaded.emit({iconBase64: iconBase64})
  }

  selectPixiWayPoint(pointCode : string){
    let pixiPt = this.viewport.allPixiWayPoints.filter((g: PixiWayPoint) => g.code == pointCode)[0]
    if( this.viewport && this.viewport.selectedGraphics != pixiPt){
      this.viewport.selectedGraphics = pixiPt
    }
  }

  async loadToMainContainer(url, width = null, height = null , floorPlanName = null, containerId = null , setCamera = false ) {
    url = url.startsWith('data:image') ? url : ('data:image/png;base64,' + url)
    this.dataSrv.setLocalStorage('lastLoadedFloorplanCode' , containerId)
    this.mainContainerId = containerId
    let sprite = await GetSpriteFromUrl(url , this.uiSrv.isTablet)
    this.backgroundSprite.texture = sprite.texture
    this.backgroundSprite.scale.x = sprite.scale.x
    this.backgroundSprite.scale.y = sprite.scale.y
    this.backgroundSprite.zIndex = -1
    this.backgroundSprite['base64'] = url
    this.backgroundImgBase64 = url
    this.mainContainer.zIndex = -1
    if(!this.mainContainer.children.includes(this.backgroundSprite)){
      this.mainContainer.addChild(this.backgroundSprite)
    }
    if(setCamera){
      if(width == null || height == null){
        let imgDimension = await GetImageDimensions(url)
        width = imgDimension[0]
        height = imgDimension[1]
      }
      this.viewport.moveCenter(width/2,height/2)
      let heightRatio = this.containerElRef.nativeElement.offsetHeight/height
      let widthRatio = this.containerElRef.nativeElement.offsetWidth/width
      this.viewport.snapZoom(widthRatio < heightRatio ? { width: width ,time:50} : { height: height ,time:50})
      setTimeout(()=> this.viewport.events.zoomed.emit(true))
    }
    if(this.subscribeTask){
      this.module.task.subscribeTaskStatus()  
    }
  }

  getMapContainer(mapCode : string , robotBase : string){
    return this.util.standaloneApp ? this.viewport.mapContainerStore[mapCode] : Object.values(this.viewport.mapContainerStore).filter((m: PixiMapContainer) => m.robotBase == robotBase && m.mapCode == mapCode)[0]
  }

  refreshPixiWayPointColor(mouseOverPointCode = null) {
    this.viewport.allPixiWayPoints.forEach(g => {
      g.reColor(g.isBeingMouseOvered || g.code == mouseOverPointCode ? DRAWING_STYLE.mouseOverColor : (g.selected ? DRAWING_STYLE.highlightColor : g.style.fillColor)) //selected = false , mouseover = shapeID != null
    })
  }


  public pixiMapLayer(sprite : PIXI.Sprite , width , height ) : PixiEditableMapImage{
    let ret = new PixiEditableMapImage(this.viewport)
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
    // this.clickEvts.forEach(t => ret.on(t, (evt: PIXI.interaction.InteractionEvent) => this.onMouseDownOfGraphics(ret, evt)))
    return ret
  }

  
  public getPixiWayPoint(option = new PixiGraphicStyle(), text = null, type = this.point.type , iconUrl = null , pointType = this.defaultPointType): PixiWayPoint { //Some parts to be moved to PixiArrow
    return new PixiWayPoint(this.viewport, text, option, this.viewport.settings.waypointEditable, iconUrl, pointType)
  }

  async deleteSelectedGraphics(){
    let desc = this.selectedGraphics instanceof PixiWayPoint ? `[${this.selectedGraphics['text']}]` : ''
    if((!(this.selectedGraphics instanceof PixiWayPoint)|| (<PixiWayPoint>this.selectedGraphics).text?.length) && 
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
      this.viewport.removeGraphics(this.selectedGraphics)
    }
    this.selectedGraphics = null
    this.changeDetector.detectChanges()
  }
  
  setMapOrigin(x , y){
    let origin = this.pixiRosMapOriginMarker
    if(!origin){
      this.mainContainer.addChild(new PixiRosMapOriginMarker(this.viewport))
    }
    origin = this.pixiRosMapOriginMarker
    origin.position.set(x , y)       
  }

  async getMainContainerImgBase64() {
    this.viewport.selectedGraphics = null
    let done = new BehaviorSubject(null)
    let container = await this.viewport.getExportImageContainer()
    let image = this._ngPixi.app.renderer.extract.image(container)
    image.onload = (e) => {
      done.next(e.target['src'])
    }
    if(done.value==null){
      await done.pipe(filter(v=>v!=null),take(1)).toPromise()
    }
    return done.value.split(",")[done.value.split(",").length - 1]
  }
  

  //===================================================================================================================================================
  
  // *** v data processing v ***

  async getPixiMap(isContainer, imgSrc: string, orgWidth = null, orgHeight = null, positionX = 0, positionY = 0, scale = 1, rotation = 0) : Promise<PixiMapContainer | PixiEditableMapImage>{
    imgSrc = imgSrc ? (imgSrc.startsWith('data:image') ? imgSrc : ('data:image/png;base64,' + imgSrc)) : null
    let ret : PixiMapContainer | PixiEditableMapImage = isContainer ?  new PixiMapContainer(this.viewport) : new PixiEditableMapImage(this.viewport)
    if( imgSrc && (orgWidth == null || orgHeight == null)){
      let dim = await GetImageDimensions(imgSrc)
      orgWidth = dim[0]
      orgHeight = dim[1]
    }
 

    let sprite = imgSrc ?  await GetSpriteFromUrl(imgSrc , this.uiSrv.isTablet) : new PIXI.Sprite(PIXI.Texture.WHITE);
    sprite.width = imgSrc ? sprite.width : orgWidth
    sprite.height = imgSrc ? sprite.height : orgHeight
    sprite.alpha = isContainer ? 0 : 0.5 
    
    ret.addChild(sprite);
    (<PixiMap>ret).initialWidth = orgWidth ; 
    (<PixiMap>ret).initialHeight = orgHeight ; 
    ret = isContainer ? ret : this.pixiMapLayer(sprite , orgWidth , orgHeight )
    ret.width = orgWidth
    ret.height = orgHeight
    if(!isContainer){
      (<PixiEditableMapImage>ret).removeEditorFrame()
      // this.unhighlightGraphics(<PIXI.Graphics>ret)
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
      mapData.base64Image = await GetResizedBase64(mapData.base64Image, mapData.imageWidth, mapData.imageHeight)
      mapData.resolution = stdRatio
    }
  }


  async loadMap(mapData : JMap) : Promise<PixiEditableMapImage>{
    await this.convertJMapToUniversalResolution(mapData); //20221024
    let ticket = this.uiSrv.loadAsyncBegin()
    let ret : PixiEditableMapImage = (<PixiEditableMapImage>(await this.getPixiMap(false , mapData.base64Image, mapData.imageWidth, mapData.imageHeight, mapData.transformedPositionX, mapData.transformedPositionY, mapData.transformedScale, mapData.transformedAngle)))
    ret.robotBase = mapData.robotBase
    ret.mapCode = mapData.mapCode
    ret.originX = mapData.originX
    ret.originY = mapData.originY
    ret.dataObj = mapData
    this.mainContainer.addChild(ret);
    this.viewport.mapLayerStore[this.util.arcsApp ? mapData.robotBase : ret.mapCode] = ret
  
    ret.zIndex = 1
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }  

  removeMaps(){
    this.mainContainer.children.filter(c => c instanceof PixiEditableMapImage).forEach(c => this.mainContainer.removeChild(c))
    this.viewport.mapLayerStore = {}
    Object.keys(this.viewport.mapLayerStore).forEach(k=>delete this.viewport.mapLayerStore[k])
  }

  async loadDataset(dataset: JFloorPlan, readonly = false, locationOnly = null, showFloorPlanName = true, setCamera = true , refreshToggled = true) {
    let ret = new Subject()
    let ticket
    this.ngZone.runOutsideAngular(async () => {
      ticket = this.uiSrv.loadAsyncBegin()
      this.reset()
      this.robotBasesOptions = dataset.mapList?.map(m=>{return {value : m.robotBase , text : m.robotBase}})
      await this.loadToMainContainer(dataset.base64Image, undefined, undefined, showFloorPlanName ? dataset.name : null , dataset.floorPlanCode)
      this.module.task.dijkstra = getDijkstraGraph(dataset.pathList)
      if (setCamera && dataset.viewX && dataset.viewY && dataset.viewZoom) {
        this.defaultPos = {
          x: dataset.viewX,
          y: dataset.viewY,
          zoom: dataset.viewZoom
        }
        this.setViewportCamera(this.defaultPos.x, this.defaultPos.y, this.defaultPos.zoom)
      }

      if(this.showRobot || this.module.localization?.localizing || this.loadMapContainers){
        for(let i = 0 ; i < dataset.mapList.length ; i++){
          var mapData  = dataset.mapList[i];
          await this.convertJMapToUniversalResolution(mapData); //20221024
          let container: PixiMapContainer = (<PixiMapContainer>await this.getPixiMap(true, mapData.base64Image, mapData.imageWidth, mapData.imageHeight, mapData.transformedPositionX, mapData.transformedPositionY, mapData.transformedScale, mapData.transformedAngle))
          container.originX = mapData.originX
          container.originY = mapData.originY
          this.mainContainer.addChild(container);
          // console.log(container)
          this.viewport.mapContainerStore[`${mapData.mapCode}${this.util.arcsApp ? ('@' + mapData.robotBase) : ''}`] = container
          container.mapCode = mapData.mapCode
          container.robotBase = mapData.robotBase
        }
      }

      ret.next(this.loadGraphics(dataset, readonly, locationOnly))
      if(readonly && locationOnly){
        this.viewport.settings.mapTransformedScale = Math.max.apply(null , dataset.mapList.map(m=>m.transformedScale))
      }
    })
    ret =  await <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
    this.uiSrv.loadAsyncDone(ticket)
    if (this.module.site) {
      this.module.site.locationTree.currentLevel = 'floorplan'
      if (this.showRobot && this.module.site.locationTree?.building?.code) {
        this.commonModule.data.dropdownOptions.floorplans = this.dataSrv.getDropListOptions('floorplans', this.commonModule.data.dropdownData.floorplans, { buildingCode: this.module.site.locationTree.building.code })
      }      
      this.arcsLocationTreeChange.emit( this.module.site.locationTree)
    }
    if(refreshToggled){
      this.module.ui.toggleDarkMode(this.module.ui.toggle.darkMode)
      this.module.ui.toggleRosMap(this.module.ui.toggle.showRosMap)
    }
    return ret
  }

  loadGraphics(dataset : JFloorPlan , readonly = false , locationOnly = null) : PIXI.Graphics[]{ 
    locationOnly = locationOnly!=null ? locationOnly : readonly
    let ret = []
    let addPixiGraphic = (gr : PIXI.Graphics)=>{
      ret.push(gr)
      this.mainContainer.addChild(gr)
    }

    dataset.pointList.forEach((data: JPoint) => {
      let pixiPoint : PixiWayPoint = this.getPixiWayPoint(undefined , data.pointCode , 'waypoint' , this.commonModule.data.getIconBase64(data.userDefinedPointType) , data.userDefinedPointType);
      pixiPoint.robotBases = dataset.mapList.filter(m=>m.pointList.map(p=>p.pointCode).includes(data.pointCode)).map(m=>m.robotBase)
      pixiPoint.waypointName =  data.pointCode; //TBDelete
      pixiPoint.readonly = readonly;
      pixiPoint.orientationAngle = data.guiAngle
      pixiPoint.position.set(data.guiX , data.guiY)
      pixiPoint.dataObj = data
      pixiPoint.pointType = data.pointType
      pixiPoint.enabled = data.enabled
      if(!this.showRobot || pixiPoint.enabled){
        addPixiGraphic(pixiPoint)
      }
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
          let child = new PixiChildPoint(this.viewport , group, group.settings.scale , seq)
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
      if(ret.filter(gr=>gr instanceof PixiPath && (<PixiPath>gr).bidirectional && (<PixiPath>gr).fromShape.code == data.destinationPointCode && (<PixiPath>gr).toShape.code == data.sourcePointCode).length > 0){ // check 2 way second
        return
      }
      let isCurved = data.controlPointList.length > 0
      let tmpType = 'arrow'+ (isBidirectional ? '_bi' : '') + (isCurved ? '_curved': '')
      let pixiFrPoint : PixiWayPoint =  ret.filter(s=>s instanceof PixiWayPoint && s.code == data.sourcePointCode)[0]
      let pixiToPoint : PixiWayPoint =  ret.filter(s=>s instanceof PixiWayPoint && s.code == data.destinationPointCode)[0]
      let tmpVerts = [pixiFrPoint.position, pixiToPoint.position].concat(isCurved ? data.controlPointList.map(p=> new PIXI.Point(p.x , p.y)): [])
      let pixiArrow = new PixiPath(this.viewport , tmpVerts ,tmpType , new PixiGraphicStyle().setProperties({fillColor : ConvertColorToDecimal(this.selectedStyle.arrow.color) , lineColor : ConvertColorToDecimal(this.selectedStyle.arrow.color) , lineThickness : 2}) )
      //let pixiArrow = this.getArrow([tmpVerts[0], tmpVerts[1]], tmpType ); //this.getArrow(vertices[0] , vertices[1] , opt, r.type)
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
        // let getLocalPos = (v)=>pixiArrow.toLocal(this.mainContainer.toGlobal(new PIXI.Point( v.x , v.y)))
        // pixiArrow.setCurveControlPoints(getLocalPos(data.controlPointList[0])  , getLocalPos(data.controlPointList[1]));
        pixiArrow.quadraticCurve = data.controlPointList[0].x == data.controlPointList[1].x &&  data.controlPointList[0].y == data.controlPointList[1].y
      }      
      if(locationOnly){
        pixiArrow.visible = false
      }
    })
    this.module.ui.toggleWaypoint(this.module.ui.toggle.showWaypoint)
    this.module.ui.togglePath()
    return ret
  }

  getDataset(floorPlanCode = null ) : JFloorPlan {
    this.viewport.selectedGraphics = null
    let copyOriginalData = (pixiObj : PixiGraphics, ret)=>{
      if(pixiObj.dataObj){
        Object.keys(pixiObj.dataObj).forEach(k=> ret[k] = pixiObj.dataObj[k])
      }
      return ret
    }

    let hasMap = this.mainContainer.children.filter(c => c instanceof PixiEditableMapImage).length > 0
    let getJPoints = (robotBase : string = null)=> this.viewport.allPixiWayPoints.filter(p=> this.util.standaloneApp || robotBase == null || p.robotBases.includes(robotBase)).map((point: PixiWayPoint) => {
      let pt : JPoint = copyOriginalData(<PixiMapGraphics>point , new JPoint())
      pt.floorPlanCode = floorPlanCode
      pt.guiAngle = point.orientationAngle
      pt.guiX = point.position.x 
      pt.guiY = point.position.y 
      pt.pointCode = point.code
      pt.userDefinedPointType = point.iconType
      pt.pointType = point.pointType
      pt.enabled = point.enabled
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

    let points: JPoint[] = getJPoints()

    let getJPath = (arrow : PixiPath , reverseDirection = false, map : PixiEditableMapImage = null) =>{
      let path = copyOriginalData(<PixiGraphics>arrow , new JPath())
      path.floorPlanCode = floorPlanCode
      path.controlPointList = arrow.isCurved? arrow.getControlPointGlobalPositions(map).map(p => { 
        let convertedPostion = map ? map.calculateRosPosition(p) : p
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
    let getPaths = (map : PixiEditableMapImage = null)=> this.viewport.allPixiPaths.filter(a=>a!=this.viewport.previewGraphics).map(a => getJPath(a, false, map)).concat(this.viewport.allPixiPaths.filter(a => a.bidirectional).map(a => getJPath(a, true , map)))
    
    let maps = this.mainContainer.children.filter(c=> c instanceof PixiEditableMapImage).map((map : PixiEditableMapImage) => {
      let m : JMap = copyOriginalData(<PixiMapGraphics>map , new JMap())
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

      m.pointList = getJPoints(m.robotBase).map(pt=> {
        let p = new JPoint()
        let pos : PIXI.Point = map.toLocal(this.mainContainer.toGlobal(new PIXI.Point(pt.guiX, pt.guiY)))
        p.mapCode = m.mapCode
        p.robotBase = m.robotBase
        p.floorPlanCode = floorPlanCode
        p.pointCode = pt.pointCode
        p.guiAngle = this.util.trimNum(trimAngle(pt.guiAngle - map.angle))
        p.guiX = pos.x , 0
        p.guiY = pos.y , 0
        p.positionX = map.calculateRosPosition(pos).x
        p.positionY = map.calculateRosPosition(pos).y
        p.angle = (90 - p.guiAngle) / radRatio
        return p
      }).filter(p=> p.guiY > 0 && p.guiY  <= map.height / map.scale.y &&  p.guiX  > 0 && p.guiX <= map.width / map.scale.x).concat(
        Array.prototype.concat.apply([] , getJPoints(m.robotBase).filter(pt=>pt.groupMemberPointList.length > 0).map(pt => pt.groupMemberPointList.map(c=> {
          let mapChildPt = new JPoint()
          let pos = map.calculateRosPosition(map.toLocal(new PIXI.Point(c.positionX , c.positionY)))
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
      m.pathList = JSON.parse(JSON.stringify(getPaths(map))).filter((p: JPath) => m.pointList.map(p => p.pointCode).includes(p.sourcePointCode) && m.pointList.map(p => p.pointCode).includes(p.destinationPointCode))
      m.pathList.forEach(p => {
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



  // *** ^ dropdown select location ^ ***
  //===================================================================================================================================================

  //v * * * * * ROBOT RENDERING * * * * * v


  //^ * * * * * ROBOT RENDERING * * * * * ^
  
  //v * * * * * TASK WAYPOINT RENDERING * * * * * v

  getViewportPosition(){
    return{
      defaultZoom: this.util.trimNum(this.viewport.scale.x)!= 0 ?  this.util.trimNum(this.viewport.scale.x) : 1 ,
      defaultX: this.util.trimNum(this.viewport.center.x),
      defaultY: this.util.trimNum(this.viewport.center.y)
    }
  }

  convertToMainContainerPosition(gr : PIXI.Graphics){
    return this.mainContainer.toLocal(gr.parent.toGlobal(gr.position))
  }

  setBuildingRobotCount(buildingCode : string , robotCount : number){
    let polygon = this.viewport.allPixiPolygons.filter((p : PixiBuildingPolygon)=> p.buildingCode == buildingCode)[0]
    polygon.pixiRobotCountTag.robotCount = robotCount
  }

  //^ * * * * * TASK WAYPOINT RENDERING * * * * * ^
}


//#######################################################################################################################################################




//#######################################################################################################################################################


export class Robot {
  viewport : PixiMapViewport
  cm : CommonModule
  // private parent : Map2DViewportComponent
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
  public rosPose  = { position: { x: null, y: null }, angleRad: 0, frame_id: '' , timeStamp : null};
  public pose = { position: { x: null, y: null }, angle: 0, frame_id: '' };
  public pixiGraphics : PixiRobotMarker
  public clicked = new EventEmitter();
  public tapped = new EventEmitter();
  private _enabled = true
  // util: GeneralUtil
  type = "DEFAULT"
  private movingRef
  pose$ : Observable<any>
  public observed = new BehaviorSubject<boolean>(false)
  // private _observed = false
  // public get observed(){
  //   return this._observed
  // }
  // public set observed(v){
  //   this._observed = v  
  //   if (v) {  
  //     this.pixiGraphics.visible = true
  //     this.viewport.ngZone.run(() => {
  //       if (this.uiModule.loadingTicket) {
  //         this.uiModule.uiSrv.loadAsyncDone(this.uiModule.loadingTicket)
  //         this.uiModule.loadingTicket = null
  //       }
  //       this.uiModule.overlay.message = null
  //       if(this.uiModule._popupScreen && !this.parent._remoteControl){
  //         this.parent.removeSpawnMarker()                  
  //         this.parent.module.localization?.pickingMap = false
  //         this.parent.popupScreen = false
  //         this.parent.changeMode(null)
  //         this.parent.toggleRosMap(false)
  //       }
  //     })  
  //   }
  // }

  public get offline() {
    return this._offline
  }
  public set offline(v) {
    this._offline = v
    this.pixiGraphics.toolTip.content = this.id + ` ${this.offline ? this.cm.uiSrv.translate(' (Offline)') : ""}`
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

  get viewPortPosition(){
    return this.viewport.mainContainer.toLocal(this.pixiGraphics.parent.toGlobal(new PIXI.Point(this.pixiGraphics.position.x ,this.pixiGraphics.position.y)))
  }

  constructor(id, mapCode, robotBase , uiModule) {
    this.id = id
    this.cm = uiModule
    this.viewport = this.cm.master.viewport
    this.robotBase = robotBase
    this.observed.pipe(filter(v => v == true)).subscribe((v) => {
      this.pixiGraphics.visible = true
      this.viewport.ngZone.run(() => {
        if (this.cm.ui.loadingTicket) {
          this.cm.uiSrv.loadAsyncDone(this.cm.ui.loadingTicket)
          this.cm.ui.loadingTicket = null
        }
        this.cm.ui.overlayMessage = null
        // if (this.uiModule._popupScreen && !this.parent._remoteControl) {
        //   this.parent.removeSpawnMarker()
        //   this.parent.module.localization?.pickingMap = false
        //   this.parent.popupScreen = false
        //   this.parent.changeMode(null)
        //   this.parent.toggleRosMap(false)
        // }
      })
    })
    // this.util = generalUtils;
    // this.parent = masterComp;
    //this.pixiGraphics = new PixiGraphics(this.parent._ngPixi.viewport)
    this.mapCode = mapCode
    this.pixiGraphics =  new PixiRobotMarker( this.viewport, ConvertColorToDecimal(DRAWING_STYLE.mouseOverColor) , 0 , 0 , 0)
    this.pixiGraphics.zIndex = 1000
    this.pixiGraphics.toolTip.content = this.id
    this.pixiGraphics.toolTip.enabled = true
    // this.pixiGraphics.on("mouseover", (evt: PIXI.interaction.InteractionEvent) => this.pixiGraphics.showToolTip(this.id + ` ${this.offline ? this.parent.uiSrv.translate(' (Offline)') : ""}` ,evt))
    // this.pixiGraphics.on("mouseout", () => this.pixiGraphics.toolTip.hide())
    this.refreshStatus();


    this.pixiGraphics.interactive = this.viewport.APP_BUILD == 'ARCS';
    this.pixiGraphics.events.click.pipe(takeUntil(this.pixiGraphics.events.destroyed)).subscribe((evt)=>this.clicked.emit(evt))
    // ["click" , "tap"].forEach(trigger=>{
    //   this.pixiGraphics.on(trigger, (evt) => {
    //     this.clicked.emit(evt)
    //   });
    // })
    this.pixiGraphics.visible = false
  }

  // public setIconScale(scale = new PixiMapGraphics(this.pixiGraphics.viewport).robotIconScale){
  //   (<PIXI.Graphics>this.pixiGraphics.icon).scale.set(scale);
  //   (<PixiMapGraphics>this.pixiGraphics.pixiAlertBadge.icon).scale.set(scale * 1.2)
  // }


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


  enforcePose(){
    this.pixiGraphics.x =  this.pose.position.x;
    this.pixiGraphics.y = this.pose.position.y;
    this.pixiGraphics.icon.angle =  this.pose.angle;
    this.pixiGraphics.visible = true
  }

  public refreshPose(rosX, rosY, angle =  this.pose.angle, endInMs = null, mapCode = null , robotBase = null, noTransition = false , hasOriginMarker = false , timeStamp = null) {
    if( timeStamp!=null && this.rosPose?.timeStamp == timeStamp){
      return
    }
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
    this.rosPose.timeStamp = timeStamp
    var origins = [undefined , undefined]
    if(hasOriginMarker){
      let originMarker = this.viewport.mainContainer.children.filter(c => c instanceof PixiRosMapOriginMarker).map(c => <PixiRosMapOriginMarker>c)?.[0]
      origins = [originMarker.position.x , originMarker.position.y ] 
    }else if(mapCode){
      let container : PixiMapContainer =  this.cm.master.getMapContainer(mapCode , robotBase)
      if(!container){
        console.log(`ERROR : Map not found : [${mapCode}] (ROBOT BASE [${robotBase}])`)
        return 
      }
      origins = container.guiOrigin
    }else{
      origins = calculateMapOrigin(0,0, VIRTUAL_MAP_ROS_HEIGHT , this.cm.util.config.METER_TO_PIXEL_RATIO)
    }

    this.pose.position.x = calculateMapX(rosX , origins[0] ,  this.cm.util.config.METER_TO_PIXEL_RATIO)
    this.pose.position.y = calculateMapY(rosY , origins[1] , this.cm.util.config.METER_TO_PIXEL_RATIO)
    this.pose.angle = angle
    if( noTransition || !this.cm.util.config.MOVE_USING_TRANSITION || orgX == null || orgY == null ||  this.cm.master.lastActiveMapId_SA != mapCode){
      this.cm.master.lastActiveMapId_SA = mapCode ? mapCode : this.cm.master.lastActiveMapId_SA
      this.enforcePose()
      if(this.cm.master.cameraTraceEnabled){
        this.cm.master.relocateCamera()
      }
      // if(orgX == null || orgY == null){
      //   this.parent.refreshRobotScale()
      // }
      return
    }
    this.cm.master.lastActiveMapId_SA = mapCode ? mapCode : this.cm.master.lastActiveMapId_SA

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
            if(this.cm.master.cameraTraceEnabled){
              this.cm.master.relocateCamera()
            }
            move--;
          } else {
            clearInterval(this.movingRef);
            this.movingRef = null;
          }
        }, frameIntervalMs );
      }
    }
  }
}

//TBD : HTML template variable

export class SiteModule { //ARCS Function
  get viewport (){
    return this.master.viewport
  }
  cm: CommonModule
  get master() {
    return this.cm.master
  }

  locationTree: { site: { code: string, name: string }, building: { code: string, name: string }, currentLevel: 'floorplan' | 'site', selected: { building: string, floorplan: string, } } = 
  {
    site: {
      code: null,
      name: null
    },
    building: {
      code: null,
      name: null
    },
    currentLevel: 'floorplan',
    selected: {
      building: null,
      floorplan: null,
    }
  }

  constructor(cm: CommonModule) {
    this.cm = cm
  }

}

export class RobotModule {
  robots: Robot[] = []
  robotType
  get viewport (){
    return this.master.viewport
  }
  // events = {
  //   robotClicked: new EventEmitter()
  // }
  cm: CommonModule

  get master() {
    return this.cm.master
  }

  get app() {
    return this.cm.master.viewport.APP_BUILD
  }

  loadingMap = null
  // _activeMapCode = null
  // get activeMapCode() {
  //   return this._activeMapCode
  // }


  constructor(cm: CommonModule) {
    this.cm = cm
  }

  public addRobot(id, mapCode = null, robotBase = null) { //consider to add 'type' argument for ARCS
    let ret = new Robot(id, mapCode, robotBase, this.cm);
    if (mapCode == null) {
      // console.log(ret.pixiGraphics)
      this.viewport.mainContainer.addChild(ret.pixiGraphics);
    } else {
      // this._activeMapCode = mapCode
      let container = this.cm.util.standaloneApp ? this.viewport.mapContainerStore[mapCode] : Object.values(this.viewport.mapContainerStore).filter((m: PixiMapContainer) => m.robotBase == robotBase && m.mapCode == mapCode)[0]
      if (!container) {
        console.log(`map not yet added to the viewport (map code : ${mapCode} , robot code : ${id})`)
      } else {
        container.addChild(ret.pixiGraphics);
        container.sortableChildren = true
      }
    }
    this.robots.push(ret)
    ret.pixiGraphics.events.click.pipe(takeUntil(ret.pixiGraphics.events.destroyed)).subscribe((evt) => {
      this.viewport.ngZone.run(() => this.master.robotClicked.emit({ id: id, event: evt , robot : ret}))
    })
    ret.pixiGraphics.buttonMode = true
    ret.pixiGraphics.autoScaleEnabled = true
    // if(this.cm.util.standaloneApp){
    //   ret.pixiGraphics.autoScaleModule.counterScaleBinding = ()=>1
    // }
    return ret;
  }

  public removeRobot(robot: Robot) {
    this.robots = this.robots.filter(r => r.id != robot.id);
    this.viewport.removeGraphics(robot.pixiGraphics)
  }
}

export class ARCSRobotModule extends RobotModule {
  robotColors = []
  mqSubscribedMapCodes = []
  poseSubscription 
  constructor( cm: CommonModule) {
    super(cm)
  }


  public refreshRobotColors(){
    Object.keys(this.robotColors).forEach(robotCode=>{
      if(this.robotColors[robotCode]){
        let robotMarker : PixiRobotMarker =  this.robots.filter(r=>r.id == robotCode)[0]?.pixiGraphics
        if(robotMarker){
          robotMarker.color = this.robotColors[robotCode] 
        }
      }
    })
  }

  
  async unsubscribePose(){
    this.poseSubscription?.unsubscribe()
    if(this.mqSubscribedMapCodes.length > 0){
      this.mqSubscribedMapCodes.forEach(m => this.cm.mqSrv.unsubscribeMQTT('arcsPoses', false,`${m}`))
      this.mqSubscribedMapCodes = []
    }
  }

  async subscribeRobotPose(mapCodes) { 
    // TBD : mapContainerStore key change from mapCode to robotBase
    this.unsubscribePose()
    this.mqSubscribedMapCodes = mapCodes
    mapCodes.forEach(m=>{
      this.cm.mqSrv.subscribeMQTT('arcsPoses',`${m}`)
    })
    this.poseSubscription = this.cm.mqSrv.data.arcsPoses.pipe(filter(v => v)).subscribe(async (poseObj) => { //{mapCode : robotId : pose}
      Object.keys(poseObj).forEach(mapCode => {
        let robotsAdded = []
   
        let getPose = (robotId) => { return poseObj[mapCode][robotId] }
        let refreshPose = (r: Robot) => r.refreshPose(getPose(r.id).x, getPose(r.id).y, getPose(r.id).angle, getPose(r.id).interval, mapCode, r.robotBase, undefined, undefined, getPose(r.id).timeStamp)
        //all related map containers MUST be added already before calling this function/all related map containers MUST be added already before calling this function
        //let container = this.viewport.mapContainerStore[mapCode] //  + robotBase //
        let robotCodes = Object.keys(poseObj[mapCode])

        let robotCodesToAdd = robotCodes.filter(c => !this.robots.map(r => r.id).includes(c) || (this.robots.filter(r => r.id == c)[0].mapCode != mapCode))
        let robotsToUpdate = this.robots.filter(r => robotCodes.includes(r.id) && r.pixiGraphics.parent == this.master.getMapContainer(mapCode, r.robotBase))
        let robotsToRemove = this.robots.filter(r => r.mapCode == mapCode && !robotCodes.includes(r.id))

        robotsToRemove.forEach(r => this.removeRobot(r))
        robotCodesToAdd.forEach(code => {
          let robotProfile = (<DropListRobot[]>this.cm.data.dropdownData.robots).filter(r2 => r2.robotCode == code)[0]
          if (this.robotType && robotProfile.robotType.toUpperCase() != this.robotType.toUpperCase()) {
            return
          }
          let r = this.addRobot(code, mapCode, robotProfile?.robotBase)
          r.observed.next(true)
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

}

export class StandaloneRobotModule extends RobotModule {
  constructor( cm: CommonModule) {
    super(cm)
  }

  async subscribeRobotPose() {
    this.cm.mqSrv.unsubscribeMQTT('pose')
    this.cm.mqSrv.subscribeMQTT('pose')
    this.cm.mqSrv.unsubscribeMQTT('poseDeviation')
    this.cm.mqSrv.subscribeMQTT('poseDeviation')

    this.cm.robotSrv.data.pose.pipe(takeUntil(this.master.onDestroy)).subscribe(async (pose) => {
      if (this.master.module.localization?.localizing) {
        return
      }
      pose = this.cm.robotSrv.data.pose.value
      let robot = this.robots[0]
      if (pose && !this.master.module.localization?.previewData.alignLidar && !this.cm.robotSrv.data.isFollowMeWithoutMap.value && !['', null, undefined].includes(pose?.mapName)) {
        //--- mapName return mapCode but we need mapId here ---
        robot.mapCode = pose?.mapName
        // if(this.cm.data.selectedMapCode!=pose?.mapName){
        //   this.cm.data.selectedFloorPlanCode = this.fl
        // }
        //-----------------------------------------------------
        if (robot.mapCode != null) {
          if (!this.viewport.mapContainerStore[robot.mapCode] || this.cm.data.activeMapCode != robot.mapCode) {
            if (this.loadingMap != null) {
              await this.loadingMap.pipe(filter(v => v == false), take(1)).toPromise()
            } else {
              if (!await this.onRobotMapChanged( robot.mapCode)) {
                return
              }
            }
          }
          if (robot.pixiGraphics.parent && robot.pixiGraphics.parent != this.viewport.mapContainerStore[robot.mapCode]) { //&& this.mapId == pose?.mapName
            robot.pixiGraphics.parent.removeChild(robot.pixiGraphics)
            console.log(robot.mapCode)
            console.log(  this.viewport.mapContainerStore)
            this.viewport.mapContainerStore[robot.mapCode].addChild(robot.pixiGraphics)
            robot.observed.next(true)
          }
        }
        robot.refreshPose(pose.x, pose.y, pose.angle, pose.interval, robot.mapCode)
      } else if (this.master._remoteControl && pose) {
        robot.observed.next(true)
        robot.refreshPose(pose.x, pose.y, pose.angle, pose.interval, robot.mapCode)
      }
    })

    this.master.onDestroy.subscribe(() => {
      this.cm.mqSrv.unsubscribeMQTT('poseDeviation')
      this.cm.mqSrv.unsubscribeMQTT('pose')
    })
  }

  async onRobotMapChanged(mapCode) {
    this.loadingMap = new Subject()
    var fpCode = (<DropListMap>(await this.cm.dataSrv.getDropList('maps')).data.filter((m: DropListMap) => m.mapCode ==  mapCode)[0])?.floorPlanCode
    if (this.cm.data.activeFloorPlanCode != fpCode) {
      await this.cm.data.loadFloorPlan(fpCode)
    }
    // this.cm.data.selectedFloorPlanCode = fpCode      
    // this.cm.data.activeFloorPlanCode = fpCode
    if (!fpCode) {
      var msg = "UNKNOWN MAP CODE OR NO LINKED FLOOR PLAN FROM MQTT POSE : " + mapCode
      this.cm.uiSrv.showNotificationBar(msg, 'error')
      console.log(msg)
      this.loadingMap.next(false)
      this.loadingMap = null
      return false
    }

    this.loadingMap.next(false)
    this.loadingMap = null
    // this.master.refreshLocationOptions()
    if (this.master.module.lidarPointCloud.show) {
      await this.master.module.lidarPointCloud.unsubscribeLiveLidar()
      await this.master.module.lidarPointCloud.subscribeLiveLidar()
    }
    return true
    //pending : make lidar request and ask user for localization
  }

  async unsubscribePose(){

  }

}

export class NavigationModule { //Standalone Function : navigate to waypoint / custom position
  get viewport (){
    return this.master.viewport
  }
  cm : CommonModule
  get master (){
    return this.cm.master
  }

  _enable = false
  set enable (v){
    this._enable = v
    if(v){
      this.viewport.mode = 'create'
      this.viewport.preventContextMenu = true
      this.listenMouseEvent()
    }else{
      this.viewport.mode = null
      this.viewport.preventContextMenu = false
      this.resetTarget()
    }
    // module.navigation.enable?  changeMode('create','navigate') : viewport.mode = null ;
    // module.navigation.enable? null : module.navigation.resetTarget()"
  }
  get enable(){
    return this._enable
  }
  target = {
    x : null,
    y : null,
    rosX : null,
    rosY : null,
    angle : 0
  }
  // mapId = null
  pixiGraphics = null
  // angle = 0

  constructor(cm : CommonModule){
    this.cm = cm
  }

  async confirm() {
    let ticket = this.cm.uiSrv.loadAsyncBegin()
    let resp
    if(this.enable){
      resp = await this.cm.httpSrv.fmsRequest('POST', 'navigation/v1/pose', {
         x : this.target.rosX,
         y : this.target.rosY,
         angle :  trimAngle( 90 - this.target.angle ) / radRatio
      })  
    }else{
      await this.cm.httpSrv.fmsRequest('POST', 'mode/v1/navigation')
      resp = await this.cm.httpSrv.fmsRequest('POST', 'navigation/v1', {
        waypointName:  this.cm.data.selectedPointCode,
        navigationMode: "AUTONOMY",
        orientationIgnored: false,
        fineTuneIgnored: true
      })      
    }
    if (resp.status == 200 && resp.body && JSON.parse(resp.body)?.status == 'SUCCEEDED') {
      this.cm.uiSrv.showNotificationBar(this.cm.uiSrv.translate("Navigation Successs") + " - " + this.cm.data.selectedPointCode , 'success')
    } else {
      let msg = resp.body && resp.body != '' && this.cm.uiSrv.translate(JSON.parse(resp.body)?.text) ? JSON.parse(resp.body)?.text : this.cm.data.selectedPointCode ; 
      this.cm.uiSrv.showNotificationBar(this.cm.uiSrv.translate("Navigation Failed") + '- ' + msg, 'error')
    }      
    this.cm.uiSrv.loadAsyncDone(ticket)
  }

  setTargetPos(x , y){
    this.master.ngZone.run(()=>{
      this.target.x = x
      this.target.y = y
      this.target.rosX = this.viewport.mapContainerStore[this.cm.data.activeMapCode].calculateRosX(x)
      this.target.rosY = this.viewport.mapContainerStore[this.cm.data.activeMapCode].calculateRosY(y)
      this.refreshTargetPos()
    })
  }

  refreshTargetByRos() {
    let mapContainer = this.viewport.mapContainerStore[this.cm.data.activeMapCode];
    this.target.x = mapContainer.calculateMapX(this.target.rosX)
    this.target.y = mapContainer.calculateMapY(this.target.rosY)
    this.pixiGraphics.position.set(this.target.x, this.target.y)
    this.pixiGraphics.angle = this.target.angle
  }


  resetTarget(){
    if(this.pixiGraphics && this.pixiGraphics.parent){
      this.pixiGraphics.parent.removeChild( this.pixiGraphics)
      this.pixiGraphics = null
    }
    Object.keys(this.target).forEach(k=> this.target[k] = null)
    this.target.angle = 0
    // this.enable = false
  }

  refreshTargetPos(){
    if(!this.pixiGraphics){
      let flagMarker = this.getTargetMarker()
      this.viewport.mapContainerStore[this.cm.data.activeMapCode].addChild(flagMarker)
      this.pixiGraphics = flagMarker      
    }
    this.pixiGraphics.visible = true
    this.pixiGraphics.position.set(this.target.x, this.target.y)
  }

  getTargetMarker(){
    let svgUrl = 'assets/icons/arrow-up-circle.svg'
    try {
      let pivot = [15 , 15]
      let ret = new PixiMapGraphics(this.viewport)
      let icon = new PIXI.Sprite(PIXI.Texture.from(svgUrl))      
      icon.filters = [<any>new ColorReplaceFilter(0x000000,  DRAWING_STYLE.highlightColor, 1)]
      icon.pivot.set(pivot[0] , pivot[1])
      ret.addChild(icon)
      ret.pivot.set(pivot[0] , pivot[1])
      icon.scale.set(0.25)
      ret.autoScaleEnabled = true
      return ret
    } catch (err) {
      console.log('An Error has occurred when loading ' + svgUrl)
      console.log(err)
      throw err
    }
  }

  listenMouseEvent(){
    this.viewport.mainContainer.events.click.pipe(takeUntil(this.viewport.onModeChange)).subscribe((evt)=>{
      let mapContainer: PIXI.Container = this.viewport.mapContainerStore[this.cm.data.activeMapCode]
      if(mapContainer){
        let pos = evt.data.getLocalPosition(mapContainer)
        this.setTargetPos(pos.x , pos.y)
      }   
    })
  }
}

export class LocalizationModule { //Standalone Function : change map / localize
  get viewport (){
    return this.master.viewport
  }
  cm : CommonModule
  previewData = {
    lidarLayer: null,
    lidarPosition: null,
    alignLidar: false,
    markerGraphic: null,
    mapX: null,
    mapY: null,
    rosX: null,
    rosY: null,
    footprint: [],
    rotation: 0, //Ros rad * 57
  }
  private _localizing = false
  get master(){
    return this.cm.master
  }

  set localizing(v){
    this._localizing = v
    if(!v &&  !this.cm.data.activeFloorPlanCode){ //this.showRobot &&
      this.cm.ui.popupScreen = false
      this.viewport.mode = null
      Object.values(this.viewport.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = true)
      this.cm.ui.overlayMessage = this.cm.uiSrv.translate("Select Starting Position")
      this.cm.data.selectedFloorPlanCode = null
      // this.refreshPixiLocColor()
      // this.changeMode(null)
    }
    // this._pickSpawnPoint = b
  }
  get localizing(){
    return this._localizing
  }
  locating = false

  constructor(uiModule : CommonModule){
    this.cm = uiModule
  }

  private iniPixiMarker() {
    if (!this.previewData.markerGraphic) {
      this.previewData.markerGraphic = new PixiRobotMarker(this.viewport, DRAWING_STYLE.highlightColor, 0, 0, this.previewData.rotation)
      this.previewData.markerGraphic.interactive = false
      this.previewData.markerGraphic['interval'] = setInterval(() => {
        this.previewData.markerGraphic.alpha = this.previewData.markerGraphic.alpha == 1 ? 0.4 : 1
      }, 1000)
      // setTimeout(() => this.refreshRobotScale())
      this.viewport.mapContainerStore[this.cm.data.selectedMapCode].addChild(this.previewData.markerGraphic)
    }
  }

  async changeMap(){
    let ticket = this.cm.uiSrv.loadAsyncBegin()
    if (this.cm.robotSrv.data.isFollowMeMode?.value != true) {
      await this.cm.httpSrv.fmsRequest('POST', 'mode/v1/navigation')
    }
    await this.cm.httpSrv.fmsRequest('POST', 'map/v1/change', { mapName: this.cm.data.selectedMapCode, useInitialPose: false, waypointName: null })
    // Object.values(this.viewport.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = false)
    this.cm.uiSrv.showNotificationBar("Map changed successfully" , 'success')
    this.previewData.rosX = 0
    this.previewData.rosY = 0
    this.previewData.rotation =  0

    await this.master.loadDataset( await this.cm.master.mapSrv.getFloorPlan(this.cm.data.selectedFloorPlanCode), true , true)
    // this.cm.data.selectedMap = ds.mapList[0]?.mapCode
    // this.master.changeMode('create','localize')
    this.cm.uiSrv.loadAsyncDone(ticket)
    this.endLocalize()
    // Object.values(this.viewport.mapContainerStore).filter(v => v).forEach(v => (<any>v).visible = false)
    this.startLocalize()
  }


  async startLocalize(){
    // this.master.changeMode('create','localize')
    let ticket = this.cm.uiSrv.loadAsyncBegin()
    this.viewport.mode = 'create'
    this.viewport.preventContextMenu = true
    this.iniPixiMarker()
    this.previewData.markerGraphic.parent.visible = true
    this.previewData.alignLidar = true
    this.previewData.mapX = this.previewData.markerGraphic?.position.x
    this.previewData.mapY = this.previewData.markerGraphic?.position.y
    let lidarResp = await this.cm.httpSrv.fmsRequest('GET' , 'lidar/v1',undefined,false)

    this.cm.uiSrv.loadAsyncDone(ticket)
    let mapContainer : PixiMapContainer =  <PixiMapContainer>this.viewport.mapContainerStore[this.cm.data.selectedMapCode] //testing
    this.setPosByRos();
    this.previewData.lidarPosition = new PIXI.Point( this.previewData.mapX  ,  this.previewData.mapY)
    mapContainer.ROS.alpha = 0.8
    this.previewData.lidarLayer = new PIXI.Graphics();
    mapContainer.addChild(this.previewData.lidarLayer)
    let pivotLayer = new PIXI.Graphics();
    this.previewData.lidarLayer.addChild(pivotLayer)
    pivotLayer.beginFill(0xFFFFFF, 0).drawRect(0,0, mapContainer.initialWidth, mapContainer.initialHeight).endFill()
    let pointsLayer = new PIXI.Graphics();
    pivotLayer.pivot.set(this.previewData.mapX  , this.previewData.mapY)
    pivotLayer.position.set( this.previewData.mapX  , this.previewData.mapY)
    pivotLayer.angle = 90 - this.previewData.rotation
    pivotLayer.addChild(pointsLayer)
    pointsLayer.pivot.set(pivotLayer.pivot.x , pivotLayer.pivot.y)
    pointsLayer.position.set(pivotLayer.pivot.x , pivotLayer.pivot.y)
    pointsLayer.angle = this.previewData.rotation - 90
    lidarResp.pointList.forEach((p : {x : number , y : number}) => {
      pointsLayer.beginFill(0xFF0000).drawCircle( mapContainer.calculateMapX(p.x ), mapContainer.calculateMapY(p.y) , 1.5).endFill()
    });
    this.previewData.lidarLayer['getPivotLayer'] = ()=> pivotLayer
    this.listenMouseEvent()
  }

  async listenMouseEvent(){
    this.viewport.events.click.pipe(takeUntil(this.viewport.onModeChange)).subscribe((evt)=>{
      const map : PixiMap = this.viewport.mapContainerStore[this.cm.data.selectedMapCode]
      let pos = evt.data.getLocalPosition(this.viewport.mapContainerStore[this.cm.data.selectedMapCode])
      this.iniPixiMarker();
      (<PIXI.Graphics>this.previewData.markerGraphic).position.set(pos.x , pos.y)
      if(this.previewData.alignLidar && this.previewData.mapX && this.previewData.mapY){
        this.previewData.footprint.push({x: this.previewData.mapX , y: this.previewData.mapY , angle : this.previewData.rotation})
      }   
      this.previewData.mapX = pos.x
      this.previewData.mapY = pos.y
      this.previewData.rosX = map.calculateRosX(this.previewData.mapX )
      this.previewData.rosY = map.calculateRosY(this.previewData.mapY)
      this.refreshLidarLayerPos()
      // this.master.ngZone.run(()=>{
      //   this.selectedLocation = null
      // })   
      this.refreshPos()
    })
  }

  async confirmLocalize() {
    this.cm.ui.loadingTicket = this.cm.uiSrv.loadAsyncBegin()
    // if(this.previewData.markerGraphic){
    await this.cm.httpSrv.fmsRequest('PUT', 'localization/v1/initialPose',
      {
        x: this.viewport.mapContainerStore[this.cm.data.selectedMapCode].calculateRosX(this.previewData.mapX),
        y: this.viewport.mapContainerStore[this.cm.data.selectedMapCode].calculateRosY(this.previewData.mapY),
        angle: this.cm.util.trimNum((this.previewData.rotation) / radRatio)
      }, undefined, this.cm.uiSrv.translate('Localize')
    )
    // }
    // else{
    //   await this.cm.httpSrv.fmsRequest('PUT' , 'localization/v1/' + ((<DropListLocation[]> this.cm.data.dropdownData.locations).filter(l=>l.pointCode == this.cm.data.selectedPoint)[0]).pointCode,undefined,undefined, this.cm.uiSrv.translate('Localize'))    
    // }
    this.endLocalize()
    this.cm.uiSrv.loadAsyncDone(this.cm.ui.loadingTicket)
    this.localizing = false
  }

  endLocalize(){
    this.viewport.preventContextMenu = false
    this.viewport.mode = null;
    this.cm.ui.toggleRosMap(this.cm.ui.toggle.showRosMap)
    if(this.previewData.markerGraphic){
      this.previewData.markerGraphic?.parent?.removeChild(this.previewData.markerGraphic)
      clearInterval(this.previewData.markerGraphic['interval'])
      this.previewData.markerGraphic = null
    }
    this.previewData.alignLidar = false
    if(this.previewData.lidarLayer){
      this.previewData.lidarLayer.parent.removeChild( this.previewData.lidarLayer)
      this.previewData.lidarLayer = null
    }
  }

  undoPos(){
    let pos = this.previewData.footprint.pop()
    this.previewData.mapX = pos.x
    this.previewData.mapY = pos.y
    this.previewData.rotation = pos.angle
    this.previewData.markerGraphic.position.set(pos.x , pos.y)
    this.refreshLidarLayerPos()
  }
  
  refreshLidarLayerPos(){
    if(this.previewData.alignLidar && this.previewData.lidarLayer){
      this.previewData.lidarLayer.position.set(this.previewData.mapX - this.previewData.lidarPosition.x , this.previewData.mapY - this.previewData.lidarPosition.y)
      this.previewData.lidarLayer['getPivotLayer']().angle = 90 - this.previewData.rotation 
      this.refreshPos(true, false)
    }
  }
  
  setPositionByJoystick(evt){
    let scale = 0.000025 * Math.min( 2 , (1 + evt.holdCount)/2)
    this.adjustPos( evt.x * scale * this.viewport.mapContainerStore[this.cm.data.selectedMapCode].width  , 
                                    evt.y  * scale * this.viewport.mapContainerStore[this.cm.data.selectedMapCode].height 
                                  )
    this.setPosByRos(); 
    this.refreshLidarLayerPos();
  }

  adjustPos(dX , dY){
    let adjustAngle = this.viewport.mapContainerStore[this.cm.data.selectedMapCode].angle
    this.previewData.mapX += dX * Math.cos(adjustAngle / radRatio) - dY * Math.sin(adjustAngle / radRatio)
    this.previewData.mapY += - dY * Math.cos(adjustAngle / radRatio) - dX * Math.sin(adjustAngle / radRatio)
    this.refreshPos()
  }

  refreshPos(refreshRosValue = true , resetSelectedWaypoint = true ) {
    if(resetSelectedWaypoint){
      this.master.ngZone.run(()=>{
        this.master.commonModule.data.selectedPointCode = null   
      })
    }
    if (this.previewData.markerGraphic) {
      this.previewData.markerGraphic.position.set(this.previewData.mapX, this.previewData.mapY)
      this.previewData.markerGraphic.icon.angle = 90 - this.previewData.rotation  //RV default align origin robot direction align with x-axis
      if (refreshRosValue) {
        this.previewData.rosX = this.viewport.mapContainerStore[this.cm.data.selectedMapCode].calculateRosX(this.previewData.mapX)
        this.previewData.rosY = this.viewport.mapContainerStore[this.cm.data.selectedMapCode].calculateRosY(this.previewData.mapY)
      }
    }
  }

  setPosByRos(){
    let mapContainer : PixiMapContainer =  this.viewport.mapContainerStore[this.cm.data.selectedMapCode];
    this.previewData.mapX = mapContainer.calculateMapX(this.previewData.rosX )
    this.previewData.mapY = mapContainer.calculateMapY(this.previewData.rosY )
    this.refreshPos(false)
  }

  setPosByWaypoint(){
    let waypoint = this.viewport.allPixiWayPoints.filter(p=>p.waypointName == this.cm.data.selectedPointCode)[0]
    if(waypoint){
      this.master.ngZone.run(()=>{
        let pos = this.viewport.mapContainerStore[this.cm.data.selectedMapCode].toLocal(waypoint.parent.toGlobal( waypoint.position))
        this.previewData.mapX = pos.x
        this.previewData.mapY = pos.y
        this.previewData.rotation = 90 - waypoint.dataObj.guiAngle
        this.refreshPos(true , false)
      })
    }
  }
}

export class TaskModule{
  taskShowing
  dijkstra : { paths : JPath [],graph : any} = {
    paths : [],
    graph : null
  }

  get viewport (){
    return this.master.viewport
  }
  cm : CommonModule
  
  get master (){
    return this.cm.master
  }
  constructor(cm : CommonModule){
    this.cm = cm
  }

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
  
  drawTaskPaths(paths : { floorPlanCode ? : string , pointCode: string , navigationMode : string}[] , floorPlanCode = null){
    let pointCodes = paths.map(path => path.pointCode)
    this.viewport.allPixiWayPoints.forEach((p:PixiWayPoint) => p.setTaskItemSeq(''))

    this.viewport.allPixiTaskPaths.forEach(p => {
      delete p.taskItemIndex
      this.viewport.mainContainer.removeChild(p)
    })

    for (let i = 0; i < Math.max(1, paths.length - 1); i++) {
      let pathFollowing = paths[i + 1] && paths[i + 1].navigationMode == 'PATH_FOLLOWING'
      //use call back function to get option to make sure that 2 graphics object wont sharing/pointing to the same option
      // let getLineThickness = (bold = false) => this.pixiElRef.lineWidth * (bold ? 2 : 1) / (this.pixiObjs.arrowContainer.scale.x * this.pixiElRef._ngPixi.viewport.scale.x)
      let lineStyle =  new PixiGraphicStyle().setProperties(
        {
          fillColor :  DRAWING_STYLE.secondaryHighlightColor,
          zIndex : -1,
          opacity : pathFollowing ? 0.8 : 0.5,
          lineColor :  DRAWING_STYLE.secondaryHighlightColor ,
          lineThickness : 2
        }
      )
      let pointCode = pointCodes[i]
      let frPt: PixiWayPoint = this.viewport.allPixiWayPoints.filter(s => (floorPlanCode == null || floorPlanCode == paths[i].floorPlanCode) && s.code == pointCode)[0]
      let toPt: PixiWayPoint = this.viewport.allPixiWayPoints.filter(s => (floorPlanCode == null || floorPlanCode == paths[i].floorPlanCode) &&  s.code == pointCodes[i + 1] && pointCodes[i + 1] != undefined)[0]
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
        let getGlobalPosition = (s) => this.viewport.mainContainer.toLocal(s.parent.toGlobal(s.position))    
        if (pathFollowing && this.pathReachableV2(pointCodes[i + 1] , pointCode)) {
          let paths = this.dijkstra.graph.shortest(frPt.code, toPt.code).path()
          for (let j = 0; j < paths.length - 1; j++) {
            // line = new PixiTaskPath()
            let line
            let frCodej = paths[j]
            let toCodej = paths[j + 1]
            let p1j = this.viewport.allPixiWayPoints.filter(s => s.code == frCodej)[0]
            let p2j = this.viewport.allPixiWayPoints.filter(s => s.code == toCodej)[0]
            let pathData = this.dijkstra.paths.filter(p=>p.sourcePointCode == p1j.code && p.destinationPointCode == p2j.code )[0]
            let controlPoints = pathData.controlPointList.map(d=> new PIXI.Point(d.x , d.y))
            let isCurved = controlPoints.length > 0
            if (isCurved) {
              let getLine = (style : PixiGraphicStyle)=> new PixiCurve(this.viewport , [getGlobalPosition(p1j), getGlobalPosition(p2j), controlPoints[0], controlPoints[1]], style);
             // let getLine = (opt) => tmpPIXI.getCurve(getGlobalPosition(p1j), getGlobalPosition(p2j), pathData.controlPointList[0], pathData.controlPointList[1], opt, this , true);
              line = (<PixiTaskPath> getLine(lineStyle))
            } else {
              line = new PixiLine(this.viewport , [getGlobalPosition(p1j), getGlobalPosition(p2j)] , lineStyle);
              // (<PixiTaskPath> tmpPIXI.getLine(getGlobalPosition(p1j), getGlobalPosition(p2j), lineStyle(line), this, true))     
            }
            line.targetCodes = line.targetCodes ? line.targetCodes.concat([toPt.code]) : [toPt.code]
            this.viewport.mainContainer.addChild(line)
            line.taskItemIndex = i
          }
        } else {
          // let tmpOpt = lineStyle(line)
          // tmpOpt.opacity = 0.5
          // tmpOpt.lineThickness = 4;
          // (<PixiTaskPath> tmpPIXI.getDashedLine(getGlobalPosition(frPt), getGlobalPosition(toPt), lineStyle(line),undefined,undefined,this))
          //  Object.assign(new PixiTaskPath() , line)
          // this.mainContainer.addChild(line)
          // line.taskItemIndex = i
        }

        toPt.on('mouseover', ()=>{ //recolor lines to highlight the path
          this.viewport.allPixiTaskPaths.filter(p=>p.taskItemIndex == toPt.taskItemIndex- 1).forEach(p=>{
            p.tint = DRAWING_STYLE.mouseOverColor
            p.zIndex = 10
          })
        })
        toPt.on('mouseout', ()=>{
          this.viewport.allPixiTaskPaths.filter(p=>p.taskItemIndex == toPt.taskItemIndex - 1).forEach(p=>{
            p.tint = DRAWING_STYLE.secondaryHighlightColor
            p.zIndex = 0
          })
        })
      }
    }
  }

  
  taskSubscribed = false
  async subscribeTaskStatus(){
    if(this.taskSubscribed){
      return 
    }
    let itemList = []
    if(!this.cm.dataSrv.dataStore.action){
      this.cm.dataSrv.dataStore.action = {}
      let tmp = await this.cm.dataSrv.getDropList('actions')
      tmp.data.forEach((a: DropListAction) => this.cm.dataSrv.dataStore.action[a.alias] = a.name)
    }
    await this.cm.mqSrv.subscribeMQTTs(['taskArrive', 'taskProgress','taskDepart'])
    await this.cm.mqSrv.refreshTaskStatus()
    this.cm.robotSrv.data.taskActive.pipe(filter(v=>!v)).subscribe(async() => {
      this.taskShowing = null
      this.viewport.allPixiWayPoints.forEach((p: PixiWayPoint) =>{
        p.setTaskItemSeq('')
        delete p['taskItemIndex']
      })
      itemList = []
    })

    this.cm.robotSrv.data.taskActive.pipe(filter(v=>v)).subscribe(async(task) => {
      if(!this.taskShowing){
        task.taskItemList.forEach(move => {
          let pointCode = move['movement']['waypointName']
          if (itemList.length == 0 || (itemList[itemList.length - 1]['pointCode'] != pointCode)) {
            itemList.push({
              floorPlanCode: this.master.mainContainerId,
              pointCode: pointCode,
              navigationMode: move['movement']['navigationMode']
            })
          }
        })
        this.taskShowing = task.taskId
        this.drawTaskPaths(itemList , this.master.mainContainerId)
        // if(!this.taskActionDropdownData){
        //   sessionStorage.setItem((await this.cm.dataSrv.getDropList('actions')).data)
        // }
      }
    })
    
    this.cm.robotSrv.data.taskItemIndex.subscribe(i => {
      if(this.master.module.localization?.localizing){
        return
      }
      this.viewport.allPixiWayPoints.filter(p => p.taskItemIndex == this.cm.robotSrv.data.taskItemIndex.value).forEach((p: PixiWayPoint) => {
        let actionName = this.cm.dataSrv.dataStore.action?.[this.cm.robotSrv.data.taskActive.value?.taskItemList?.[this.cm.robotSrv.data.taskItemIndex.value]?.actionList?.[i]?.alias]
        if (actionName) {
          p.toolTipContent = `${p.text} ${actionName ? ':' : ''} ${actionName}`
        }
      })
      
      this.viewport.allPixiWayPoints.filter(p => p.taskItemIndex <= i).forEach((p: PixiWayPoint) => {
        let idxs = itemList.filter(taskItm => taskItm.pointCode == p.code).map(taskItm => itemList.indexOf(taskItm))
        let idxsNotExecuted = idxs.filter(idx => idx > i)
        let currIdxs = idxs.filter(idx => idx == i || (this.cm.robotSrv.data.isMovingInTask.value && (idx == i - 1)))
        p.taskItemIndex = currIdxs.length > 0 ? currIdxs[0] : (idxsNotExecuted.length > 0 ? Math.min.apply(null, idxsNotExecuted) : Math.max.apply(null, idxs))
        let dispVal = currIdxs.length > 0 ? (currIdxs[0] + 1).toString() : ((idxs.filter(idx => idx <= i).map(idx => (idx + 1).toString()).slice(0,3)).join(' , ') + (idxs.length > 3 ?  ' ...' : '' ))
        p.setTaskItemSeq(dispVal, undefined, true)
      })
      
      // !!! IMPORTANT !!! //
       // TBR : this.mainContainer.children.filter(c => c instanceof PixiTaskPath).forEach
      this.viewport.allPixiTaskPaths.forEach((p: PixiTaskPath) => {
        p.visible = this.cm.robotSrv.data.isMovingInTask.value && p.taskItemIndex == i - 1
        p.alpha = 0.7
      })
      this.viewport.allPixiWayPoints.filter(p =>  p.taskItemIndex != null &&  p.taskItemIndex == i).forEach((p: PixiWayPoint) => {
        p.setTaskItemSeq((p.taskItemIndex + 1).toString(), undefined, !this.cm.robotSrv.data.isMovingInTask.value, this.cm.robotSrv.data.isMovingInTask.value)
      })
      this.viewport.allPixiWayPoints.filter(p =>  p.taskItemIndex != null &&  p.taskItemIndex > i).forEach((p: PixiWayPoint) => {
        p.setTaskItemSeq((p.taskItemIndex + 1).toString())
      })
    })
    this.taskSubscribed = true
  }
}

export class PointCloudModule { //Standalone Function
  get viewport (){
    return this.master.viewport
  }
  cm : CommonModule
  show = false
  graphic : PixiGraphics = null
  mapCode = null
  statusSubscription = null

  get master(){
    return this.cm.master
  }
  constructor( cm: CommonModule){
    this.cm = cm
  }
  
  async subscribeLiveLidar(){
    let ticket = this.cm.uiSrv.loadAsyncBegin()
    await this.cm.httpSrv.fmsRequest("POST","lidar/v1/laserScanToPointCloud/start")
    await this.cm.mqSrv.subscribeMQTTs(['lidar','lidarStatus']);
    if(this.statusSubscription){
      this.statusSubscription.unsubscribe()
    }
    this.statusSubscription = this.cm.robotSrv.data.lidarSwitchedOn.pipe(skip(1), filter(on => !on)).subscribe(() => {
      if (this.show) {
        console.log('lidar turned off . restarting ...')
        this.cm.httpSrv.fmsRequest("POST", "lidar/v1/laserScanToPointCloud/start")
      }
    })    
    this.show = true
    this.cm.ui.toggleRosMap(true)
    this.cm.uiSrv.loadAsyncDone(ticket)
    this.cm.robotSrv.data.lidar.pipe(skip(1)).subscribe(l=>{
      this.refreshLiveLidar()
    })
  }

  async unsubscribeLiveLidar(){
    let ticket = this.cm.uiSrv.loadAsyncBegin()
    await this.cm.httpSrv.fmsRequest("POST","lidar/v1/laserScanToPointCloud/stop")
    await this.cm.mqSrv.unsubscribeMQTTs(['lidar' , 'lidarStatus']);
    this.show = false
    this.cm.ui.toggleRosMap(false)
    this.refreshLiveLidar()    
    if(this.statusSubscription){
      this.statusSubscription.unsubscribe()
    }
    this.cm.uiSrv.loadAsyncDone(ticket)
  }


  refreshLiveLidar() {
    let lidarData = this.cm.robotSrv.data.lidar.value
    if (lidarData && this.master.module.lidarPointCloud.graphic && lidarData.mapName != this.master.module.lidarPointCloud.mapCode) {
      this.cm.ui.toggleRosMap(false)
      this.viewport.removeGraphics(this.graphic)
      this.graphic = null
    }
    if( this.graphic){
      this.graphic.visible =  this.show
    }
    
    if (this.show && lidarData) {
      // let mapContainer: PIXI.Container = <any>(Object.values(this.viewport.mapContainerStore).filter(m => m['mapCode'] == lidarData.mapName)[0])
      let mapContainer: PixiMapContainer = this.viewport.mapContainerStore[lidarData.mapName]
      if((!mapContainer && !this.master._remoteControl) || ( !mapContainer && lidarData.mapName)){
        return
      }
      if (!this.graphic) {
        this.cm.ui.toggleRosMap(true)
        this.mapCode = lidarData.mapName
        this.graphic = new PixiGraphics(this.viewport);

        //BUG HERE ?????
        if(this.mapCode ){
          mapContainer.addChild(this.graphic)
        }else{ //without map
          this.viewport.mainContainer.addChild(this.graphic)
        }
      }
      this.graphic.clear()
      
      lidarData.pointList.forEach((p : {x : number , y : number}) => {
        if(this.mapCode){
          this.graphic .beginFill(0xFF0000).drawCircle(mapContainer.calculateMapX(p.x), mapContainer.calculateMapY(p.y), 1.5).endFill()
        }else{
          const RATIO = this.viewport.METER_TO_PIXEL_RATIO
          let guiOrigin = calculateMapOrigin(0 , 0 , VIRTUAL_MAP_ROS_HEIGHT ,RATIO)
          this.graphic .beginFill(0xFF0000).drawCircle(calculateMapX(p.x, guiOrigin[0], RATIO), calculateMapY(p.y, guiOrigin[1] , RATIO), 1.5).endFill()
        }
      });
    }
  }
}

class CommonModule { 
  master : Map2DViewportComponent
  uiSrv : UiService
  util : GeneralUtil
  ui : UiModule
  httpSrv : RvHttpService
  dataSrv : DataService
  data : DataModule
  mqSrv : MqService
  robotSrv : RobotService
  //DROP DOWN
  constructor( master : Map2DViewportComponent){    
    this.ui = new UiModule(this)
    this.data = new DataModule(master)
    this.master = master
    this.uiSrv = master.uiSrv
    this.util = master.util
    this.httpSrv = master.httpSrv
    this.dataSrv = master.dataSrv
    this.mqSrv = master.mqSrv
    this.robotSrv = master.robotSrv
  }
}

export class DataModule{
  get dataSrv (){
    return this.master.dataSrv
  }
  master : Map2DViewportComponent
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

  private dropdownInitDone = false
  

  public activeFloorPlanCodeChange = new EventEmitter()
  public activeMapCodeChange = new EventEmitter()
  private _activeFloorPlanCode
  get activeFloorPlanCode(){
    return this._activeFloorPlanCode
  }
  set activeFloorPlanCode(v) {
    const oldCode = this._activeFloorPlanCode
    this._activeFloorPlanCode = v
    this.dropdownOptions.locations = this.dataSrv.getDropListOptions('locations', this.dropdownData.locations, { floorPlanCode: v })
    this._activeMapCode = (<DropListMap[]>this.dropdownData.maps).filter((m) => m.floorPlanCode == this.activeFloorPlanCode)[0]?.mapCode
    // console.log(    this._activeMapCode )
    if (oldCode != v) {
      this.activeFloorPlanCodeChange.emit(v)
      this.activeMapCodeChange.emit(this._activeMapCode)
    }
  }

  private _activeMapCode
  get activeMapCode(){
    return this._activeMapCode
  }

  selectedPointCode
  private _selectedFloorPlanCode
  private _selectedMapCode

  get selectedMapCode(){
    return  this._selectedMapCode
  }

  // setSelectedPointCode(v){
  //   this.selectedPointCode = v
  // }
  // set selectedPointCode(v){
  //   this._selectedPointCode = v
  // }
  // get selectedPointCode(){
  //   return this._selectedPointCode
  // }

  set selectedFloorPlanCode(v){
    this._selectedFloorPlanCode = v
    this.dropdownOptions.locations = this.dataSrv.getDropListOptions('locations',this.dropdownData.locations , {floorPlanCode : v})
    this._selectedMapCode = (<DropListMap[]>this.dropdownData.maps).filter((m)=>m.floorPlanCode ==  this.selectedFloorPlanCode)[0]?.mapCode
  }
  
  get selectedFloorPlanCode(){
    return this._selectedFloorPlanCode
  }

  constructor( master : Map2DViewportComponent){    
    this.master = master
  }

  async initDropDown() {
    if(this.dropdownInitDone){
      return
    }
    if (this.master.util.arcsApp) {
      this.dropdownData.robots = await this.dataSrv.getRobotList();
    }
    this.dropdownData.iconTypes = await this.dataSrv.getPointIconList()
    this.dropdownOptions.iconTypes = this.dropdownData.iconTypes.map((t: DropListPointIcon) => { return { value: t.code, text: t.name } });
    // this.showWaypointType = this.showWaypointType && this.util.arcsApp
    if (this.master.util.arcsApp) {
      this.dropdownOptions.pointTypes = await this.dataSrv.getPointTypeList()
    }
    let tblList = ['floorplans','maps', 'locations'].filter(k=>!this.dropdownData[k] || this.dropdownData[k].length == 0) 
    let dropLists = await this.dataSrv.getDropLists(<any>tblList); //TBD filter floorplan => only with maps
     tblList.forEach(k => this.dropdownOptions[k] = dropLists.option[k]);
     tblList.forEach(k => this.dropdownData[k] = dropLists.data[k])
     this.dropdownInitDone = true
  }

  async loadFloorPlan(fpCode : string){
    await this.master.loadDataset( await this.master.mapSrv.getFloorPlan(fpCode), true , false)
    this.activeFloorPlanCode = fpCode
    this.selectedFloorPlanCode = fpCode
  }

  async loadDefaultFloorPlan(){
    if ( this.dropdownOptions.floorplans.length > 0) {
      this.selectedFloorPlanCode = this.dropdownOptions.floorplans.map(p=>p.value.toString()).includes(this.dataSrv.getLocalStorage('lastLoadedFloorplanCode')) ?
                                this.dataSrv.getLocalStorage('lastLoadedFloorplanCode') : 
                                this.dropdownOptions.floorplans[0].value
      // this.onFloorplanSelected_SA()
      await this.master.loadDataset(await this.master.mapSrv.getFloorPlan(this.selectedFloorPlanCode))
      // this.loadFloorPlan(this.selectedFloorPlanCode)
    }
  }
 
  getIconBase64(iconType){
    return (<DropListPointIcon[]>this.dropdownData.iconTypes).filter(t => t.code == iconType)[0]?.base64Image
  }

  subscribeFloorPlanAlertState(){
    //TBD : add FloorPlanCodeParam to MQ subscription , this.master.onDestroy also need to change to floorPlanChanged
    this.master.mqSrv.subscribeMQTTUntil('arcsAiDetectionAlert' , undefined , this.activeFloorPlanCodeChange)
    this.master.mapSrv.floorPlanStateChanged.pipe(filter(d=> d.floorPlanCode == this.activeFloorPlanCode) , takeUntil(this.activeFloorPlanCodeChange)).subscribe(((d: FloorPlanState)=>{
      this.showAlertsOnFloorPlan()
    }))
    this.showAlertsOnFloorPlan()
  }

  async showAlertsOnFloorPlan(){ //TO BE MOVED TO OTHER MODULES
    const floorPlanState  =  await this.master.mapSrv.floorPlanState(this.activeFloorPlanCode)
    const unreadAlerts = floorPlanState.alerts.filter(a=>a.noted == false)
    unreadAlerts.filter(a=> !this.master.viewport.allPixiEventMarkers.some(m=>m.robotCode == a.robotId && m.eventId == a.timestamp)).forEach(a=>{
      const alertMarker = this.setPixiEventMarker(a)
      if(alertMarker){        
        alertMarker.events.click.pipe(takeUntil(this.activeFloorPlanCodeChange)).subscribe((evt)=>{
          this.master.ngZone.run(()=>{
            floorPlanState.markAlertAsNoted(a.robotId , a.timestamp)
            let dialog : DialogRef = this.master.uiSrv.openKendoDialog({content: ArcsEventDetectionDetailComponent , preventAction:()=>true});
            const content : ArcsEventDetectionDetailComponent = dialog.content.instance;
            content.robotCode = alertMarker.robotCode
            content.timestamp = alertMarker.eventId
            content.data = {floorPlanCode : a.floorPlanCode , mapCode : a.mapCode , rosX : a.rosX , rosY : a.rosY}
            setTimeout(()=>{
              alertMarker.toolTip.hide()
              alertMarker?.parent?.removeChild(alertMarker)
            })
            // content.dialogRef = dialog
          })
        })
      }
    })
    
    floorPlanState.alerts.filter(a => a.noted == true).forEach(a => {
      const notedAlertMaker = this.master.viewport.allPixiEventMarkers.filter(m => m.robotCode == a.robotId && m.eventId == a.timestamp)[0]
      notedAlertMaker.toolTip.hide()
      notedAlertMaker?.parent?.removeChild(notedAlertMaker)
    })
  }

  showAnalysisDataOnFloorPlan(){  //TO BE MOVED TO OTHER MODULES

  }

  setPixiEventMarker(a : { robotId : string , timestamp : any , rosX : any , rosY : any , mapCode : string , alertType :string}){
    const robotBase = (<DropListRobot[]>this.dropdownData.robots)?.filter(r=>r.robotCode == a.robotId)[0]?.robotBase
    const pixiMap = this.master.viewport.mapContainerStore[`${a.mapCode}${this.master.util.arcsApp ? ('@' + robotBase) : ''}`]
    console.log(this.master.viewport.mapContainerStore)
    let pixiEventMarker : PixiEventMarker
    if(pixiMap){
      const pos = this.master.viewport.mainContainer.toLocal(pixiMap.toGlobal(new PIXI.Point(pixiMap.calculateMapX(a.rosX) , pixiMap.calculateMapY(a.rosY)))) 
      pixiEventMarker = new PixiEventMarker(this.master.viewport , undefined , a.robotId ,  a.timestamp )
      pixiEventMarker.toolTip.contentBinding = ()=> {
        let datetime = new Date(a.timestamp )
        let timeStr = `${datetime.getHours().toString().padStart(2, '0')}:${datetime.getMinutes().toString().padStart(2, '0')}` 
        const dateStr = this.master.uiSrv.datePipe.transform(datetime , (datetime?.getFullYear() == new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy'))
        const dateTimeStr =`${ datetime.toDateString() != new Date().toDateString() ?  (dateStr + ' ') : '' }${timeStr}`
        return `- ${ this.master.uiSrv.translate(FloorPlanAlertTypeDescMap[a.alertType])}\n [${dateTimeStr}] ${a.robotId}` 
      }
      pixiEventMarker.toolTip.enabled = true
      pixiEventMarker.zIndex = 5
      pixiEventMarker.visible = this.master.module.ui.toggle.alert
      pixiEventMarker.position.set(pos.x, pos.y)
      this.master.viewport.mainContainer.addChild(pixiEventMarker)
    }
    return pixiEventMarker
  }
}

export class UiModule {
  get master(): Map2DViewportComponent {
    return this.cm.master
  } 

  get toggle(){
    return this.viewport?.toggleModule.flags
  }

 set toggle(v){
    if(this.viewport){
      this.viewport.toggleModule.flags = v
    }
  }

  // darkModeDisabled:boolean = false
  overlayMessage = null
  loadingTicket = null
  cm : CommonModule

  _popupScreen = false
  _fullScreen = false
  get popupScreen() {
    return this._popupScreen
  }
  set popupScreen(v) {
    this.master.ngZone.run(() => {
      this._popupScreen = v
      setTimeout(() => {
        this.master._ngPixi.onResize()
      })
    })
    this._popupScreen = v
  }
  get fullScreen() {
    return this._fullScreen
  }
  set fullScreen(v) {
    this.master.ngZone.run(() => {
      this._fullScreen = v
      setTimeout(() => {
        this.master._ngPixi.onResize()
      })
    })
    this._fullScreen = v
  }
  get viewport(){
    return this.master.viewport
  }
  constructor(cm){
    this.cm = cm
  }

  gridLine = {
    uiExpanded : false,
    settings: {
      bigTick: 50,
      color: "#00FF00",
      opacity: 0.4,
      colors :  ['#FFFFFF' , '#000000' , '#FF0000' , '#0000FF' , "#00FF00"]
    },
    layer: new PIXI.Graphics(),
    scale : null,
    hide : new Subject(),

    refreshScale:()=>{
      const map = Object.values(this.viewport.mapLayerStore)[0]
      const px_to_meter = map ? (map?.dataObj?.resolution ? map?.dataObj?.resolution : 0.05 ) : 1 / this.viewport.METER_TO_PIXEL_RATIO;
      const scale = this.gridLine.settings.bigTick  * px_to_meter / (this.viewport.scale.x *  (map ? map?.scale.x : 1)) 
      this.viewport.ngZone.run(()=> this.gridLine.scale =  scale.toFixed(2) )
    },

    refreshLines:()=>{
      this.gridLine.refreshScale()
      const gridSize = 20000
      const bigTick =  this.gridLine.settings.bigTick
      const smallTickCnt = 5
      const smallTick = this.gridLine.settings.bigTick / smallTickCnt
      const color = ConvertColorToDecimal( this.gridLine.settings.color)
      this.viewport.parent.addChild(this.gridLine.layer) 
      this.gridLine.layer.zIndex = 0
      this.gridLine.layer.clear()
      this.gridLine.layer.beginFill(0xFFFFFF , 0).drawRect(0 , 0 , gridSize , gridSize).endFill()
      for (let i = 0; i < gridSize / bigTick; i++) {
        this.gridLine.layer.lineStyle(2, color, this.gridLine.settings.opacity).moveTo(0, i * bigTick).lineTo(gridSize, i * bigTick)
        this.gridLine.layer.lineStyle(2, color, this.gridLine.settings.opacity).moveTo(i * bigTick, 0).lineTo(i * bigTick, gridSize)
        for (let j = 0; j < smallTickCnt; j++) {
          this.gridLine.layer.lineStyle(1, color, this.gridLine.settings.opacity / 2).moveTo(0, i * bigTick + j * smallTick).lineTo(gridSize, i * bigTick + j * smallTick)
          this.gridLine.layer.lineStyle(1, color, this.gridLine.settings.opacity / 2).moveTo(i * bigTick + j * smallTick, 0).lineTo(i * bigTick + j * smallTick, gridSize)
        }
      }
      setTimeout(()=>{
        this.gridLine.layer.pivot.set(gridSize / 2 ,gridSize / 2 )
      })
    }
  }

  toggleGridLine(show : boolean){
    this.toggle.showGridLine = show;
    if(show){
      this.gridLine.refreshLines()
      this.viewport.zoomed.pipe(takeUntil(this.gridLine.hide)).subscribe(() => {
        this.gridLine.refreshScale()
      })
    }else{
      this.gridLine.hide.next()
      this.gridLine.layer.parent.removeChild(this.gridLine.layer)
    }
  }
  //v 20220504 v 
  toggleRosMap(show , toggleFloorplan = false){
    this.toggle.showRosMap = show;
    [this.viewport.mapLayerStore, this.viewport.mapContainerStore].forEach(obj => {
      Object.keys(obj).filter(k => obj[k] && obj[k]['ROS']).forEach(k => {
        (<PixiMap>obj[k]).ROS.alpha = this.toggle.showRosMap && !(this.cm.util.arcsApp && this.master.showRobot) ?  0.5 : 0;
        (<PixiMapGraphics>obj[k]).visible = true
      })
    })    
    if(toggleFloorplan){
      this.master.backgroundSprite.visible = !this.toggle.showRosMap 
    }
    this.updateLocalStorage()
  }

  toggleAlerts(on){
    this.toggle.alert = on
    this.viewport.allPixiEventMarkers.forEach(a=>a.visible = on)
    this.updateLocalStorage()
  }

  toggleDarkMode(on ) {
    this.toggle.darkMode = this.popupScreen? false : on
    const vertexShader = null;
    const fragmentShader = [
      "varying vec2 vTextureCoord;",

      "uniform float thresholdSensitivity;",
      "uniform float smoothing;",
      "uniform vec3 colorToReplace;",
      "uniform sampler2D uSampler;",

      "void main() {",
      "vec4 textureColor = texture2D(uSampler, vTextureCoord);",

      "float maskY = 0.2989 * colorToReplace.r + 0.5866 * colorToReplace.g + 0.1145 * colorToReplace.b;",
      "float maskCr = 0.7132 * (colorToReplace.r - maskY);",
      "float maskCb = 0.5647 * (colorToReplace.b - maskY);",

      "float Y = 0.2989 * textureColor.r + 0.5866 * textureColor.g + 0.1145 * textureColor.b;",
      "float Cr = 0.7132 * (textureColor.r - Y);",
      "float Cb = 0.5647 * (textureColor.b - Y);",

      "float blendValue = smoothstep(thresholdSensitivity, thresholdSensitivity + smoothing, distance(vec2(Cr, Cb), vec2(maskCr, maskCb)));",
      "gl_FragColor = vec4(textureColor.rgb, textureColor.a * blendValue);",
      "}"
    ].join('\n');  
    this.viewport.pixiApp.renderer.transparent =  this.toggle.darkMode 
    this.viewport.pixiApp.renderer.backgroundColor = this.viewport.pixiApp.renderer.transparent ? 0x000000 : this.master.background
    if( this.master.backgroundSprite){
      const colorMatrix = new PIXI.filters.ColorMatrixFilter();
      colorMatrix.brightness(0.7, true);  
      colorMatrix.negative(true);     
      const chroma = new PIXI.Filter(vertexShader, fragmentShader);
      chroma.uniforms.thresholdSensitivity = 0.2
      chroma.uniforms.smoothing = 0.05
      chroma.uniforms.colorToReplace = [(0 / 255), (0 / 255), (0 / 255)]

      this.master.backgroundSprite.filters = this.viewport.pixiApp.renderer.transparent ? [colorMatrix, chroma ] : null;
      this.viewport.allPixiWayPoints.forEach((p:PixiWayPoint)=>{
        p.style.fillColor = ConvertColorToDecimal(this.viewport.pixiApp.renderer.transparent ? this.master.selectedStyle.markerLight.color : this.master.selectedStyle.marker.color)
        p.style.lineColor = p.style.fillColor
        p.reColor( p.style.fillColor )
      })
      // this.backgroundSprite.alpha = this._ngPixi.app.renderer.transparent ? 0.85 : 1     
    }
    if(this.master.showRobot){
      this.updateLocalStorage()
    }
  }

  updateLocalStorage(){
    let storedToggle = this.cm.dataSrv.getLocalStorage('uitoggle') ?  JSON.parse(this.cm.dataSrv.getLocalStorage('uitoggle')) : {};
    Object.keys(this.toggle).forEach(k=> storedToggle[k] = this.toggle[k])
    this.cm.dataSrv.setLocalStorage('uitoggle' , JSON.stringify(storedToggle)) //SHARED BY 2D and 3D viewport
  }


  toggleWaypoint(show = this.toggle.showWaypoint){
    if(this.master.showRobot){
      this.updateLocalStorage()
    }
    this.toggle.showWaypoint = show;
    this.viewport.allPixiWayPoints.forEach(p => {
      p.visible = show
      p.pixiText.visible = this.toggle.showWaypointName
      p.txtBg.visible = this.toggle.showWaypointName
    })
  }

  togglePath(show = this.toggle.showPath){
    if(this.master.showRobot){
      this.updateLocalStorage()
    }
    this.toggle.showPath = show;
    this.viewport.allPixiPaths.forEach(p=>{
      p.visible = show
      if(this.master.showRobot){
      }
    })
  }

  // refreshDarkModeDisabled(){
  //   let viewportSize = 
  // }

}
