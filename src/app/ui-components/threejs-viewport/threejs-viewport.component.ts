import { Component, OnInit, ViewChild , NgZone, HostListener, EventEmitter, Renderer2, Output , Input , HostBinding, ElementRef , OnDestroy, ViewContainerRef, ComponentFactoryResolver, ComponentRef} from '@angular/core';
import { UiService } from 'src/app/services/ui.service';
import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import {TWEEN} from "three/examples/jsm/libs/tween.module.min";
// import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { AmbientLight, DirectionalLight, DoubleSide, Group, Mesh, Object3D, ShapeGeometry, WebGLRenderer ,BufferGeometry, LineSegments, MeshStandardMaterial, Vector3, MeshBasicMaterial, ShaderMaterial, Material, MeshPhongMaterial, PlaneGeometry } from 'three';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil , map } from 'rxjs/operators';
import { radRatio } from '../map-2d-viewport/map-2d-viewport.component';
import { BehaviorSubject, interval, Observable, Subject, Subscription } from 'rxjs';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'; //three-css2drender
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { EffectComposer  } from  'three/examples/jsm/postprocessing/EffectComposer.js' ;
import {  RenderPass  } from  'three/examples/jsm/postprocessing/RenderPass' ;
import {  ShaderPass  } from  'three/examples/jsm/postprocessing/ShaderPass' ;
import {  OutlinePass  } from  'three/examples/jsm/postprocessing/OutlinePass' ;
import {  FXAAShader  } from  'three/examples/jsm/shaders/FXAAShader' ;
import { getBorderVertices } from 'src/app/utils/math/functions';
import { ArcsDashboardComponent } from 'src/app/arcs/arcs-dashboard/arcs-dashboard.component';
import { Color } from '@progress/kendo-drawing';
import { transform } from 'typescript';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { ArcsDashboardRobotDetailComponent } from 'src/app/arcs/arcs-dashboard/arcs-dashboard-robot-detail/arcs-dashboard-robot-detail.component';
import { ArcsLiftIotComponent } from 'src/app/arcs/arcs-iot/arcs-lift-iot/arcs-lift-iot.component';
import { ArcsTurnstileIotComponent } from 'src/app/arcs/arcs-iot/arcs-turnstile-iot/arcs-turnstile-iot.component';
import {GetImageDimensions} from 'src/app/utils/graphics/image'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { DropListRobot, FloorPlanAlertTypeDescMap, JFloorPlan, JMap, JPoint } from 'src/app/services/data.models';
import { MqService , MQType} from 'src/app/services/mq.service';
import { RobotService } from 'src/app/services/robot.service';
import { FloorPlanState, MapService } from 'src/app/services/map.service';
import { CustomButtonComponent } from './custom-button/custom-button.component';
import { State } from '@progress/kendo-data-query';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ArcsEventDetectionDetailComponent } from 'src/app/arcs/arcs-dashboard/arcs-event-detection-detail/arcs-event-detection-detail.component';
import { ArcsRobotIotComponent } from 'src/app/arcs/arcs-iot/arcs-robot-iot/arcs-robot-iot.component';

const NORMAL_ANGLE_ADJUSTMENT =  - 90 / radRatio
const ASSETS_ROOT = 'assets/3D'
@Component({
  selector: 'uc-3d-viewport',
  templateUrl: './threejs-viewport.component.html',
  styleUrls: ['./threejs-viewport.component.scss']
})
export class ThreejsViewportComponent implements OnInit , OnDestroy{
  public selected = false;
  public loadingTicket = null
  subcribedIotSignalRTypes : MQType [] = []

  scene : THREE.Scene
  camera : THREE.PerspectiveCamera
  ambientLight : THREE.AmbientLight
  pointLight : THREE.PointLight
  composer : EffectComposer
  shaderPass : ShaderPass 
  rendererPass : RenderPass
  animationRequestId : number
  loadingPercent = null
  @ViewChild('canvas') canvas : ElementRef
  @Output() transformEnd =  new EventEmitter<any>();
  @Output() robotClicked = new EventEmitter<any>();
  @Output() to2D =  new EventEmitter<{floorPlanCode? : string, showSite? : boolean}>();
  @Output() objClicked = new EventEmitter<any>();
  @Input() floorPlanDataset : JFloorPlan= null;
  @Input() floorPlanOptions : any[]
  @Input() parent : ArcsDashboardComponent
  @Input() arcsRobotType : string
  @Input() set robotColorMapping(v){
    this._robotColorMapping = v
    this.refreshRobotColors() 
  }
  get robotColorMapping(){
    return this._robotColorMapping
  }
  _robotColorMapping = {}
  // @ViewChild('orbitControl') 
  orbitCtrl : OrbitControls
  container : HTMLElement
  // dragCtrl : DragControls
  transformCtrl : TransformControls
  floorplan : FloorPlanMesh
  $mapCodeChanged = new Subject()
  renderer : WebGLRenderer
  labelRenderer : CSS2DRenderer
  suspended = false
  ROSmapScale = 1
  mapCode
  focusedObj = null
  isMobile = false
  fullScreen = false 
  $onDestroy = new Subject()
  floorPlanModel : THREE.Group
  radRatio = radRatio
  transformObjIconClass : string
  transformObjName : string

  @Input() uiToggles: {
    showWall?: boolean,
    showWaypoint?: boolean,
    showWaypointName?: boolean,
    showIot?: boolean,
    showFloorPlanImage?: boolean,
    to2D?: boolean,
    fullScreen?: boolean ,
    alert? : boolean
  } = {
      showWall: true,
      showWaypoint: true,
      showWaypointName: true,
      showIot: false,
      to2D: false,
      fullScreen: false,
      alert : true
    }

  @Input() locationTree : {
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
  } = null
  subscribedPoseMapCode = null
  robotLists : DropListRobot[]
  constructor( public mapSrv : MapService , public  robotSrv : RobotService ,  public uiSrv: UiService , public ngZone : NgZone , public util : GeneralUtil , public dataSrv : DataService ,  public ngRenderer:Renderer2 ,
              public elRef : ElementRef , public vcRef: ViewContainerRef , public compResolver: ComponentFactoryResolver , public mqSrv : MqService) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
    // this.loadLocalStorageToggleSettings()
    this.isMobile = this.uiSrv.detectMob()
  }

  mouse = new THREE.Vector2();
  mouseRaycaster = new THREE.Raycaster();
  focusedRaycaster = new THREE.Raycaster();
  cameraRayCaster = new THREE.Raycaster();
  _initDone = new BehaviorSubject<boolean>(false) 
  @ViewChild("bottomPanelContainer") bottomPanelContainer : ViewContainerRef

  get $initDone(){
    return this._initDone.pipe(filter(v => v == true), take(1))
  }


  get waypointMeshes() : WaypointMarkerObject3D[]{
    return this.floorplan?  <any>this.floorplan?.children.filter(c=>c instanceof WaypointMarkerObject3D) :[]
  }
  get mapMeshes() : MapMesh[]{
    return this.scene ? <any>this.scene.children.filter(c=> c instanceof MapMesh) : []
  }
  get robotObjs():RobotObject3D[]{
    let ret = []
    this.mapMeshes.forEach(m=> {
      ret = ret.concat(m.children.filter(c=>c instanceof RobotObject3D))
    })
    return ret
  }
  get blockMeshes() : Extruded2DMesh[] {
    return this.floorplan? <any>this.floorplan?.children.filter(b=>b instanceof Extruded2DMesh) : []
  }

  get elevators() : ElevatorObject3D[] {
    return this.floorplan? <any>this.floorplan?.children.filter(b=>b instanceof ElevatorObject3D) : []
  }

  get turnstiles() : TurnstileObject3D[] {
    return this.floorplan? <any>this.floorplan?.children.filter(b=>b instanceof TurnstileObject3D) : []
  }

  get eventMarkers() : EventMarkerObject3D[]{
    return Array.prototype.concat.apply([], this.mapMeshes?.map(m => m.children.filter(e => e instanceof EventMarkerObject3D)))
  }

  get width() {
    return  this.elRef?.nativeElement?.parentElement?.clientWidth
  }
  get height() {
    return  this.elRef?.nativeElement?.parentElement?.clientHeight
  }

  

  @HostBinding('class') customClass = 'drawing-board'
  
  @HostListener('window:resize', ['$event'])
  onResize() {
    const width  = this.width
    const height =  this.height
    this.renderer?.setSize( width, height )
    this.labelRenderer?.setSize( width, height )
    this.robotObjs.forEach(r=>r.outlinePass?.setSize(width, height))
    this.shaderPass?.uniforms.resolution.value.set(1 /width, 1 / height);
    this.composer?.setSize( width, height );
    if(this.camera){
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  toggleFullScreen(){
    const fullscreenCssClassName = 'full-screen-viewport'
    this.ngZone.run(()=> this.fullScreen = !this.fullScreen)
    let parentEl = this.elRef.nativeElement.parentElement
    if(this.fullScreen && !parentEl.className.includes(fullscreenCssClassName)){
      parentEl.className += ' ' + fullscreenCssClassName
    }else if(!this.fullScreen){
      parentEl.className =  parentEl.className.split(fullscreenCssClassName).join('')
    }
    this.onResize()
  }

  animate() {
    this.animationRequestId = requestAnimationFrame(this.animate.bind(this))
    TWEEN.update();
    if(!this.suspended){
      //this.renderer.render(this.scene, this.camera )
      this.labelRenderer?.render( this.scene, this.camera );
      this.computeRayCaster()
      this.composer?.render()
      // console.log(this.outlinePass.selectedObjects)
    }
  }

  getParentObj(obj: any , type : any = Object3DCommon) {
    if (obj instanceof type ) {
      return obj
    } else if (obj.parent) {
      return this.getParentObj(obj.parent , type)
    } else {
      return null
    }
  }

  // loadLocalStorageToggleSettings(){
  //   let storedToggle = this.dataSrv.getLocalStorage('uitoggle') ?  JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) : {};
  //   Object.keys(this.uiToggles).forEach(k=> this.uiToggles[k] =  storedToggle[k] )
  //   // this.uiToggles = this.dataSrv.getLocalStorage('uitoggle') ?  JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) :  this.uiToggles
  // }

  uiToggled(key : string){    
    let storedToggle = this.dataSrv.getLocalStorage('uitoggle') ?  JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) : {};
    Object.keys(this.uiToggles).forEach(k=> storedToggle[k] = this.uiToggles[k])
    this.dataSrv.setLocalStorage('uitoggle' , JSON.stringify(storedToggle)) //SHARED BY 2D and 3D viewport
    if(key == 'wall'){
      this.blockMeshes.forEach(b=>b.visible = this.uiToggles.showWall)
    }else if(key == 'waypoint'){
      this.uiToggles.showWaypointName = !this.uiToggles.showWaypoint ? false : this.uiToggles.showWaypointName
      this.waypointMeshes.forEach(m=>  m.visible = this.uiToggles.showWaypoint) 
    }else if(key == 'waypointName'){
      this.waypointMeshes.forEach(m=>m.toolTipAlwaysOn = this.uiToggles.showWaypointName)
    }else if(key == 'robotStatus'){
      this.robotObjs.forEach(r=>r.toolTipAlwaysOn = this.uiToggles.showIot)
    } else if (key == 'showFloorPlanImage') {
      (<THREE.MeshPhongMaterial>this.floorplan.material).visible = this.uiToggles.showFloorPlanImage
    // }else if(key == 'transformControl' && this.floorPlanModel ){
    //   if(this.uiToggles.transformControl){
    //     this.transformCtrl.addEventListener("dragging-changed",  (event)=> {
    //       this.orbitCtrl.enabled = !event.value;
    //       this.transformEnd.emit(this.transformCtrl.object)
    //     });
    //     this.transformCtrl.attach(this.floorPlanModel)
    //   }else if(this.transformCtrl){       
    //     this.transformCtrl.detach()
    //   }
    }else if(key == 'alert'){
      this.eventMarkers.forEach(m=>{
        if(this.uiToggles.alert){
          m.showToolTip()
        }else{
          console.log('hide')
          m.hideToolTip()
        }
      })
    }
  }

  onMouseMove(event : MouseEvent) {
    if(!this.renderer || this.suspended){
      return
    }
    const IoTClassList = [RobotObject3D , ElevatorObject3D , TurnstileObject3D]
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
    this.mouse.y = - ((event.clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;
    this.mouseRaycaster.setFromCamera(this.mouse, this.camera);
    const mouseIntersects = this.mouseRaycaster.intersectObjects(this.scene.children, true);

    let firstObj : Object3DCommon = mouseIntersects.map(i=>this.getParentObj(i.object)).filter(o=>o && o.visible)[0]
    if (firstObj) {
      firstObj.setMousOverEffect()
      if (IoTClassList.some(c=>firstObj instanceof c) || firstObj instanceof WaypointMarkerObject3D) {
        firstObj.addMouseListener()
        let toolTipContent = IoTClassList.some(c=>firstObj instanceof c) ? firstObj.toolTipSettings.customEl : (firstObj instanceof WaypointMarkerObject3D ? firstObj.pointCode : null)
        if (!(firstObj instanceof Object3DCommon && firstObj.toolTipAlwaysOn)) {
          firstObj.showToolTip(toolTipContent, firstObj.getToolTipPos(true))
        }
      }
    }
    this.focusedObj = firstObj && (IoTClassList.some(c=>firstObj instanceof c) || firstObj instanceof WaypointMarkerObject3D) ? firstObj : null
    let blocks = firstObj ? this.getIntersectedObjs(this.focusedRaycaster , firstObj ).filter(o=> o instanceof Extruded2DMesh) : []
    this.blockMeshes.forEach((b: Extruded2DMesh) => {
      b.blockedFocusedObject = blocks.includes(b)
    })

    this.scene.traverse((object: any) => {
      if (object instanceof Object3DCommon && object!=firstObj) {
        object.removeMouseOverEffect()
        if(IoTClassList.some(c=>object instanceof c)  || object instanceof WaypointMarkerObject3D){
          object.removeMouseListener()
          if(!(object instanceof Object3DCommon && object.toolTipAlwaysOn)){
            object.hideToolTip()
          }
        }
      }
    });
  }


  getIntersectedObjs(caster: THREE.Raycaster, toObject: Object3D, frObject: Object3D = this.camera): any[] {
    let frObjPos = new THREE.Vector3();
    let toObjPos = new THREE.Vector3();
    frObject.getWorldPosition(frObjPos);
    toObject.getWorldPosition(toObjPos)
    let direction = new THREE.Vector3().subVectors(toObjPos, frObjPos).normalize()
    caster.set(frObjPos, direction);
    
    const intersects = caster.intersectObjects(this.scene.children, true)
    const objectIntersection = intersects.filter(i=> this.getParentObj(i.object , Object3DCommon) == toObject)[0]
    // const waypoints = [... new Set(intersects.filter(i => this.getParentObj(i.object, MarkerObject3D) && intersects.indexOf(i) < intersects.indexOf(objectIntersection)).
    //                                 map(i => this.getParentObj(i.object, MarkerObject3D))
    //                               )
    //                   ]
    const walls = [ ... new Set(intersects.filter(i=> this.getParentObj(i.object , Extruded2DMesh) && intersects.indexOf(i) < intersects.indexOf(objectIntersection))
                                           .map(i=> this.getParentObj(i.object , Extruded2DMesh))
                                )
                   ]
    const blocks = [ ... new Set(intersects.filter(i=> this.getParentObj(i.object , FloorPlanMesh) && intersects.indexOf(i) < intersects.indexOf(objectIntersection))
                                            .map(i=> i.object)
                                 )
                    ]
    return walls.concat(blocks)
  }

  // uuids = []
  computeRayCaster(){
    let cameraPostion = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPostion);
    let blockingObjs = []
    this.robotObjs.forEach(r => {
      blockingObjs = blockingObjs.concat(this.getIntersectedObjs(this.cameraRayCaster, r))
    })
    this.blockMeshes.forEach((b) => {
      b.setOpactiy(blockingObjs.includes(b) || b.blockedFocusedObject ? b.transparentOpacity : b.defaultOpacity)
    })
    
    this.floorplan?.traverse((c : any) => {
      if ((<any>c).material) {
        (<any>c).material.opacity = c.defaultOpacity ? c.defaultOpacity : 1;
      }
    })

    blockingObjs.forEach(b=>{
      (<any>b).material.transparent = true;
      (<any>b).material.opacity = b.parent instanceof ElevatorObject3D ? 0.6 :  0.3 ;
    })
  }

  async ngOnInit() {
    console.log('THREE JS VERSION : ' + THREE.REVISION )
    let storedToggle =  JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) //SHARED by 2D & 3D viewport
    Object.keys(storedToggle).forEach(k=> {
      if(Object.keys(this.uiToggles).includes(k)){
        this.uiToggles[k] = storedToggle[k] 
      }
    })
  }

  getRobot(robotCode : string): RobotObject3D{
    return this.robotObjs.filter(r=>r.robotCode == robotCode)[0]
  }

  getMapMesh( robotBase : string = ""):MapMesh{
    return this.mapMeshes.filter(m=>  m.robotBase == robotBase)[0]
  }

  ngOnDestroy(){
    this.$onDestroy.next()
    // this.unsubscribeIot()
    this.$mapCodeChanged.next()
    // this.unsubscribeRobotPoses()
    this.resetScene()
    this.cleanUp()
    this.labelRenderer = null
    this.composer = null
  }

  initLabelRenderer(){
    this.labelRenderer = new CSS2DRenderer();
    this.onResize()
    this.labelRenderer.domElement.style.position = 'absolute';
    this.container.appendChild( this.labelRenderer.domElement );
  }

  resetScene(){
    this.mapCode = null
    this.floorPlanModel  = null
    this.robotObjs.forEach(r=>r.destroy())
    this.floorplan?.traverse(obj=>{
      if(obj instanceof Object3DCommon){
        obj.hideToolTip()
      }
      if(obj instanceof ElevatorObject3D){
        obj.robotDisplay?.destroy()
      }
    })
    this.orbitCtrl?.reset()
    this.scene.traverse(obj =>{
      if(obj instanceof CSS2DObject){
        obj.parent?.remove(obj)
      }
    })
    // this.transformCtrl?.parent?.remove( this.transformCtrl)
    // this.transformCtrl = null
    this.scene.remove(this.floorplan)
    this.mapMeshes.forEach(m=>this.scene.remove(m))
    this.waypointMeshes.forEach(w=>w.hideToolTip())
    this.$mapCodeChanged.next()
  }

  async loadFloorPlan(floorplan: JFloorPlan, subscribePoses = true , glb : Blob = null) {
    this.resetScene()
    let tmpDims = await GetImageDimensions(floorplan.base64Image)
    let dimension = {width : tmpDims[0] , height : tmpDims[1]}
    this.initFloorPlan(floorplan , dimension.width , dimension.height);
    this.orbitCtrl.enabled = false;
    this.camera.position.set(0, this.floorplan.height, this.floorplan.height * 0.8)
    this.camera.lookAt(1, -0.9 , -0.5 )
    this.orbitCtrl.update()
    this.camera.position.set(this.camera.position.x, this.camera.position.y  , this.camera.position.z + this.floorplan.height * 0.15)
    this.orbitCtrl.update()
    this.orbitCtrl.enabled = true;
    this.pointLight.position.set(dimension.width / 2 ,  dimension.height  ,  dimension.height / 2)

    if (glb) {
      await this.loadFloorPlanModelFromBlob(glb)
      return
    }
    // else if(files?.zip){
    //   await this.loadFloorPlanModelFromUnzippedObj(files.zip)
    //   return
    // }
    this.initROSmaps(floorplan.mapList)
    this.initWaypoints(floorplan.pointList)

    if(subscribePoses && this.mapCode){
      this.subscribeRobotPoses()
      await this.subscribeFloorPlanState()
      this.updateFloorPlanEventMarkers()
    }
    this.parent?.refreshStats();
    
    // TBR
    ['waypoint', 'waypointName', 'wall' , 'alert'].forEach(k => this.uiToggled(k))
    await this.load3DFloorPlanFromAzureStorage(floorplan.floorPlanCode)    
    if(this.parent?.rightMapPanel?.taskComp){
      this.parent.rightMapPanel.taskComp.refreshMapPoints()
    }
  }

  onObjProgress = ( xhr )=>{
    if ( xhr.lengthComputable ) {
     this.loadingPercent = Math.round(xhr.loaded / xhr.total * 100)
    }
  };

  async loadFloorPlanModelFromBlob(glbFile){
    var awaiter = new Subject()
    let ticket = this.uiSrv.loadAsyncBegin()
    const loader = new GLTFLoader();
    loader.parse(await new Response(glbFile).arrayBuffer(), '', (gltf: GLTF) => {
      this.loadingPercent = null
      this.floorPlanModel = gltf.scene
      // transform(obj)
      this.floorplan.add(this.floorPlanModel)
      this.uiSrv.loadAsyncDone(ticket)
      awaiter.next();
      // this.transformCtrl.object = null
      // this.transformCtrl.attach(this.floorPlanModel)
      // this.scene.remove(this.transformCtrl)
      // this.scene.add(this.transformCtrl)  
    }, this.onObjProgress);
    await awaiter.pipe(take(1)).toPromise()
  }



  async load3DFloorPlanFromAzureStorage(floorPlanCode : string) : Promise<boolean>{
    const file = await this.mapSrv.get3DFloorPlanBlob(floorPlanCode)
    const settings =  await this.mapSrv.get3DFloorPlanSettings(floorPlanCode)
    if(file){
      (<THREE.MeshPhongMaterial>this.floorplan.material).visible = false
      await this.loadFloorPlanModelFromBlob(file);
      this.floorPlanModel.scale.set((settings).scale , (settings).scale , (settings).scale)
      this.floorPlanModel.position.set((settings).positionX , (settings).positionY , (settings).positionZ)
      this.floorPlanModel.rotation.set(settings.rotationX / radRatio , settings.rotationY / radRatio , settings.rotationZ / radRatio);
      ['showFloorPlanImage'].forEach(k => this.uiToggled(k))
      return true
    }else{
      (<THREE.MeshPhongMaterial>this.floorplan.material).visible = true
      return false
    }
  }
  


  async initElevators(floor : string , elevators : { liftId : string , position? : {x : number , y : number , z : number } , rotation? : number , width? : number , height? : number , depth? : number }[]){
    // [
    //   { liftId: "LIFT-1", position: { x: 120, y: -20, z: 0 }, width: null, height: null, depth: null, rotation: null },
    //   { liftId: "LIFT-2", position: { x: 200, y: -20, z: 0 }, width: null, height: null, depth: null, rotation: null },
    //   { liftId: "LIFT-3", position: { x: 280, y: -20, z: 0 }, width: null, height: null, depth: null, rotation: null },
    //   { liftId: "LIFT-4", position: { x: 120, y: 125, z: 0 }, width: null, height: null, depth: null, rotation: 3.14 },
    //   { liftId: "LIFT-5", position: { x: 200, y: 125, z: 0 }, width: null, height: null, depth: null, rotation: 3.14 },
    //   { liftId: "LIFT-6", position: { x: 280, y: 125, z: 0 }, width: null, height: null, depth: null, rotation: 3.14 }
    // ]
    elevators.forEach(l => {
      let elevator = new ElevatorObject3D(this , l.liftId , floor , l.width , l.height, l.depth)
      this.floorplan.add(elevator)
      if(l.position){
        elevator.position.setX(l.position.x ? l.position.x : 0)
        elevator.position.setY(l.position.y ? l.position.y : 0)
        elevator.position.setZ(l.position.z ? l.position.z : 0)
      }
      // elevator.width = l.width ? l.width : elevator.width
      // elevator.height = l.height ? l.height : elevator.height
      // elevator.depth = l.depth ? l.depth : elevator.depth
      if(l.rotation){
        elevator.rotateZ(l.rotation)
      }
    })
    if(!this.subcribedIotSignalRTypes.includes('arcsLift')){
      this.subscribeElevators()
    }
  }

  async subscribeElevators(){
    await this.mqSrv.subscribeMQTTUntil('arcsLift' , undefined, this.$mapCodeChanged)
    // this.subcribedIotSignalRTypes.push('arcsLift')
    this.mqSrv.data.arcsLift.pipe( filter(v=> v!=null),takeUntil(this.$onDestroy)).subscribe((v)=>{
      Object.keys(v).forEach(k=>{
        const liftObj = this.elevators.filter(e=>e.liftId == k)[0]
        const liftData = v[k]
        const inLiftRobot = this.robotObjs.filter(r=>liftData.robotCode && r.robotCode == liftData.robotCode)[0]
        if(inLiftRobot != null){
          inLiftRobot.destroy()
        }
        if(liftObj != null){
          liftObj.currentFloor = liftData.floor  //must in correct seq
          liftObj.robotCode = liftData.robotCode
        }
      })
    })
  }

  initTurnstile(turnstiles: {turnstileId : string , position ? : {x : number , y : number , z : number}}[] ){
    // const turnstiles = [
    //   { turnstileId: "1", position: { x: -160, y: -20, z: 20 } },
    //   { turnstileId: "2", position: { x: -135, y: -20, z: 20 } },
    //   { turnstileId: "3", position: { x: -110, y: -20, z: 20 } }
    // ]
    turnstiles.forEach(t=>{
      let turnstile = new TurnstileObject3D(this , t.turnstileId )
      if(t.position){
        turnstile.position.setX(t.position.x ? t.position.x : 0)
        turnstile.position.setY(t.position.y ? t.position.y : 0)
        turnstile.position.setZ(t.position.z ? t.position.z : 0)
      }
      this.floorplan.add(turnstile)
    })
    this.subscribeTurnstile()
  }

  async subscribeTurnstile(){
    await this.mqSrv.subscribeMQTTUntil('arcsTurnstile', undefined, this.$mapCodeChanged)
    // this.subcribedIotSignalRTypes.push('arcsTurnstile')
  }



  async getRobotList(){
    let ticket = this.uiSrv.loadAsyncBegin()
    this.robotLists = await this.dataSrv.getRobotList();
    this.uiSrv.loadAsyncDone(ticket);
  }

  async ngAfterViewInit() {   
    this.init() 
  }

  async init(){
    this.container = this.canvas.nativeElement
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height , 1 , 100000);
    this.pointLight = new THREE.PointLight(0xFFFFFF , 0.4)
    this.ambientLight = new THREE.AmbientLight(0xFFFFFF , 0.7)
    this.scene.add(this.pointLight)
    this.scene.add(this.ambientLight)
    this.renderer = new THREE.WebGLRenderer({ alpha: true , antialias : true , logarithmicDepthBuffer: true}); //this.canvas.engServ.renderer
    this.renderer.setPixelRatio( window.devicePixelRatio );
    this.renderer.setClearColor(0x222222,.0);
    this.renderer.domElement.style.position = 'absolute'
    this.container.appendChild(this.renderer.domElement)
    this.initLabelRenderer()
    this.initPasses()
    this.animate()
    await this.getRobotList()  
    this.orbitCtrl = new OrbitControls( this.camera, this.labelRenderer.domElement );
    this.transformCtrl = new TransformControls(this.camera, this.labelRenderer.domElement)
    this.transformCtrl.addEventListener("dragging-changed", (event) => {
      this.orbitCtrl.enabled = !event.value;
      this.transformEnd.emit(this.transformCtrl.object)
    });
    this.scene.add(this.transformCtrl)
    
    document.addEventListener('pointermove', (e)=>this.onMouseMove(e), false);
    setTimeout(() => this.onResize())

    if( this.floorPlanDataset){
     await this.loadFloorPlan(this.floorPlanDataset);
    }
    this._initDone.next(true)
  }

  initPasses() {
    this.renderer.setClearColor(0xcccccc,.0);
    this.renderer.shadowMap.enabled = true;
    this.composer = new EffectComposer(this.renderer );
    this.onResize()
    this.shaderPass = new ShaderPass(FXAAShader);
    this.onResize()
    this.rendererPass = new RenderPass(this.scene , this.camera)
    this.composer.addPass( this.rendererPass);
    // this.composer.addPass(this.outlinePass);
    this.composer.addPass(this.shaderPass);   
  }
      

  initWaypoints(waypoints : JPoint[]){
    waypoints.filter(p=>p.enabled).forEach(p=>{
      var marker = new WaypointMarkerObject3D(this , p.pointCode , p.pointType);
      marker.position.set( p.guiX -this.floorplan.width/2 , this.floorplan?.height/2 - p.guiY , 5)
      this.floorplan.add(marker)
    })
  }

  initFloorPlan(fp : JFloorPlan , fpWidth : number , fpHeight : number){   
    this.floorplan = new FloorPlanMesh(this ,fp.base64Image , fpWidth , fpHeight);
    (<THREE.MeshPhongMaterial>this.floorplan.material).visible = false //to be set visible only if don't have custom model in initCustom3dModel()
    this.scene.add(this.floorplan );
  }

  initROSmaps(mapList : JMap[] ){
    // const mapList : JMap[] = JSON.parse(MAP_LIST)
    this.ROSmapScale = mapList[0] ? mapList[0]?.transformedScale : this.ROSmapScale
    this.mapCode = mapList[0] ? mapList[0]?.mapCode : this.mapCode
    mapList.forEach(m=>{
      const mapPlane = new MapMesh(this, m.mapCode, m.robotBase  , m.transformedScale, m.transformedAngle , m.transformedPositionX ,  m.transformedPositionY , m.imageWidth , m.imageHeight , m.originX , m.originY );
      this.scene.add(mapPlane)
    })

    // let robot = new RobotObject3D(this , "RV-ROBOT-103");
    // mapPlane.addRobot(robot)
  }

  initWalls(walls : {x:number , y:number}[][] , height: number = 50){
    walls.forEach((vertices) => {
      let block = new Extruded2DMesh(this, vertices, Number(height))
      this.floorplan.add(block)
      block.position.set(-this.floorplan.width / 2, - this.floorplan.height / 2, this.floorplan.position.z + 1);
    })
  }

  public subscribeRobotPoses(mapCode = this.mapCode){ //Assume 1 Map per robot per floor plan
    //TBR : dont add robot if it is inside lift
    this.mqSrv.subscribeMQTTUntil('arcsPoses' , mapCode , this.$mapCodeChanged)
    this.mqSrv.data.arcsPoses.pipe(filter(v => v?.[mapCode]) , takeUntil(this.$mapCodeChanged)).subscribe(async (poseObj) => { //{mapCode : robotId : pose}
      Object.keys(poseObj[mapCode]).forEach((robotCode)=>{
        if(this.elevators.filter(e=>e.robotCode == robotCode).length > 0){ //wont display robot on map if it is shown in a lift
          return
        }
        let isNewRobot = !this.getRobot(robotCode) 
        let robotData : DropListRobot = this.robotLists.filter(r=>r.robotCode == robotCode)[0]

        if(!robotData){
          console.log(`ERROR : Robot not found : ${robotCode}`)
          return
        }
        if (this.arcsRobotType && robotData.robotType.toUpperCase() != this.arcsRobotType.toUpperCase()) {
          return
        }
        let mapMesh = this.getMapMesh(robotData.robotBase)
        if(!mapMesh){
          console.log(`ERROR : Map not found : [${mapCode}] (ROBOT BASE [${robotData.robotBase}] , ROBOT [${robotCode}])`)
          return
        }
        let robot = this.getRobot(robotCode) ? this.getRobot(robotCode) : new RobotObject3D(this, robotCode, robotData.robotBase, robotData.robotType, robotData.robotSubType)
        let oldMapMesh = this.mapMeshes.filter(m => robot && m.robotBase != robotData.robotBase && m.children.includes(robot))[0]
        if (oldMapMesh) {
          oldMapMesh.remove(robot)
        }

        if(!mapMesh.children.includes(robot)){
          mapMesh.add(robot)
          this.refreshRobotColors()
        }

        let pose : {x : number , y : number , angle : number , interval : number , timeStamp : number} = poseObj[mapCode][robotCode]
        if(robot && mapMesh){
          robot.updatePositionAndRotation(pose)
          if(isNewRobot){
            robot.visible = true
          }
        }
     })
    })
    // this.subscribedPoseMapCode = mapCode
  }
  
  // unsubscribeRobotPoses() {
  //   if (this.subscribedPoseMapCode) {
  //     this.$mapCodeChanged.next()
  //     this.mqSrv.unsubscribeMQTT('arcsPoses', false, this.subscribedPoseMapCode)
  //     this.subscribedPoseMapCode = null
  //   }
  // }

  async subscribeFloorPlanState() {
    await this.mqSrv.subscribeMQTTUntil('arcsAiDetectionAlert', undefined, this.$mapCodeChanged)
    this.mapSrv.floorPlanStateChanged.pipe(filter(state => state.floorPlanCode == this.floorPlanDataset?.floorPlanCode), takeUntil(this.$mapCodeChanged)).subscribe((state) => {
        this.updateFloorPlanEventMarkers()
    })
  }

  async updateFloorPlanEventMarkers() {
    const state = await this.mapSrv.floorPlanState(this.floorPlanDataset?.floorPlanCode)
    if(!state){
      return 
    }
    state.alerts.filter(a=>a.noted == false && !this.eventMarkers.some(m=> m.robotId == a.robotId && m.eventId == a.timestamp)).forEach(a=>{
      let robotData : DropListRobot = this.robotLists.filter(r=>r.robotCode == a.robotId)[0]
      const mapMesh = this.mapMeshes.filter(m => m.mapCode == a.mapCode && m.robotBase == robotData.robotBase)[0]
      if(mapMesh){
        const newMarker = new EventMarkerObject3D(this , a.robotId , a.timestamp)
        const instance : CustomButtonComponent = newMarker.toolTipCompRef.instance
        instance.cssClass = 'mdi mdi-alert alert-3d'
        instance.toolTipMsgBinding = ()=> {
          let datetime = new Date(a.timestamp )
          let timeStr = `${datetime.getHours().toString().padStart(2, '0')}:${datetime.getMinutes().toString().padStart(2, '0')}` 
          const dateStr = this.uiSrv.datePipe.transform(datetime , (datetime?.getFullYear() == new Date().getFullYear() ? 'd MMM' : 'd MMM yyyy'))
          const dateTimeStr =`${ datetime.toDateString() != new Date().toDateString() ?  (dateStr + ' ') : '' }${timeStr}`
          return `- ${ this.uiSrv.translate(FloorPlanAlertTypeDescMap[a.alertType])}\n [${dateTimeStr}] ${a.robotId}` 
        }

        if(!this.uiToggles.alert){
          newMarker.hideToolTip()
        }

        instance.clicked.pipe(takeUntil(this.$mapCodeChanged)).subscribe(() => {
          state.markAlertAsNoted(a.robotId, a.timestamp)
          newMarker.hideToolTip()
          newMarker.parent?.remove(newMarker)
          this.ngZone.run(()=>{
            let dialog : DialogRef = this.uiSrv.openKendoDialog({content: ArcsEventDetectionDetailComponent , preventAction:()=>true});
            const content : ArcsEventDetectionDetailComponent = dialog.content.instance;
            content.robotCode = newMarker.robotId
            content.timestamp = newMarker.eventId
            content.data = {floorPlanCode : a.floorPlanCode , mapCode : a.mapCode , rosX : a.rosX , rosY : a.rosY}
          })
        })
        
        const pos = this.getConvertedRobotVector(a.rosX , a.rosY , mapMesh)
        newMarker.position.set(pos.x , pos.y , 10)
        mapMesh.add(newMarker)
      }
    })
    
    state.alerts.filter(a=>a.noted == true).forEach((a)=>{
      const markerObj = this.eventMarkers.filter(m=> m.robotId == a.robotId && m.eventId == a.timestamp)[0]
      if(markerObj){
        markerObj.hideToolTip()
        markerObj.parent?.remove(markerObj)
      }
    })
  }

  // unsubscribeIot(){
  //   this.mqSrv.unsubscribeMQTTs(this.subcribedIotSignalRTypes , true)
  // }

  refreshRobotColors(){
    Object.keys(this._robotColorMapping).forEach(robotCode=>{
      if(this._robotColorMapping[robotCode]){
        let robot : RobotObject3D = this.robotObjs.filter(r=>r.robotCode == robotCode)[0]
        if(robot){
          robot.color = Number(this._robotColorMapping[robotCode])
        }
      }
    })
  }
  
  public onOrbitControlChange(evt) {
    // console.log(this.orbitCtrl.object.position)
    // console.log(this.camera.position)
    // var lookAtVector = new THREE.Vector3(0,0, -1);
    // lookAtVector.applyQuaternion(this.camera.quaternion);
    // console.log(lookAtVector)
  }

  getConvertedRobotVector(rosX: number, rosY: number, map: MapMesh ): THREE.Vector3 {
    //THREE JS DEFAULT . x : + right / - left , y : + up / - down , z : + forward / - backward
    //floorplan rotatedX - 90 deg
    let retX = (rosX - map.originX) * map.meterToPixelRatio - map.width / 2
    let retY = -1 * ((map.originY - rosY) * map.meterToPixelRatio + map.height / 2) // IDK why need to * -1 but it works
    return new THREE.Vector3(retX, retY, 15) // z : 15 to be overrided
  }
  

  cleanUp() {
    if (this.animationRequestId) {
      window.cancelAnimationFrame(this.animationRequestId);
   }
    let dispose = (obj) =>
    {
        if (obj !== null)
        {
            if(obj instanceof Object3DCommon){
              obj.outlinePass?.dispose()
            }
            for (var i = 0; i < obj.children.length; i++)
            {
              dispose(obj.children[i]);
            }
            if (obj.geometry)
            {
                obj.geometry.dispose();
                obj.geometry = undefined;
            }
            if (obj.material)
            {
                if (obj.material.materials)
                {
                    for (i = 0; i < obj.material.materials.length; i++)
                    {
                        obj.material.materials[i].dispose();
                    }
                }
                else
                {
                    obj.material.dispose();
                }
                obj.material = undefined;
            }
            if (obj.texture)
            {
                obj.texture.dispose();
                obj.texture = undefined;
            }
        }
        obj = undefined;
        this.scene.children.forEach(c=>this.scene.remove(c))
    }

    dispose(this.scene)
    this.floorplan.children.forEach(c=>this.floorplan.remove(c))
    this.floorplan = null
    this.shaderPass = null
    this.rendererPass = null
    this.pointLight = null
    this.ambientLight = null
    this.camera = null
    this.renderer?.renderLists?.dispose()
    this.renderer?.forceContextLoss()
    this.renderer?.dispose()
    this.renderer = null
    this.composer = null
  }
}


  // loadFloorPlanModelFromUnzippedObj(file: { obj?: string, mtl?: string, textures?: { [key: string]: string } }) {
  //   let ticket = this.uiSrv.loadAsyncBegin()
  //   const objLoader = new OBJLoader();
  //   const mtlLoader = new MTLLoader();
  
  //   const materialCreator = mtlLoader.parse(file.mtl, '');


  //   Object.keys(materialCreator.materialsInfo).forEach(k => {
  //     const extension = k.split(".")[k.split(".").length - 1]
  //     materialCreator.materials[k] = new THREE.MeshPhongMaterial();
  //     (<any>materialCreator.materials[k]).map = new THREE.TextureLoader().load(`data:image/${extension};base64,${file.textures[k]}`);
  //     (<any>materialCreator.materials[k]).needsUpdate = true;
  //     (<any>materialCreator.materials[k]).index = (<any>materialCreator).materialsArray.indexOf(materialCreator.materials[k]);
  //   })


  //   objLoader.setMaterials(materialCreator);
  
  //   this.floorPlanModel = objLoader.parse(file.obj);
  //   this.floorPlanModel.traverse((child) => {
  //     if (child instanceof THREE.Mesh) {
  //       child.material.side = THREE.DoubleSide;
  //     }
  //   });
  
  //   this.floorplan.add(this.floorPlanModel);
  //   ['showFloorPlanImage'].forEach(k => this.uiToggled(k))
  //   this.uiSrv.loadAsyncDone(ticket)
  // }


  // async load3DFloorPlanFromAzureStorage(floorPlanCode : string) : Promise<boolean>{
  //   const file = await this.dataSrv.getArcs3DFloorPlanBlob(floorPlanCode)
  //   const settings =  await this.dataSrv.getArcs3DFloorPlanSettings(floorPlanCode)
  //   if(file){
  //     (<THREE.MeshPhongMaterial>this.floorplan.material).visible = false
  //     await this.loadFloorPlanModelFromBlob(file);
  //     this.floorPlanModel.scale.set((settings).scale , (settings).scale , (settings).scale)
  //     this.floorPlanModel.position.set((settings).positionX , (settings).positionY , (settings).positionZ)
  //     this.floorPlanModel.rotation.set(settings.rotationX / radRatio , settings.rotationY / radRatio , settings.rotationZ / radRatio)
  //     return true
  //   }else{
  //     (<THREE.MeshPhongMaterial>this.floorplan.material).visible = true
  //     return false
  //   }
  // }
  

  // async init3dModelFromAssets() {
  //   let tenantCode = this.util.getTenantCode()
  //   let path = `${ASSETS_ROOT}/floorplans/${tenantCode}/${this.floorPlanDataset.floorPlanCode}`
  //   let settings = await this.dataSrv.getAssets(path + '.json')
  //   this.floorplan.settings = settings
  //   path = this.uiSrv.detectMob() && settings.tabletPath?  settings.tabletPath : (settings?.path ? settings.path : path + '.glb') 
  //   let transform = (obj: THREE.Group) => {
  //     obj.rotation.set(settings.rotate?.x ? settings.rotate?.x : 0, settings.rotate?.y ? settings.rotate?.y : 0, settings.rotate?.z ? settings.rotate?.z : 0)
  //     if (settings?.scale) {
  //       obj.scale.set(settings?.scale, settings?.scale, settings?.scale)
  //     }
  //     obj.position.set(settings.position?.x ? settings.position?.x : 0, settings.position?.y ? settings.position?.y : 0, settings.position?.z ? settings.position?.z : 0)
      
  //     obj.traverse((c) => {
  //       if(c instanceof Mesh){
  //         var prevMaterial = c.material; 
  //         c.material = new MeshPhongMaterial();      
  //         MeshBasicMaterial.prototype.copy.call( c.material, prevMaterial );
  //       }      
  //     });
  //   }
  //   // let fileExt = settings?.fileExtension ? settings?.fileExtension : '.glb'
  //   if (settings && settings?.withModel != false) {
  //     if (path.endsWith(".glb") || path.endsWith(".gltf") ) {
  //       const dracoLoader = new DRACOLoader();
  //       dracoLoader.setDecoderPath(ASSETS_ROOT + '/draco/');      
  //       const loader =  new GLTFLoader();
  //       loader.setDRACOLoader(dracoLoader);
  //       loader.load(path, (gltf: GLTF) => {   
  //         this.loadingPercent = null
  //         let obj = gltf.scene
  //         transform(obj)
  //         this.floorplan.add(obj)
  //       }, this.onObjProgress)
  //     } else if (path.endsWith(".obj")) {
  //       var mtlLoader = new MTLLoader();
  //       mtlLoader.load(path.substring(0, path.length - 4) + '.mtl', (materials) => {
  //         materials.preload();
  //         var objLoader = new OBJLoader();
  //         objLoader.setMaterials(materials);
  //         objLoader.load(path, (obj) => {
  //           this.loadingPercent = null
  //           transform(obj)
  //           this.floorplan.add(obj)
  //         }, this.onObjProgress);
  //       });
  //     }
  //   } else {
  //     (<THREE.MeshPhongMaterial>this.floorplan.material).visible = true
  //   }
  //   // //TESTING
  //   // (<THREE.MeshPhongMaterial>this.floorplan.material).visible = true
  //   // //TESTING

  //   if(settings?.walls){
  //     this.initWalls(settings.walls , settings.wallHeight);
  //   }

  //   //elevators
  //   if(settings?.elevators ){
  //     this.initElevators( settings.floor , settings.elevators)
  //   }
  //   //turnstile
  //   if(settings?.turnstiles ){
  //     this.initTurnstile( settings.turnstiles)
  //   }
  // }


class FloorPlanMesh extends Mesh{
  width 
  height
  aabb = new THREE.Box3()
  maxDepth = null
  settings :  { tabletPath?: string, withModel? : boolean, wallHeight : number ,walls : {x:number , y:number}[][], path?: string, scale?: number, position?: { x?: number, y?: number, z?: number }, rotate?: { x?: number, y?: number, z?: number } }
  constructor(public master: ThreejsViewportComponent , base64Image : string , width : number , height : number){
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture(base64Image), side : DoubleSide }))
    this.width = width;
    this.height = height;
    (<any>this).material.side = THREE.DoubleSide;
    this.rotateX(NORMAL_ANGLE_ADJUSTMENT);
    // this.lookAt(new THREE.Vector3(1, 0, 0))
  }
}

class MapMesh extends Mesh {
  mapCode
  robotBase
  transformedScale
  transformedRadian
  translatedX 
  translatedY 
  width 
  height 
  originX 
  originY
  meterToPixelRatio = this.master.util.config.METER_TO_PIXEL_RATIO
  robots: RobotObject3D[] = []
  constructor(public master: ThreejsViewportComponent , mapCode : string , robotBase : string, scale : number, angle : number , x  : number , y  : number , width  : number , height  : number , originX : number , originY : number){
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({  opacity: 0.5 , transparent :true , visible : false }))
    this.mapCode = mapCode
    this.robotBase = robotBase
    // this.master.maps = this.master.maps.filter(m=>m!= this).concat(this)
    this.transformedScale = scale
    this.transformedRadian = angle / -radRatio
    this.translatedX = x 
    this.translatedY = y
    this.width = width
    this.height = height
    this.originX = originX
    this.originY = originY
    this.rotateX(NORMAL_ANGLE_ADJUSTMENT);
    this.rotateZ(this.transformedRadian);
    this.position.set( x - this.master.floorplan.width/2 + width / 2  , 0.1 , y  - this.master.floorplan.height/2 + height/2)
    // this.rotateX(this.transformedRadian);
    // this.position.set( x  , y , 0.1 )
    this.scale.set(scale , scale , scale )
  }
}

export class Object3DCommon extends Object3D{
  $destroyed = new Subject()
  scene : THREE.Scene = new THREE.Scene()
  outlinePass : OutlinePass
  master : ThreejsViewportComponent
  mouseOverChangeColor = true
  gltf : GLTF
  toolTip : CSS2DObject
  mouseOvered = false
  clickListener
  touchListener
  contextMenuListener
  onClick = new Subject()
  defaultOpacity = 1
  _color: number
  toolTipSettings: { customEl?: HTMLElement, position?: any, style?: any , staticComp? : boolean , cssClass ? : string} = {
    customEl: null,
    staticComp : false,
    position: new Vector3(0, 0, 0),
    cssClass  : 'label-3js',
    style: {
      padding: '8px',
      borderRadius: '5px',
      lineHeight: '0px',
      fontSize: '10px',
      whiteSpace: 'pre',
      background : 'rgba(0 , 0 , 0 , 0.45)'
    }
  }

  set toolTipText(v){
    if(this.toolTip.element.firstChild == null ){
      const span = document.createElement('span')
      span.className = 'content'
      this.toolTip.element.appendChild(span)
    }
    this.toolTip.element.className = this.toolTipSettings.cssClass ? this.toolTipSettings.cssClass : 'label-3js'
    this.toolTip.element.firstChild.textContent = v
  }
  get toolTipText() {
    return this.toolTip?.element?.firstChild?.textContent
  }

  set toolTipAlwaysOn(v) { //to be refractored in commonObj
    this._toolTipAlwaysOn = v
    if (v) {
      this.showToolTip(this.toolTipSettings.customEl ? this.toolTipSettings.customEl : this.toolTipText, this.toolTipSettings.position)
    } else {
      this.hideToolTip()
    }
  }
  get toolTipAlwaysOn(){
    return this._toolTipAlwaysOn
  }
  _toolTipAlwaysOn = false
  constructor(master : ThreejsViewportComponent){
    super()
    this.add(this.scene)
    this.master = master
    this._color = this.master.util.config.robot?.visuals?.[0].fillColor ?  Number(this.master.util.config.robot?.visuals?.[0].fillColor) : 0x00CED1
    this.initToolTip()
    this.onClick.subscribe(()=>this.master.objClicked.emit(this)) 
  }

  
  initOutline(gltf: GLTF) {
    this.outlinePass = new OutlinePass(new THREE.Vector2(this.master.width, this.master.height), this.scene, this.master.camera);
    this.outlinePass.overlayMaterial.blending = THREE.CustomBlending
    this.outlinePass.edgeStrength = 3;
    this.outlinePass.edgeThickness = 1;
    this.outlinePass.edgeGlow = 0;
    this.outlinePass.renderToScreen = true;
    this.master.composer.removePass(this.master.shaderPass)
    this.master.composer.addPass(this.outlinePass)
    this.master.composer.addPass(this.master.shaderPass)
    if (!this.outlinePass.selectedObjects.includes(gltf.scene)) {
      this.outlinePass.selectedObjects.push(gltf.scene)
    }
  }


  getMaterials(obj : Object3D | Group) : MeshStandardMaterial[]{
    let ret = []
    obj.traverse(c=>{
      if(c instanceof Mesh){
        ret.push(c.material)
      }
    })
    return ret
  }

  showToolTip(content : string | HTMLElement  = null , position : THREE.Vector3 = null , addonStyle : object = null){
    if(content && (typeof(content) === 'string' || content instanceof String)){
      this.toolTipText = <any>content 
    }else if(content instanceof HTMLElement){
      content.hidden = false
      for (var i = 0; i < this.toolTip.element.children.length; i++) {
        this.toolTip.element.removeChild(this.toolTip.element.children[i]);
      }
      this.toolTip.element.innerText = null
      this.toolTip.element.appendChild(content)
    }

    Object.keys(this.toolTipSettings.style).forEach(k=>{
      this.toolTip.element.style[k] = this.toolTipSettings.style[k]
    })
    this.toolTip.element.className = this.toolTipSettings.cssClass
    if(addonStyle){
      Object.keys(addonStyle).forEach(k=>{
        this.toolTip.element.style[k] = addonStyle[k]
      })
    }
    if(position){
      this.toolTip.position.set(position.x , position.y , position.z)
    }
    this.add(this.toolTip)
  }

  hideToolTip(){ 
    if(this.children.includes(this.toolTip)){
      this.remove(this.toolTip)
    }
  }
  

  initToolTip() {
    this.layers.enableAll()
    const div = document.createElement('div');
    div.className = this.toolTipSettings.cssClass ?  this.toolTipSettings.cssClass : 'label-3js';
    div.textContent = '';
    this.toolTip = new CSS2DObject(div);
    div.addEventListener('click', (evt)=> {
      evt.stopPropagation();
      this.onClick.next(div);
    })
    this.toolTip.position.set(0, 40 / this.scale.y , 0);
    this.toolTip.layers.set(0);
  }

  storeOriginalMaterialData(){
    if(!this.gltf){
      return
    }
    this.gltf.scene.traverse((object: any) => {
      if (object.isMesh === true) {
       object.material.originalColor = object.material.color?.clone();
       object.material.originalHex = object.material.emissive?.getHex();
     } // used for resetting
    });
  }

  resetColor(){
    if(!this.gltf){
      return
    }
    this.gltf.scene.traverse( (s : any)=> {      
      if (s.isMesh === true && s.material?.originalColor){
        s.material.color.set(s.material.originalColor);
      } 
    } );
  }

  setMousOverEffect(color = 0x3399FF){
    if(!this.gltf){
      return
    }
    this.mouseOvered = true
    if( this.outlinePass && !(this instanceof RobotObject3D && this.offline)){
      this.outlinePass.edgeGlow = 1
      this.outlinePass.edgeThickness = 2
      this.outlinePass.edgeStrength = 4
    }else if(!(this instanceof RobotObject3D)){
      this.gltf.scene.traverse( (s : any)=> {      
        if (s.isMesh === true && s.material?.originalHex!= null){
          s.material.emissive.setHex(color)
        } 
      } );
    }
  }

  removeMouseOverEffect(){
    if(!this.gltf || !this.mouseOvered ){
      return
    }
    if( this.outlinePass){
      this.outlinePass.edgeGlow = 0
      this.outlinePass.edgeThickness = 1
      this.outlinePass.edgeStrength = 3
    }
    this.gltf.scene.traverse( (s : any)=> {      
      if (s.isMesh === true && s.material?.originalHex!=null){
        s.material.emissive.setHex( s.material.originalHex )
      } 
    } );
  }

  addMouseListener() {
    if (this.clickListener || this.touchListener || this.contextMenuListener) {
      return
    }
    this.master.container.style.cursor = 'pointer'
    this.clickListener = this.master.ngRenderer.listen(this.master.container, 'click', () => this.onClick.next())
    this.touchListener = this.master.ngRenderer.listen(this.master.container, 'touchstart', () => this.onClick.next())
    this.contextMenuListener = this.master.ngRenderer.listen(this.master.container, 'contextmenu', () => {
      if(this.toolTipSettings.staticComp){
        return
      }
      this.toolTipAlwaysOn = !this.toolTipAlwaysOn
      if (!this.toolTipAlwaysOn && this.master?.robotObjs.every(r => !r.toolTipAlwaysOn)) {
        this.master.uiToggles.showIot = false
      } else if (this.master) {
        this.master.uiToggles.showIot = true
      }
    })
  }

  removeMouseListener() {
    if (this.clickListener) {
      if(!this.master.focusedObj){
        this.master.container.style.cursor = 'default'
      }
      this.clickListener()
      this.clickListener = null
    }
    if(this.touchListener){
      this.touchListener()
      this.touchListener = null
    }
    if(this.contextMenuListener){
      this.contextMenuListener()
      this.contextMenuListener = null
    }
  }

  setOpactiy(opacity : number){
    this.getMaterials(this).forEach(o=>{
      o.depthWrite = opacity >= this.defaultOpacity
      o.opacity = opacity
    })
  }

  getToolTipPos(bool: boolean = true) {
    return new Vector3(0, 0, 0)
  }

  destroy(){
    this.parent?.remove(this)
    this.master.composer?.removePass(this.outlinePass)
    this.hideToolTip()
    this.toolTip?.element?.remove()
    this.$destroyed.next()
   }
}

export class WaypointMarkerObject3D extends Object3DCommon {
  // 95 37 159
  custom2Dobj : Css2DObject3D
  readonly color = 0x60259f
  readonly transparentOpacity = 0.3
  pointCode : string
  pointType : string
  loader : GLTFLoader
  glbSettings = {
    path :  ASSETS_ROOT + '/pin.glb',
    size : 2,
    position : new Vector3( 0 , 0 , 0.2),
    recolorMaterials : ['mat14'],
  }
  private customGlb = {
    CHARGING_STATION : {
      path :  ASSETS_ROOT + '/battery.glb',
      size : 0.75,
      position : new Vector3( 0 , 0 , 0.4),
      recolorMaterials : [],
      replaceMaterial:{
        Battery : ASSETS_ROOT + '/battery.png'
      }
    }
  }

  constructor( master: ThreejsViewportComponent , private _name : string , private _pointType = 'NORMAL'){
    super(master)
    this.pointCode = _name
    this.pointType = _pointType
    this.loader = new GLTFLoader();
    this.toolTipSettings.position = this.getToolTipPos()
    this.toolTipText = this.pointCode
    let custom = this.customGlb[this.pointType]
    let scale =  (custom ? custom.size : this.glbSettings.size )* this.master.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO
    let ticket = this.master.uiSrv.loadAsyncBegin()
     this.loader.load(custom ?  custom.path : this.glbSettings.path ,(gltf : GLTF)=> {
       this.gltf = gltf
      //  this.initOutline(gltf)
       gltf.scene.rotateX(- NORMAL_ANGLE_ADJUSTMENT)
       gltf.scene.scale.set(scale, scale, scale)
       let position =  (<Vector3>(custom ? custom.position : this.glbSettings.position)).multiplyScalar(this.master.ROSmapScale  * this.master.util.config.METER_TO_PIXEL_RATIO )
       gltf.scene.position.set(position.x , position.y , position.z) ;//TBR
       let materials = new Object3DCommon(this.master).getMaterials(gltf.scene);
       if (custom?.replaceMaterial) {
         materials.filter(m => Object.keys(custom.replaceMaterial).includes(m.name)).forEach(m => {
           m.map = THREE.ImageUtils.loadTexture(custom.replaceMaterial[m.name]);
           m.needsUpdate = true;
         })
       }
       materials.filter(m=> (custom ? custom.recolorMaterials : this.glbSettings.recolorMaterials).includes(m.name)).forEach(m=>m.color.set(this.color))
       this.add(gltf.scene)
      //  this.initOutline(gltf)
       this.storeOriginalMaterialData()
      //  console.log(this.outlineMesh)
      //  this.master.outlinePass.selectedObjects.push(this.outlineMesh)
       this.master.uiSrv.loadAsyncDone(ticket)
     })
    this.toolTip.position.set(0, (this.glbSettings.size * 20) * this.master.ROSmapScale, 0)
  }

  getToolTipPos(isMouseOver = false){
    return new Vector3(0, (isMouseOver ? 0.7 : -0.2) * (this.glbSettings.size * 20) * this.master.ROSmapScale, 0)
  }

  appendCustom2DObject(x= 0 , y = 0 , z = 0){
    this.custom2Dobj = new Css2DObject3D(this.master)
    this.custom2Dobj.position.set(x , y , z)
    this.add(this.custom2Dobj)
  }

  removeCustom2DObject(){
    this.custom2Dobj?.hideToolTip()
    this.remove(this.custom2Dobj)    
    this.custom2Dobj = null
  }
}

export class Css2DObject3D extends Object3DCommon{
  toolTipCompRef : ComponentRef<CustomButtonComponent>
  constructor(public master : ThreejsViewportComponent ){    
    super(master)
    this.initInfoToolTipEl()
  }

  initInfoToolTipEl() { 
    this.toolTipSettings.style = {}
    this.toolTipSettings.staticComp = true
    this.toolTipCompRef = this.master.vcRef.createComponent(this.master.compResolver.resolveComponentFactory(CustomButtonComponent))
    this.toolTipSettings.customEl = this.toolTipCompRef.instance.elRef.nativeElement 
    this.toolTipAlwaysOn = true
  } 
}


export class RobotObject3D extends Object3DCommon{
  robotSubType
  destroyed = false
  robotIotCompRef : ComponentRef<ArcsRobotIotComponent>
  aabb = new THREE.Box3() //Axis Align Bounding Box
  loader : GLTFLoader
  alertIcon : Group
  robotCode : string
  robotBase : string
  robotType : string
  master : ThreejsViewportComponent
  outlineSegments : LineSegments
  scene : THREE.Scene = new THREE.Scene()
  offlineColor = 0xAAAAAA
  offlineTexture 
  rayCaster = new THREE.Raycaster();
  rayCasterZoffset = 0
  targetPose : {
    timeStamp : number
    vector :  Vector3
    rotation : number
    movingTweenRef : any
  }
  get importSetting(){
    let setting = this.robotImportSetting[this.robotType] 
    if(!setting){
      return this.robotImportSetting.BASE
    }else if( setting?.subType?.[this.robotSubType]){
      return  setting.subType[this.robotSubType]
    }else if( setting?.robotBase?.[this.robotBase]){
      return setting.robotBase[this.robotBase]
    }else {
      return setting
    }
  }
  
  robotImportSetting :{ [key:string] : Import3DModelSettings} = {
    BASE: {
      path : ASSETS_ROOT + "/robot.glb",
      scale : 30,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 0, y: 0, z: 180 / radRatio },
      toolTipPositionZ : 45 
    },
    FLOOR_SCRUB: {
      path : ASSETS_ROOT + "/robot_floor_scrub.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      toolTipPositionZ : 45
    },
    MOBILE_CHAIR:{    
      path : ASSETS_ROOT + "/robot_mobile_chair.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      toolTipPositionZ : 45
    },
    PATROL: {
      path : ASSETS_ROOT + "/robot_patrol.glb",
      scale : 30,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 0, y: 0, z: 180 / radRatio },
      toolTipPositionZ : 55,
      // recolorMaterials : ['0.019608_0.000000_0.000000_0.000000_0.000000']
      // replaceColors:[{r: 0 , g : 0 , b : 0 , tolerance : 0.1}], 
    },
    CONCIERGE: {
      path: "assets/3D/concierge.glb",
      scale: 20,
      position: {
        x: 0,
        y: 0,
        z: -12.5
      },
      rotate: {
        x: -1.57,
        y: 0,
        z: 3.14
      },
      toolTipPositionZ: 40
    },
    DELIVERY: {
      subType:{
        CABINET_DELIVERY:{
          path : ASSETS_ROOT + "/robot_cabinet_delivery.glb",
          scale : 0.6,
          position: { x: 0, y: 0, z: -12.5 },
          rotate: {x : NORMAL_ANGLE_ADJUSTMENT, y: 0, z: 180 / radRatio },
          toolTipPositionZ : 40
        }
      },
      robotBase : {
        MIR : {
          path : ASSETS_ROOT + "/mir100.glb",
          scale : 25,
          position: { x: 0, y: 0, z: -12.5 },
          rotate: {x : NORMAL_ANGLE_ADJUSTMENT, y: 0, z: 180 / radRatio },
          toolTipPositionZ : 40
        }
      },
      path : ASSETS_ROOT + "/robot_delivery.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: {x : NORMAL_ANGLE_ADJUSTMENT, y: 0, z: 180 / radRatio },
      toolTipPositionZ : 40
    },
    DISINFECTION: {
      path : ASSETS_ROOT + "/robot_disinfection.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      toolTipPositionZ : 40
    },
    FORKLIFT: {
      path : ASSETS_ROOT + "/robot_forklift.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      toolTipPositionZ : 40
    },
    STOCKTAKING: {
      path : ASSETS_ROOT + "/robot_stocktaking.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      toolTipPositionZ : 40
    },

  }

  pointerSetting : any = {
    path : null ,
    scale : 20,
    position : {x : 0 , y: 8 , z : -13 }
  }

  get opacity(){
    return this._opacity
  } 
  set opacity(v){
    if(this.gltf){
      new Object3DCommon(this.master).getMaterials(this.gltf.scene).forEach((m)=>{
        m.transparent = true
        m.opacity = v
      })
      this._opacity = v 
    }
  }
  _opacity
  frontFacePointer : Mesh

  get color(){
    return this._color
  }
  set color(v : number){
    this._color = v
    if(this.gltf){
      this.changeMainColor(this._color)
    }
  }
  _offline = false
  get offline(){
    return this._offline
  }
  set offline(v){
    if(this.frontFacePointer){
      this.frontFacePointer.visible = !v
    }
    if(this.toolTipAlwaysOn && v && this.robotCode){
      this.toolTipAlwaysOn = false
    }
    this._offline = v
  }
  set alert(v){
    this._alert = v
    if(this.alertIcon){
      this.alertIcon.visible = v
    }
  }
  get alert(){
    return this._alert
  }
  _alert = false
  readonly size = 4
  readonly alertIconSetting = {
    size : 3 ,
    positionZ : 5
  }
  // spotLight : THREE.SpotLight
  // mesh : Mesh  
  // readonly glbPath = ASSESTS_ROOT + "/robot.glb" // Raptor Heavy Planetary Crawler by Aaron Clifford [CC-BY] via Poly Pizza
  readonly alertIconPath = ASSETS_ROOT + '/exclamation.glb' //This work is based on "Exclamation Mark 3D icon" (https://sketchfab.com/3d-models/exclamation-mark-3d-icon-35fcb8285f134554989f822ab90ee974) by summer57 (https://sketchfab.com/summer5717) licensed under CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
  constructor( master: ThreejsViewportComponent , _robotCode : string , _robotBase : string , _robotType : string , _robotSubType : string ){
    super(master)
    this.add(this.scene)
    this.robotImportSetting = this.master.util.config.MAP_3D?.ROBOT ? this.master.util.config.MAP_3D.ROBOT : this.robotImportSetting
    this.robotCode = _robotCode;
    this.robotBase = _robotBase;
    this.robotType = _robotType;
    this.robotSubType = _robotSubType;
    this.master = master;
    // this.master.robots = this.master.robots.filter(r=>r != this).concat(this)
    this.loader = new GLTFLoader();
    //
    // let ticket = this.robotCode ? this.master.uiSrv.loadAsyncBegin() : null
    let setting : Import3DModelSettings = this.importSetting ;
    if(setting?.pointer){
      Object.keys(setting?.pointer).forEach(k=> this.pointerSetting[k] = setting?.pointer[k])
    }
    this.loader.load(setting.path ,(gltf : GLTF)=> {
      new GLTFLoader().load(this.alertIconPath, (alertGltf : GLTF)=>{
        this.gltf = gltf       
        this.alertIcon = alertGltf.scene
        new Object3DCommon(this.master).getMaterials(  this.alertIcon ).forEach(m=>m.color.set(0xFF0000))
        this.alertIcon.rotateX(-NORMAL_ANGLE_ADJUSTMENT)
        this.alertIcon.scale.set(this.alertIconSetting.size , this.alertIconSetting.size , this.alertIconSetting.size)
        this.alertIcon.position.z = setting.toolTipPositionZ ? setting.toolTipPositionZ : this.alertIconSetting.positionZ
        this.add(this.alertIcon)

        this.gltf.scene.scale.set(setting.scale, setting.scale, setting.scale)
        this.gltf.scene.position.set(setting.position.x , setting.position.y , setting.position.z)
        this.gltf.scene.rotateX(setting.rotate?.x? setting.rotate?.x : 0 )
        this.gltf.scene.rotateY(setting.rotate?.y? setting.rotate?.y : 0 )
        this.gltf.scene.rotateZ(setting.rotate?.z? setting.rotate?.z : 0 )
        this.aabb.setFromObject(gltf.scene);
        
        // const helper = new THREE.Box3Helper(this.aabb);
        // this.scene.add(helper);
        // this.gltf.scene.add(this.outlineMesh);
 
        // let scale =  this.size * this.master.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO
               
        this.scene.add(this.gltf.scene)
        this.initOutline(gltf)
        // this.addSpotLight()
        this.storeOriginalMaterialData()
        this.addFrontFacePointer()
        new THREE.TextureLoader().load(ASSETS_ROOT +'/offline_overlay.jpg',  (texture)=>{
          if(this.robotCode){
            this.offlineTexture = texture
            this.offlineTexture.wrapS = THREE.RepeatWrapping;
            this.offlineTexture.wrapT = THREE.RepeatWrapping;
          }
          this.changeMainColor(this.color)
        })
        this.changeMainColor(this.color)
        let robotInfo = this.master.parent.robotInfos.filter(r=>r.robotCode == this.robotCode)[0]
        this.offline = !this.robotCode || robotInfo?.robotStatus == 'UNKNOWN'
        this.alert = robotInfo?.alert!= null && robotInfo.alert.length > 0 
        // if(ticket){
        //   this.master.uiSrv.loadAsyncDone(ticket)
        // }
        if(this.destroyed){
          this.destroy()
        }
      })
    })

    // this.toolTip.position.set(0, 0 , 25 );
    this.toolTipSettings.position = this.getToolTipPos()
    if(this.robotCode != null){
      this.initInfoToolTipEl()      
      this.toolTipAlwaysOn = this.master.uiToggles.showIot && !this.offline
    }
    this.visible = !this.robotCode
    this.onClick.subscribe(()=>{
      if(this.robotCode){
        this.master.robotClicked.emit({id:this.robotCode , object : this})
      }
    })
  }

  initInfoToolTipEl() { 
    this.robotIotCompRef = this.master.vcRef.createComponent(this.master.compResolver.resolveComponentFactory(ArcsRobotIotComponent))
    this.robotIotCompRef.instance.robotId = this.robotCode
    this.robotIotCompRef.instance.robotType = this.robotType
    this.robotIotCompRef.instance.robotSubType = this.robotSubType
    this.robotIotCompRef.instance.threejsElRef = this.master
    this.toolTipSettings.customEl = this.robotIotCompRef.instance.elRef.nativeElement 
    this.toolTipSettings.customEl.hidden = true
  }


  getToolTipPos(isMouseOver = false) {
    return  new Vector3(0, 0, this.importSetting?.toolTipPositionZ?   this.importSetting?.toolTipPositionZ : 25)
  }

  updatePositionAndRotation(pose : {x : number  , y : number , angle : number , interval : number , timeStamp : number}){
    if(pose.timeStamp && pose.timeStamp == this.targetPose?.timeStamp){
      return
    }
    const defaultDurationMs = 1000
    const MaxDurationMs = 3000
    // let test= new Date()
    // console.log(`${test.getMinutes().toString().padStart(2 , '0')} : ${test.getSeconds().toString().padStart(2 , '0')}  : ${test.getMilliseconds().toString().padStart(2 , '0')}`)
    let vector =  this.master.getConvertedRobotVector(pose.x , pose.y , <MapMesh>this.parent) 
    // const frameMs = 100
    // const totalTicks =  Math.max(1 , Math.ceil(Math.min((pose.interval ? pose.interval : frameMs) , 3000) / frameMs))
    // let diffAngle = (pose.angle * radRatio - 90 - this.rotation.z * radRatio) 
    // diffAngle = diffAngle > 180 ? (diffAngle - 360) : diffAngle < -180 ? (360 + diffAngle) : diffAngle

    let forceUpdate = (v : Vector3 , r : number)=>{
      if(this.targetPose?.movingTweenRef){
        // this.targetPose.ticksRemaining = 0
        this.targetPose.movingTweenRef.stop();
        TWEEN.remove(this.targetPose.movingTweenRef);
        // clearInterval(this.targetPose.movingRef)
        // this.targetPose?.movingRef.unsubscribe()
      }
      this.position.set(v.x, v.y, v.z) //this.position.set(v.x , v.y , v.z)      
      this.position.z = this.getPositionZ(this.position.x , this.position.y )
      this.rotation.z = r
    }

    if(!this.targetPose){//just spawn or not using smooth transition
      forceUpdate(vector , pose.angle - 90 / radRatio)
    }else{
      forceUpdate(this.targetPose.vector , this.targetPose.rotation)
    }
    // else if(this.targetPose.ticksRemaining > 0 ){ 
    //   forceUpdate(this.targetPose.vector , this.targetPose.rotation)
    // }

    if(this.master.util.config.MOVE_USING_TRANSITION){
      this.targetPose = {
        timeStamp : pose.timeStamp,
        vector : vector,
        rotation :  (pose.angle - 90 / radRatio),
        // vectorDiff : new Vector3(vector.x - this.position.x , vector.y - this.position.y , vector.z),
        // rotationDiff : diffAngle / radRatio,        
        // ticksRemaining :totalTicks,
        // targetTicks : totalTicks,
        movingTweenRef: new TWEEN.Tween(this.position).to(vector, Math.ceil(Math.min((pose.interval ? pose.interval : defaultDurationMs) , MaxDurationMs) )).start()
      }
      // interval(frameMs).subscribe(() => {
      //   if (this.targetPose.ticksRemaining > 1) { // not arrived
      //     this.position.x += this.targetPose.vectorDiff.x / totalTicks
      //     this.position.y += this.targetPose.vectorDiff.y / totalTicks
      //     this.rotation.z += this.targetPose.rotationDiff / totalTicks
      //     this.position.z = this.getPositionZ(this.position.x, this.position.y)
      //     this.targetPose.ticksRemaining -= 1
      //   } else {
      //     forceUpdate(this.targetPose.vector, this.targetPose.rotation)
      //   }
      // })
    }else{
      forceUpdate(vector , pose.angle - 90 / radRatio)      
    } 
  }
  
  changeMainColor(color: number) {
    this.outlinePass?.visibleEdgeColor.set(this.offline ? this.offlineColor : color)
    this.outlinePass?.hiddenEdgeColor.set(this.offline ? this.offlineColor : color)
    if (this.offline && this.outlinePass && this.offlineTexture) {
      this.outlinePass.usePatternTexture = true
      this.outlinePass.patternTexture = this.offlineTexture
    } else if (this.outlinePass) {
      this.outlinePass.usePatternTexture = false
    }
    // let materials: MeshStandardMaterial[] = new Object3DCommon(this.master).getMaterials(this.gltf.scene)
    // materials.filter(m => this.importSetting.recolorMaterials?.includes(m.name) || 
    //                       (this.importSetting.replaceColors && 
    //                        this.importSetting.replaceColors.some(c=>
    //                         c.r - c.tolerance <= m.color.r && c.r + c.tolerance >= m.color.r &&
    //                         c.g - c.tolerance <= m.color.g && c.g + c.tolerance >= m.color.g &&
    //                         c.b - c.tolerance <= m.color.b && c.b + c.tolerance >= m.color.b )
    //                       )
    //                 ).forEach(m => {
    //                   m.color.set(color)
    //                 });
    new Object3DCommon(this.master).getMaterials(this.frontFacePointer).forEach(m=>{
      m.color.set(color)
    })
  }


  addFrontFacePointer() {
    const geometry = new THREE.RingGeometry(0.2, 1, 32 , 1 , 35 /radRatio , 110 /radRatio);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.FrontSide , transparent : true , opacity : 0.4});
    this.frontFacePointer = new THREE.Mesh(geometry, material);
    let setting = this.pointerSetting
    this.frontFacePointer.position.set(setting.position.x , setting.position.y , setting.position.z)
    this.frontFacePointer.scale.set(setting.scale , setting.scale  , setting.scale )
    this.add(this.frontFacePointer)
  }

  // getTooltipText(){
  //   return `${this.robotCode} ${this.offline ? this.master.uiSrv.translate("\n (Offline)") : ""}` 
  // }

  getPositionZ(x: number, y: number) {
    if(!this.master.floorplan?.maxDepth ){
      return 15
    }
    let aabbWidth = Math.abs(this.aabb.max.x - this.aabb.min.x)
    let aabbHeight = Math.abs(this.aabb.max.y - this.aabb.min.y)
    let castRayVecs = [new THREE.Vector3(x, y, 0), new THREE.Vector3(x + aabbWidth / 2, y + aabbHeight / 2, 0), new THREE.Vector3(x + aabbWidth / 2, y - aabbHeight / 2, 0), new THREE.Vector3(x - aabbWidth / 2, y + aabbHeight / 2, 0), new THREE.Vector3(x - aabbWidth / 2, y - aabbHeight / 2, 0)]
    let distances = []
    const offset = 15
    const casterHeight = this.master.floorplan?.maxDepth
    castRayVecs.forEach(v => {
      let frPos = this.getWorldPosition(new THREE.Vector3(v.x, v.y, 0));
      frPos = new Vector3(frPos.x, casterHeight, frPos.z)
      this.rayCaster.set(frPos, new THREE.Vector3(0, -1, 0));
      const intersects = this.rayCaster.intersectObjects(this.master.floorplan.children, true)
      const floorPlanIntersects = [... new Set(intersects.filter(i => (i.object instanceof FloorPlanMesh || this.master.getParentObj(i.object, FloorPlanMesh))))] //&& intersects.indexOf(i) < intersects.indexOf(robotIntersection)
      floorPlanIntersects.forEach(i => distances.push(i.distance))
    })
    return this.parent.worldToLocal(new Vector3(0, (distances.length > 0 ? casterHeight - Math.min.apply(null, distances) : 0), 0)).z + offset
    // //DEBUG
    // this.master.scene.add(new THREE.ArrowHelper(this.rayCaster.ray.direction, this.rayCaster.ray.origin, casterHeight, 0xff0000));
    // const geometry = new THREE.SphereGeometry(1, 32, 16);
    // const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    // const sphere = new THREE.Mesh(geometry, material);
    // //DEBUG

    // let finalPosition = this.parent.worldToLocal(new Vector3(0, (distances.length > 0 ? casterHeight - Math.min.apply(null,  distances) : 0), 0))

    // sphere.position.set(x, y , finalPosition.z)
    // this.parent.add(sphere);

    // return finalPosition.z + offset
  }

  destroy(){
    this.destroyed = true
    this.parent?.remove(this)
    this.master.composer?.removePass(this.outlinePass)
    this.hideToolTip()
    this.toolTip?.element?.remove()
    this.robotIotCompRef?.destroy()
   }
}


class Extruded2DMesh extends Mesh{
  shapeGeom : THREE.ExtrudeGeometry
  blockedFocusedObject = false
  defaultOpacity = 0.8
  readonly wallThickness = 0.3
  readonly transparentOpacity = 0.15
  materials : THREE.MeshPhongMaterial[] = []
  constructor(public master : ThreejsViewportComponent , private vertices : {x : number ,y:number}[] , private depth : number = 100 ,  private wallColor =  0xEAE6EA , private ceilingColor = 0x777777 , private withCeiling = false , defaultOpacity = 0.8 ){
    super();
    this.defaultOpacity = defaultOpacity
    const shape = new THREE.Shape(); 
    const extrudeSettings = {
      steps: 1,
      depth: this.depth,
      bevelEnabled: false,
    };
    // const hole = new THREE.Path();

    vertices.forEach(v=>{
      if(vertices.indexOf(v) == 0){
        shape.moveTo(v.x , this.master.floorplan.height -  v.y)

      }else{
        shape.lineTo(v.x , this.master.floorplan.height - v.y)
      }
    })
    shape.lineTo(vertices[0].x, this.master.floorplan.height - vertices[0].y)

    if (!withCeiling) {
      const hole = new THREE.Shape()
      let holeVertices = getBorderVertices(vertices, - this.wallThickness * this.master?.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO)
      holeVertices.forEach(v => {
        if (holeVertices.indexOf(v) == 0) {
          hole.moveTo(v.x, this.master.floorplan.height - v.y)

        } else {
          hole.lineTo(v.x, this.master.floorplan.height - v.y)
        }
      })

      hole.lineTo(holeVertices[0].x, this.master.floorplan.height - holeVertices[0].y)

      shape.holes.push(hole);
    }


    this.shapeGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    this.materials = [
      new THREE.MeshPhongMaterial({ name: 'ceiling', color: ceilingColor, opacity: this.defaultOpacity , transparent: true }),
      new THREE.MeshPhongMaterial({ name: 'wall' , color: wallColor, opacity: this.defaultOpacity, transparent: true , side : THREE.DoubleSide  }) //0xEAE6EA
    ]

    super(this.shapeGeom, this.materials);
  }

  setOpactiy(opacity : number){
    this.materials.forEach(o=>{
      o.depthWrite = opacity >= this.defaultOpacity
      o.opacity = opacity
    })
  }
}

export class ElevatorObject3D extends Object3DCommon{
  readonly type = 'LIFT'
  floorplanFloor : string
  planeMesh : Mesh
  boxMesh : Mesh
  width = 60
  height = 60
  depth = 90
  liftId
  robotDisplay : RobotObject3D
  toolTipCompRef : ComponentRef<ArcsLiftIotComponent>
  planeColor = 0xaaaaaa

  _currentFloor : string
  get currentFloor(){
    return this._currentFloor
  }
  set currentFloor(v){
    this._currentFloor = v
    this.boxMesh.visible = this.currentFloor == this.floorplanFloor
    
    //show at higher position if with box
    this.toolTipSettings.position.z =  this.boxMesh.visible ? this.height * 1.3 : 0
    if(this.toolTip){
      this.toolTip.position.z = this.toolTipSettings.position.z
    }

    if(!this.boxMesh.visible && this.robotDisplay){
      this.robotDisplay.destroy()
      this.robotDisplay = null
    }
  }

  _robotCode : string
  get robotCode(){
    return this._robotCode
  }

  set robotCode(v){
    this.setRobotCode(v)
  }

  async setRobotCode(v){
    this._robotCode = v;
    (<any>this.planeMesh.material).color.set(this.robotCode ? 0xADFF2F : this.planeColor)
    this.displayRobotData =  this.robotCode ? (await this.master.dataSrv.getRobotList()).filter(r=>r.robotCode == this.robotCode)[0] : null
  }
  
  _displayRobotData : DropListRobot
  get displayRobotData(){
    return this._displayRobotData
  }

  set displayRobotData(data) {      
    this._displayRobotData = data;
    (<any>this.boxMesh).defaultOpacity = data ? 0.45 : 0.85
    this.refreshDisplayRobot()
  }

  refreshDisplayRobot(){
    if(this.robotDisplay && (this.displayRobotData == null || (this.robotDisplay?.robotCode != this.displayRobotData?.robotCode))){
      this.robotDisplay.destroy()
      this.robotDisplay = null
    }  
    if (!this.robotDisplay && this.displayRobotData && this.floorplanFloor == this.currentFloor) {
      this.robotDisplay = new RobotObject3D(this.master, null, this.master.mapMeshes[0]?.robotBase, this.displayRobotData?.robotType, this.displayRobotData?.robotSubType)
      this.robotDisplay.position.set(0, 0, 15 - this.boxMesh.position.z)
      this.boxMesh.add(this.robotDisplay)
    }
  }

  constructor(public master : ThreejsViewportComponent , _id : string , _floor : string , width : number = null , height  : number = null , depth  : number = null ){
    super(master)
    this.liftId = _id
    this.floorplanFloor = _floor
    this.width = width ? width : this.width
    this.height = height ? height : this.height
    this.depth = depth ? depth : this.depth
    this.planeMesh = new Mesh(new THREE.PlaneGeometry(this.width, this.height) , new THREE.MeshBasicMaterial({ color: this.planeColor, side: THREE.FrontSide , transparent : true , opacity : 0.6}));
    (<any> this.planeMesh).defaultOpacity = 0.6
    this.add(this.planeMesh)
    this.boxMesh = new THREE.Mesh(new THREE.BoxGeometry(this.width, this.height, this.depth),  new THREE.MeshLambertMaterial({side: THREE.DoubleSide , color: 0xAAAAAA, opacity: 0.8, transparent: true }));
    (<any> this.boxMesh).defaultOpacity = 0.8
    this.boxMesh.position.set(0, 0, this.depth / 2)
    const liftData = this.master.mqSrv.data.arcsLift.value?.[this.liftId]
    this.boxMesh.visible = false 
    this.add(this.boxMesh)
    this.currentFloor = liftData?.floor
    this.robotCode = liftData?.robotCode 
    this.initInfoToolTipEl()
  }

  initInfoToolTipEl() { 
    this.toolTipCompRef = this.master.vcRef.createComponent(this.master.compResolver.resolveComponentFactory(ArcsLiftIotComponent))
    this.toolTipCompRef.instance.liftId = this.liftId
    this.toolTipCompRef.instance.floorPlanFloor = this.floorplanFloor
    this.toolTipSettings.customEl = this.toolTipCompRef.instance.elRef.nativeElement 
    this.toolTipSettings.customEl.hidden = true
  }

  getToolTipPos(isMouseOver = false) {
    return  new Vector3(0, 0, this.currentFloor == this.floorplanFloor ? this.height * 1.3 : 0)
  }
}

export class TurnstileObject3D extends Object3DCommon{ 
  toolTipCompRef : ComponentRef<ArcsTurnstileIotComponent>
  turnstileId : string

  readonly type = 'TURNSTILE'

  constructor(public master : ThreejsViewportComponent , _id : string ){
    super(master)
    this.turnstileId = _id
    this.initInfoToolTipEl()
  }

  initInfoToolTipEl() { 
    this.toolTipSettings.style = {}
    this.toolTipSettings.staticComp = true
    this.toolTipCompRef = this.master.vcRef.createComponent(this.master.compResolver.resolveComponentFactory(ArcsTurnstileIotComponent))
    this.toolTipCompRef.instance.turnstileId = this.turnstileId
    this.toolTipSettings.customEl = this.toolTipCompRef.instance.elRef.nativeElement 
    this.toolTipAlwaysOn = true
  }
}

class EventMarkerObject3D extends Object3DCommon{
  toolTipCompRef : ComponentRef<CustomButtonComponent>
  robotId : string
  eventId : any
  readonly type = 'MARKER'

  constructor(public master : ThreejsViewportComponent , robotId : string , eventId : any){    
    super(master)
    this.robotId = robotId
    this.eventId = eventId
    this.initInfoToolTipEl()
  }

  initInfoToolTipEl() { 
    this.toolTipSettings.style = {}
    this.toolTipSettings.staticComp = true
    this.toolTipCompRef = this.master.vcRef.createComponent(this.master.compResolver.resolveComponentFactory(CustomButtonComponent))
    this.toolTipSettings.customEl = this.toolTipCompRef.instance.elRef.nativeElement 
    this.toolTipAlwaysOn = true
  } 
}


class Import3DModelSettings {
  type? : string = "GLB"
  path? : string
  scale? : number = 1
  rotate? : {
    x : number 
    y : number 
    z : number
  }
  position? : {
    x : number 
    y : number 
    z : number
  }
  toolTipPositionZ ? : number
  subType? : {[key: string]: Import3DModelSettings }
  robotBase? : {[key: string]: Import3DModelSettings }
  pointer? : {
    path? : string 
    scale? : number
    position? : {x : number , y: number , z : number }
  }
}

// test16WIphoneScanned(){
//   this.resetScene()
//   var mtlLoader = new MTLLoader();
//   mtlLoader.load('assets/3D/16W/ReprocessedMesh.mtl', (materials) => {
//     materials.preload();
//     var objLoader = new OBJLoader();
//     objLoader.setMaterials(materials);
//     // objLoader.setPath( 'obj/male02/' );
//     objLoader.load('assets/3D/16W/ReprocessedMesh.obj', (object) => {
//       var testRobot = new RobotObject3D(this, 'RV-ROBOT-100' , "PATROL" , "PATROL")
//       object.add(testRobot)
//       testRobot.scale.multiplyScalar(0.1)
//       testRobot.visible = true
//       // object.position.y = - 95;
//       this.scene.add(object);
//     });
//   });
//   this.camera.position.set(0, 10, 20)
//   this.camera.lookAt(1, -0.9, -0.5)
//   this.orbitCtrl.update()

//   return
// }


       // initLights(scene) {
  //   // const light = new THREE.DirectionalLight(0xFFFFFF);
  //   // light.intensity = 1;
  //   // light.position.set(1000, 1000, 100);
  //   // scene.add(light); 
  
  //   // const ambient = new THREE.AmbientLight( 0x80ffff );
  //   // ambient.intensity = 0.2;
  //   // scene.add(ambient); 
  // }

 
      // if(poseObj[mapCode]?.['RV-ROBOT-103']){
      //   let robot = this.getRobot('RV-ROBOT-103')
      //   let pose : {x : number , y : number , angle : number} = poseObj['5W_2022']['RV-ROBOT-103']
      //   if(robot && this.getMapMesh('5W_2022')){
      //     robot.visible = true
      //     let vector =  this.getConvertedRobotVector(pose.x , pose.y , this.getMapMesh('5W_2022'))
      //     robot.position.set(vector.x, vector.y, vector.z)
      //     robot.rotation.set(robot.rotation.x , (pose.angle - 90 / radRatio) , robot.rotation.z ) 
      //   }
      // }
      // Object.keys(poseObj).forEach(mapCode => {
      //   let robotsAdded = []
      //   // console.log('test')

      //   // let refreshPose = (r : Robot) => r.refreshPose(getPose(r.id).x, getPose(r.id).y, getPose(r.id).angle, getPose(r.id).interval, mapCode, r.robotBase)
      //   // //all related map containers MUST be added already before calling this function/all related map containers MUST be added already before calling this function
      //   // //let container = this.viewport.mapContainerStore[mapCode] //  + robotBase //
      //   // let robotCodes = Object.keys(poseObj[mapCode])

      //   // let robotCodesToAdd = robotCodes.filter(c => !this.robots.map(r => r.id).includes(c) || (this.robots.filter(r => r.id == c)[0].mapCode != mapCode))
      //   // let robotsToUpdate = this.robots.filter(r => robotCodes.includes(r.id) && r.pixiGraphics.parent == this.getMapContainer(mapCode, r.robotBase))
      //   // let robotsToRemove = this.robots.filter(r => r.mapCode == mapCode && !robotCodes.includes(r.id))

      //   // robotsToRemove.forEach(r => this.removeRobot(r))
      //   // robotCodesToAdd.forEach(code => {
      //   //   let robotMaster = (<DropListRobot[]>this.dropdownData.robots).filter(r2 => r2.robotCode == code)[0]
      //   //   if (this.arcsRobotType && robotMaster.robotType.toUpperCase() != this.arcsRobotType.toUpperCase()) {
      //   //     return
      //   //   }
      //   //   let r = this.addRobot(code, mapCode, robotMaster?.robotBase)
      //   //   r.observed = true
      //   //   robotsAdded.push(r)
      //   //   setTimeout(() => refreshPose(r))
      //   // })
      //   // robotsToUpdate.forEach(r => refreshPose(r))
      //   // if(robotsAdded.length > 0 || robotsToRemove.length > 0){
      //   //   this.refreshRobotColors()
      //   // }
      // })



// const TEST_ROBOTS_BASE_MAP = {
//   "RV-ROBOT-103" : "WC",
//   "RV-ROBOT-104" : "PATROL",
//   "Mobilechair-02" : "DEFAULT"
// }

// const BLOCK1_VERTICES = `[{"x":99.02021985708224,"y":267.2522632772183},{"x":170.25654617656147,"y":266.30885246868274},{"x":171.67184476950354,"y":405.4625135450282},{"x":156.57546081761444,"y":405.4625135450282},{"x":159.8778074045427,"y":726.6950904657913},{"x":909.8634512709015,"y":722.744217751932},{"x":904.6554591338161,"y":217.79894773168402},{"x":883.9066521146965,"y":217.79894773168402},{"x":883.845186132649,"y":57.19247468823681},{"x":96.52106182998074,"y":62.65031168422087}]`
// const BLOCK2_VERTICES = `[{"x" : 665 , "y": 782} , {"x" : 665 , "y": 948} , {"x" : 591 , "y": 948} , {"x" : 591 , "y": 1026},{"x" : 905 , "y": 1026} ,{"x" : 905 , "y": 782}]`
// const BLOCK3_VERTICES = `[{"x" : 415 , "y": 782} , {"x" : 660 , "y": 782} , {"x" : 660 , "y": 945} , {"x" : 415 , "y": 945} ]`
// const BLOCK4_VERTICES = `[{"x" : 105 , "y": 782} , {"x" : 410 , "y": 782} , {"x" : 410 , "y": 945} , {"x" : 105 , "y": 945} ]`

// const MS_BLOCK1_VERTICES = `[{"x": 135 ,"y" : 20 } , {"x": 2200 ,"y" : 20 } , {"x": 2200 ,"y" : 510 } ,{"x": 1600 ,"y" : 510 },{"x": 1600 ,"y" : 1335 } ,{"x": 690 ,"y" : 1335 },{"x": 690 ,"y" : 510 } ,{"x": 135 ,"y" : 510 }]`
// const MS_BLOCK2_VERTICES = `[{"x": 135 ,"y" : 515 } , {"x" : 690 , "y" : 515 } , {"x" : 690 , "y" : 1340} , {"x"  : 1600 , "y" : 1340 } , {"x" : 1600 , "y" : 515} , {"x" : 2200 , "y" : 515} , {"x" : 2200 , "y" : 1550} , {"x" : 1930 , "y" : 1550 } , {"x" : 1930 , "y": 1875} , {"x" : 1685, "y" : 1875} , {"x" : 1685 , "y" : 1955} , {"x" : 385 , "y" : 1955} , {"x" : 385 , "y" : 1820}, {"x" : 335 , "y" : 1820} , {"x" : 335 , "y" : 1555} , {"x" : 135 , "y" : 1555}]`

// const VERTEX_SHADER = `
// attribute vec3 control0;
// attribute vec3 control1;
// attribute vec3 direction;
// attribute float collapse;
// attribute vec3 instPos;

// #include <common>
// #include <color_pars_vertex>
// #include <fog_pars_vertex>
// #include <logdepthbuf_pars_vertex>
// #include <clipping_planes_pars_vertex>
// void main() {
//       #include <color_vertex>

//       // Transform the line segment ends and control points into camera clip space
//       vec4 c0 = projectionMatrix * modelViewMatrix * vec4( control0 + instPos, 1.0 );
//       vec4 c1 = projectionMatrix * modelViewMatrix * vec4( control1 + instPos, 1.0 );
//       vec4 p0 = projectionMatrix * modelViewMatrix * vec4( position + instPos, 1.0 );
//       vec4 p1 = projectionMatrix * modelViewMatrix * vec4( position + instPos + direction, 1.0 );

//       c0.xy /= c0.w;
//       c1.xy /= c1.w;
//       p0.xy /= p0.w;
//       p1.xy /= p1.w;

//       // Get the direction of the segment and an orthogonal vector
//       vec2 dir = p1.xy - p0.xy;
//       vec2 norm = vec2( -dir.y, dir.x );

//       // Get control point directions from the line
//       vec2 c0dir = c0.xy - p1.xy;
//       vec2 c1dir = c1.xy - p1.xy;

//       // If the vectors to the controls points are pointed in different directions away
//       // from the line segment then the line should not be drawn.
//       float d0 = dot( normalize( norm ), normalize( c0dir ) );
//       float d1 = dot( normalize( norm ), normalize( c1dir ) );
//       float discardFlag = float( sign( d0 ) != sign( d1 ) );

// vec3 p = position + instPos + ((discardFlag > 0.5) ? direction * collapse : vec3(0));    
// vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );
//       gl_Position = projectionMatrix * mvPosition;

//       #include <logdepthbuf_vertex>
//       #include <clipping_planes_vertex>
//       #include <fog_vertex>
// }
// `

// const LINE_FRAG_SHADER =`
// uniform vec3 diffuse;
// uniform float opacity;

// #include <common>
// #include <color_pars_fragment>
// #include <fog_pars_fragment>
// #include <logdepthbuf_pars_fragment>
// #include <clipping_planes_pars_fragment>
// void main() {
//       #include <clipping_planes_fragment>
//       vec3 outgoingLight = vec3( 0.0 );
//       vec4 diffuseColor = vec4( diffuse, opacity );
//       #include <logdepthbuf_fragment>
//       #include <color_fragment>
//       outgoingLight = diffuseColor.rgb; // simple shader
//       gl_FragColor = vec4( outgoingLight, diffuseColor.a );
//       #include <tonemapping_fragment>
//       #include <encodings_fragment>
//       #include <fog_fragment>
//       #include <premultiplied_alpha_fragment>
// }
// `

// createOutlineSegments(geometry :THREE.BufferGeometry , color : number){
//   let eg = this.getOutlineGeometry(geometry);
//   let m = new THREE.ShaderMaterial({
//     vertexShader: VERTEX_SHADER,
//     fragmentShader: LINE_FRAG_SHADER,
//     uniforms: {
//       diffuse: {
//         value: new THREE.Color(color)
//       },
//       opacity: {
//         value: 0
//       }
//     },
//     transparent: false
//   });
//   //let m =  new THREE.MeshPhongMaterial({ color: 0x00FF00 , side: THREE.DoubleSide});
//   //let o = new THREE.LineSegments(eg, m);
//   let o = new THREE.LineSegments( eg, new THREE.LineBasicMaterial( { color: 0x00ff00 } ) );
//   // o.geometry.setAttribute("instPos", new THREE.InstancedBufferAttribute(new Float32Array([0,0,0]), 3));
//   return o;
// }

// getOutlineGeometry(geometry: THREE.BufferGeometry, thresholdAngle = 1) : THREE.EdgesGeometry {
//   let g = new THREE.EdgesGeometry(geometry , thresholdAngle);
//   // g.type = 'EdgesGeometry';
//   // g['parameters'] = {
//   //   thresholdAngle: thresholdAngle
//   // };

//   // thresholdAngle = (thresholdAngle !== undefined) ? thresholdAngle : 1;
//   // buffer
//   const vertices = [];
//   const control0 = [];
//   const control1 = [];
//   const direction = [];
//   const collapse = [];
//   // helper variables
//   const thresholdDot = Math.cos(THREE.MathUtils.DEG2RAD * thresholdAngle);

//   const edge = [0, 0], edges = {}, eArray = [];
//   let edge1, edge2, key;
//   const keys = ['a', 'b', 'c'];

//   // prepare source geometry
//   let geometry2, geometry2a;

//   geometry2a = geometry.clone();
//       //console.log(geometry2a.index.count / geometry2a.attributes.position.array.length);
//   var ratio = (geometry2a.attributes.position.array.length / geometry2a.index.count)
//   geometry2 = BufferGeometryUtils.mergeVertices(geometry2a, ratio);
//   console.log(geometry2a);
//   //geometry2.mergeVertices();
//   geometry2.computeVertexNormals();

//   const sourceVertices = geometry2.attributes.position;

//   var sv = [];
//   var normalss = []
//   const faces = [];
//   const vs = [];
//   var ori = new THREE.Vector3()

//   var a = new THREE.Vector3();
//   var b = new THREE.Vector3()
//   var c = new THREE.Vector3();
//   var tri = new THREE.Triangle()

//   for (let s = 0; s < sourceVertices.array.length; s++) {
//     sv.push(new THREE.Vector3(sourceVertices.array[s * 3 + 0], sourceVertices.array[s * 3 + 1], sourceVertices.array[s * 3 + 2]))
//   }
//   this.master.scene.updateMatrixWorld()

//   var index = geometry2.index;
//   var facess = index.count / 3;
//   var normIdx = [];
//   for (let i = 0; i < facess; i++) {
//     var triy: any = {};
//     triy.a = index.array[i * 3 + 0];
//     triy.b = index.array[i * 3 + 1];
//     triy.c = index.array[i * 3 + 2];

//     var dir = new THREE.Vector3();
//     a.fromBufferAttribute(sourceVertices, index.array[i * 3 + 0]);
//     b.fromBufferAttribute(sourceVertices, index.array[i * 3 + 1]);
//     c.fromBufferAttribute(sourceVertices, index.array[i * 3 + 2]);
//     tri.set(a, b, c);
//     tri.getMidpoint(ori);
//     tri.getNormal(dir);

//     triy.normal = dir
//     faces.push(triy)

//   }

//   for (let i = 0; i < faces.length; i++) {
//     var face = faces[i]
//     for (let j = 0; j < 3; j++) {
//       edge1 = face[keys[j]];
//       edge2 = face[keys[(j + 1) % 3]];
//       edge[0] = Math.min(edge1, edge2);
//       edge[1] = Math.max(edge1, edge2);
//       key = edge[0] + ',' + edge[1];
//       if (edges[key] === undefined) {
//         edges[key] = { index1: edge[0], index2: edge[1], face1: i, face2: undefined };
//       } else {
//         edges[key].face2 = i;
//       }
//     }
//   }
//   // generate vertices
//   const v3 = new THREE.Vector3();
//   const n = new THREE.Vector3();
//   const n1 = new THREE.Vector3();
//   const n2 = new THREE.Vector3();
//   const d = new THREE.Vector3();

//   for (key in edges) {
//     const e = edges[key];
//     // an edge is only rendered if the angle (in degrees) between the face normals of the adjoining faces exceeds this value. default = 1 degree.
//     if (e.face2 === undefined || faces[e.face1].normal.dot(faces[e.face2].normal) <= thresholdDot) {
//       //console.log('fshg');
//       let vertex1 = sv[e.index1];
//       let vertex2 = sv[e.index2];
//       //console.log(vertex1);
//       vertices.push(vertex1.x, vertex1.y, vertex1.z);
//       vertices.push(vertex2.x, vertex2.y, vertex2.z);
//       //console.log(vertices);

//       d.subVectors(vertex2, vertex1);
//       collapse.push(0, 1);
//       n.copy(d).normalize();
//       direction.push(d.x, d.y, d.z);
//       n1.copy(faces[e.face1].normal);
//       n1.crossVectors(n, n1);
//       d.subVectors(vertex1, vertex2);
//       n.copy(d).normalize();
//       n2.copy(faces[e.face2].normal);
//       n2.crossVectors(n, n2);
//       direction.push(d.x, d.y, d.z);

//       v3.copy(vertex1).add(n1); // control0
//       control0.push(v3.x, v3.y, v3.z);
//       v3.copy(vertex1).add(n2); // control1
//       control1.push(v3.x, v3.y, v3.z);

//       v3.copy(vertex2).add(n1); // control0
//       control0.push(v3.x, v3.y, v3.z);
//       v3.copy(vertex2).add(n2); // control1
//       control1.push(v3.x, v3.y, v3.z);
//     }

//   }

//   // build geometry
//   //g.setAttribute( 'position', new THREE.BufferAttribute (new Float32Array( vertices), 3)  );
//   g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
//   g.setAttribute('control0', new THREE.Float32BufferAttribute(control0, 3));
//   g.setAttribute('control1', new THREE.Float32BufferAttribute(control1, 3));
//   g.setAttribute('direction', new THREE.Float32BufferAttribute(direction, 3));
//   g.setAttribute('collapse', new THREE.Float32BufferAttribute(collapse, 1));
//   console.log(g);
//   return g;
// }


// testVolumetricLight(){    
//   const VolumetricSpotLightMaterial = function () {
//     // 
//     var vertexShader = [
//       'varying vec3 vNormal;',
//       'varying vec3 vWorldPosition;',
//       'void main(){',
//       '// compute intensity',
//       'vNormal        = normalize( normalMatrix * normal );',
//       'vec4 worldPosition = modelMatrix * vec4( position, 1.0 );',
//       'vWorldPosition     = worldPosition.xyz;',
//       '// set gl_Position',
//       'gl_Position    = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
//       '}',
//     ].join('\n')
//     var fragmentShader = [
//       'varying vec3       vNormal;',
//       'varying vec3       vWorldPosition;',
//       'uniform vec3       lightColor;',
//       'uniform vec3       spotPosition;',
//       'uniform float      attenuation;',
//       'uniform float      anglePower;',
//       'void main(){',
//       'float intensity;',
//       //////////////////////////////////////////////////////////
//       // distance attenuation                 //
//       //////////////////////////////////////////////////////////
//       'intensity  = distance(vWorldPosition, spotPosition)/attenuation;',
//       'intensity  = 1.0 - clamp(intensity, 0.0, 1.0);',
//       //////////////////////////////////////////////////////////
//       // intensity on angle                   //
//       //////////////////////////////////////////////////////////
//       'vec3 normal    = vec3(vNormal.x, vNormal.y, abs(vNormal.z));',
//       'float angleIntensity   = pow( dot(normal, vec3(0.0, 0.0, 1.0)), anglePower );',
//       'intensity  = intensity * angleIntensity;',
//       // 'gl_FragColor    = vec4( lightColor, intensity );',
//       //////////////////////////////////////////////////////////
//       // final color                      //
//       //////////////////////////////////////////////////////////
//       // set the final color
//       'gl_FragColor   = vec4( lightColor, intensity);',
//       '}',
//     ].join('\n')
//     // create custom material from the shader code above
//     //   that is within specially labeled script tags
//     var material = new THREE.ShaderMaterial({
//       uniforms: {
//         attenuation: <any>{
//           type: "f",
//           value: 100000000000
//         },
//         anglePower: <any>{
//           type: "f",
//           value: -100000000000
//         },
//         spotPosition: <any>{
//           type: "v3",
//           value: new THREE.Vector3(0, 0, 0)
//         },
//         lightColor: <any>{
//           type: "c",
//           value: new THREE.Color('cyan')
//         },
//       },

//       vertexShader: vertexShader,
//       fragmentShader: fragmentShader,
//       side: THREE.BackSide,
//       blending: THREE.AdditiveBlending,
//       transparent: true,
//       depthWrite: false,
//     });
//     return material
//   }


//   // var renderer = new THREE.WebGLRenderer();
//   // renderer.setSize(1500, 500);
//   // document.body.appendChild(renderer.domElement);
//   // var scene = new THREE.Scene();
//   // var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 10);
//   // camera.position.set(0, 2, 5)
//   // camera.lookAt(scene.position)

//   //////////////////////////////////////////////////////////////////////////////////
//   //		create a scene							//
//   //////////////////////////////////////////////////////////////////////////////////

//   //////////////////////////////////////////////////////////////////////////////////
//   //		add a volumetric spotligth					//
//   //////////////////////////////////////////////////////////////////////////////////
//   // add spot light
//   var obj = new Object3D()
//   var scale = 1
//   var geometry = new THREE.CylinderGeometry(0.1 * scale, 1.5 *scale, 5 * scale, 32 * 2 * scale, 20 * scale, true);
//   // var geometry	= new THREE.CylinderGeometry( 0.1, 5*Math.cos(Math.PI/3)/1.5, 5, 32*2, 20, true);
//   geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, -geometry.parameters.height / 2, 0));
//   geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
//   var material = VolumetricSpotLightMaterial();
//   var mesh = new THREE.Mesh(geometry, material);
//   mesh.position.set(0, 0, 0)
//   mesh.lookAt(new THREE.Vector3(0, 0, 0))
//   material.uniforms.lightColor.value.set('red')

//   material.uniforms.spotPosition.value = mesh.position
//   obj.add(mesh)
//   // mesh.position.set(0, 0, 0)
//   // material.uniforms.spotPosition.value = mesh.position
//   this.scene.add(obj);
//   obj.position.set(50,150,50)
//   obj.scale.set(100,100,100)
// }

//  new ShaderMaterial( {

//   uniforms: {
//     'maskTexture': { value: null },
//     'edgeTexture1': { value: null },
//     'edgeTexture2': { value: null },
//     'patternTexture': { value: null },
//     'edgeStrength': { value: 1.0 },
//     'edgeGlow': { value: 1.0 },
//     'usePatternTexture': { value: 0.0 }
//   },

//   vertexShader:
//     'varying vec2 vUv;\n\
//     void main() {\n\
//       vUv = uv;\n\
//       gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\
//     }',

//   fragmentShader:
//     'varying vec2 vUv;\
//     uniform sampler2D maskTexture;\
//     uniform sampler2D edgeTexture1;\
//     uniform sampler2D edgeTexture2;\
//     uniform sampler2D patternTexture;\
//     uniform float edgeStrength;\
//     uniform float edgeGlow;\
//     uniform bool usePatternTexture;\
//     \
//     void main() {\
//       vec4 edgeValue1 = texture2D(edgeTexture1, vUv);\
//       vec4 edgeValue2 = texture2D(edgeTexture2, vUv);\
//       vec4 maskColor = texture2D(maskTexture, vUv);\
//       vec4 patternColor = texture2D(patternTexture, 6.0 * vUv);\
//       float visibilityFactor = 1.0 - maskColor.g > 0.0 ? 1.0 : 0.5;\
//       vec4 edgeValue = edgeValue1 + edgeValue2 * edgeGlow;\
//       vec4 finalColor = edgeStrength * maskColor.r * edgeValue;\
//       if(usePatternTexture)\
//         finalColor += + visibilityFactor * (1.0 - maskColor.r) * (1.0 - patternColor.r);\
//       gl_FragColor = finalColor;\
//     }',
//   blending: AdditiveBlending,
//   depthTest: false,
//   depthWrite: false,
//   transparent: true


  
// async loadFloorPlanModelFromUnzippedObj( zip? : Blob) {
//   let ticket = this.uiSrv.loadAsyncBegin()
//   let unzippedData = await new JSZIP.default().loadAsync(zip)
//   const objs = Object.keys(unzippedData.files).filter(k => k.split(".")[k.split(".").length - 1]?.toLowerCase() == 'obj')
//   const mtls = Object.keys(unzippedData.files).filter(k => k.split(".")[k.split(".").length - 1]?.toLowerCase() == 'mtl')
//   if (objs.length != 1) {
//     this.uiSrv.showNotificationBar("The zip file must contain exactly 1 .obj file", "warning")
//     this.uiSrv.loadAsyncDone(ticket)
//     return
//   } else if (mtls.length != 1) {
//     this.uiSrv.showNotificationBar("The zip file must contain exactly 1 .mtl file", "warning")
//     this.uiSrv.loadAsyncDone(ticket)
//     return
//   }
//   const textureFiles = unzippedData.file(/^.*\.(jpg|png)$/i)
//   let objPromise = unzippedData.file(objs[0]).async('string');
//   let mtlPromise = unzippedData.file(mtls[0]).async('string');
//   let texturesData = {}
//   let texturePromises = textureFiles.map((file) => file.async('base64'));

//   let [objData, mtlData, ...imagesData] = await Promise.all([objPromise, mtlPromise, ...texturePromises]);
//   for (let i = 0; i < textureFiles.length; i++) {
//     texturesData[textureFiles[i].name.split("/")[textureFiles[i].name.split("/").length - 1]] = imagesData[i]
//   }
//   const objLoader = new OBJLoader();
//   const mtlLoader = new MTLLoader();

//   const materialCreator = mtlLoader.parse(mtlData, '');

//   materialCreator.preload()

//   console.log(materialCreator)
//   objLoader.setMaterials(materialCreator);

//   this.floorPlanModel = objLoader.parse(objData);

//   // const loadingManager = new THREE.LoadingManager();
//   // const arrayBufferStore = {}
//   // const urls = Object.keys(unzippedData.files)
//   // let array = await Promise.all(urls.map((url) => unzippedData.file(url).async("arraybuffer")))
//   // for(let i = 0 ; i< urls.length ; i ++){
//   //   arrayBufferStore[urls[i]] = array[i]
//   // }

//   // loadingManager.setURLModifier((url) => {
//   //     const arrayBuffer = arrayBufferStore[url]
//   //     const uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer);
//   //     const blob = new Blob([uint8Array], { type: "application/octet-stream" });
//   //     const objectURL = URL.createObjectURL(blob);
//   //     console.log(objectURL)
//   //     return objectURL;
//   // })

//   // const mtlLoader = new MTLLoader(loadingManager);
//   // const materials = mtlLoader.parse(await unzippedData.file(mtls[0]).async('string'), '');
//   // this.floorPlanModel = new OBJLoader().setMaterials(materials).parse(await  unzippedData.file(objs[0]).async('string'));


//        // const textureFiles = zip.file(/^.*\.(jpg|png)$/i)
//     // let objPromise = zip.file(objs[0]).async('string');
//     // let mtlPromise = zip.file(mtls[0]).async('string');
//     // let texturesData = {}
//     // let texturePromises = textureFiles.map((file) => file.async('base64'));
    
//     // let [objData, mtlData, ...imagesData] = await Promise.all([objPromise, mtlPromise, ...texturePromises]);
//     // for(let i = 0 ; i < textureFiles.length ; i ++){
//     //   texturesData[textureFiles[i].name.split("/")[textureFiles[i].name.split("/").length - 1]] = imagesData[i]
//     // }


//   this.floorplan.add(this.floorPlanModel);
//   ['showFloorPlanImage'].forEach(k => this.uiToggled(k))
//   this.uiSrv.loadAsyncDone(ticket)
// }
