import { Component, OnInit, ViewChild , NgZone, HostListener, EventEmitter, Renderer2, Output , Input , HostBinding, ElementRef , OnDestroy} from '@angular/core';
import { ThCamera, ThCanvas, ThDragControls, ThObject3D , ThOrbitControls, ThScene } from 'ngx-three';
import { UiService } from 'src/app/services/ui.service';
import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { AmbientLight, DirectionalLight, DoubleSide, Group, Mesh, Object3D, ShapeGeometry, WebGLRenderer ,BufferGeometry, LineSegments, MeshStandardMaterial, Vector3, MeshBasicMaterial, ShaderMaterial, Material } from 'three';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService, DropListFloorplan, DropListRobot, JFloorPlan, JMap, JPoint } from 'src/app/services/data.service';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';
import { radRatio } from '../drawing-board/drawing-board.component';
import { Subject } from 'rxjs';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'; //three-css2drender
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { BufferGeometryUtils  } from 'three/examples/jsm/utils/BufferGeometryUtils';
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
  @Output() robotClicked = new EventEmitter<any>();
  @Output() to2D =  new EventEmitter<{floorPlanCode? : string, showSite? : boolean}>();
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
  dragCtrl : DragControls
  floorplan : FloorPlanMesh
  $mapCodeChanged = new Subject()
  renderer : WebGLRenderer
  labelRenderer : CSS2DRenderer
  suspended = false
  ROSmapScale = 1
  mapCode
  focusedObj = null
  @Input() uiToggles = {
    showWall : true,
    showWaypoint:true,
    showWaypointName : true
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
  constructor(public uiSrv: UiService , public ngZone : NgZone , public util : GeneralUtil , public dataSrv : DataService ,  public ngRenderer:Renderer2 , public elRef : ElementRef) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
    this.loadLocalStorageToggleSettings()
  }

  mouse = new THREE.Vector2();
  mouseRaycaster = new THREE.Raycaster();
  focusedRaycaster = new THREE.Raycaster();
  cameraRayCaster = new THREE.Raycaster();


  get waypointMeshes() : MarkerObject3D[]{
    return this.floorplan?  <any>this.floorplan?.children.filter(c=>c instanceof MarkerObject3D) :[]
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

  animate() {
    this.animationRequestId = requestAnimationFrame(this.animate.bind(this))
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

  loadLocalStorageToggleSettings(){
    this.uiToggles = this.dataSrv.getLocalStorage('uitoggle') ?  JSON.parse(this.dataSrv.getLocalStorage('uitoggle')) :  this.uiToggles
  }

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
    }
  }

  onMouseMove(event : MouseEvent) {
    if(!this.renderer || this.suspended){
      return
    }
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
    this.mouse.y = - ((event.clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;
    this.mouseRaycaster.setFromCamera(this.mouse, this.camera);
    const mouseIntersects = this.mouseRaycaster.intersectObjects(this.scene.children, true);

    let firstObj = mouseIntersects.map(i=>this.getParentObj(i.object)).filter(o=>o && o.visible)[0]
    if(firstObj){
      firstObj.setMousOverEffect()
      if (firstObj instanceof RobotObject3D || firstObj instanceof MarkerObject3D) {
        firstObj.addMouseClickListener()
        let tip = firstObj instanceof RobotObject3D ? firstObj.getTooltipText() : (firstObj instanceof MarkerObject3D ? firstObj.pointCode : null)
        if(!(firstObj instanceof MarkerObject3D && firstObj.toolTipAlwaysOn)){
          firstObj.showToolTip(tip)
        }
      }
    }
    this.focusedObj = firstObj && (firstObj instanceof RobotObject3D || firstObj instanceof MarkerObject3D) ? firstObj : null

    let blocks = firstObj ? this.getIntersectedObjs(this.focusedRaycaster , firstObj ).filter(o=> o instanceof Extruded2DMesh) : []
    this.blockMeshes.forEach((b: Extruded2DMesh) => {
      b.blockedFocusedObject = blocks.includes(b)
    })

    this.scene.traverse((object: any) => {
      if (object instanceof Object3DCommon && object!=firstObj) {
        object.removeMouseOverEffect()
        if(object instanceof RobotObject3D || object instanceof MarkerObject3D){
          object.removeMouseClickListener()
          if(!(object instanceof MarkerObject3D && object.toolTipAlwaysOn)){
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
    
    this.floorplan?.traverse(c => {
      if ((<any>c).material) {
        (<any>c).material.opacity = 1;
        (<any>c).material.depthWrite = true
      }
    })

    blockingObjs.forEach(b=>{
      (<any>b).material.opacity = 0.3 ;
      (<any>b).material.depthWrite = false
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
    this.$mapCodeChanged.next()
    this.unsubscribeRobotPoses()
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
    this.robotObjs.forEach(r=>this.composer?.removePass(r?.outlinePass))
    this.scene.remove(this.floorplan)
    this.mapMeshes.forEach(m=>this.scene.remove(m))
    this.robotObjs.forEach(r=>r.hideToolTip())
    this.waypointMeshes.forEach(w=>w.hideToolTip())
    this.unsubscribeRobotPoses()
  }

  async loadFloorPlan(floorplan: JFloorPlan, subscribePoses = true) {
    this.resetScene()
    let dimension =  await this.getImageDimension(floorplan.base64Image)
    this.initFloorPlan(floorplan , dimension.width , dimension.height);
    this.initROSmaps(floorplan.mapList)
    this.initWaypoints(floorplan.pointList)
    this.camera.position.set(0, this.floorplan.height  , this.floorplan.height * 0.7 )
    this.camera.lookAt(1, -0.9 , -0.5)
    this.orbitCtrl.update()
    this.camera.position.z += this.floorplan.height * 0.1
    this.pointLight.position.set(dimension.width / 2 ,  dimension.height  ,  dimension.height / 2)
    if(subscribePoses && this.mapCode){
      this.subscribeRobotPoses()
    }
    this.parent.refreshRobotStatus();

    //this.testOutline()
    
    // TBR
    ['waypoint', 'waypointName', 'wall'].forEach(k => this.uiToggled(k))
    // this.orbitCtrl.target.set(1, -0.9 , -0.5)
    // var lookAtVector = new THREE.Vector3(0, 0, -1);
    // lookAtVector.applyQuaternion(this.camera.quaternion);
    // this.orbitCtrl.target.set(1, -0.9 , -0.5)
    //this.orbitCtrl.update()

    // TBR : HOW TO UPDATE CONTROL WITHOUT CHANGING BACK ITS POSITION Z AGAIN??

    //v TESTING v
    this.initCustom3dModel()
    //^ TESTING ^
  }

  onObjProgress = ( xhr )=>{
    if ( xhr.lengthComputable ) {
     this.loadingPercent = Math.round(xhr.loaded / xhr.total * 100)
    }
  };

  async initCustom3dModel() {
    let tenantCode = this.util.getTenantCode()
    let path = `${ASSETS_ROOT}/floorplans/${tenantCode}/${this.floorPlanDataset.floorPlanCode}`
    let settings: { tabletPath?: string, withModel? : boolean, wallHeight : number ,walls : {x:number , y:number}[][], path?: string, scale?: number, position?: { x?: number, y?: number, z?: number }, rotate?: { x?: number, y?: number, z?: number } } | null = await this.dataSrv.getAssets(path + '.json')
    path = this.uiSrv.detectMob() && settings.tabletPath?  settings.tabletPath : (settings?.path ? settings.path : path + '.glb') 
    let transform = (obj: THREE.Group) => {
      obj.rotation.set(settings.rotate?.x ? settings.rotate?.x : 0, settings.rotate?.y ? settings.rotate?.y : 0, settings.rotate?.z ? settings.rotate?.z : 0)
      if (settings?.scale) {
        obj.scale.set(settings?.scale, settings?.scale, settings?.scale)
      }
      obj.position.set(settings.position?.x ? settings.position?.x : 0, settings.position?.y ? settings.position?.y : 0, settings.position?.z ? settings.position?.z : 0)
    }
    // let fileExt = settings?.fileExtension ? settings?.fileExtension : '.glb'
    if (settings && settings?.withModel != false) {
      (<THREE.MeshPhongMaterial>this.floorplan.material).visible = false
      if (path.endsWith(".glb") || path.endsWith(".gltf") ) {
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(ASSETS_ROOT + '/draco/');      
        const loader =  new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);
        loader.load(path, (gltf: GLTF) => {   
          this.loadingPercent = null
          let obj = gltf.scene
          transform(obj)
          this.floorplan.add(obj)
        }, this.onObjProgress)
      } else if (path.endsWith(".obj")) {
        var mtlLoader = new MTLLoader();
        mtlLoader.load(path.substring(0, path.length - 4) + '.mtl', (materials) => {
          materials.preload();
          var objLoader = new OBJLoader();
          objLoader.setMaterials(materials);
          objLoader.load(path, (obj) => {
            this.loadingPercent = null
            transform(obj)
            this.floorplan.add(obj)
          }, this.onObjProgress);
        });
      }
    } 
    if(settings?.walls){
      this.initWalls(settings.walls , settings.wallHeight);
    }
  }

  async getImageDimension(base64 : string) : Promise<{width : number , height : number}>{
    let ret = new Subject()
    THREE.ImageUtils.loadTexture(base64 , undefined , (texture)=> ret.next({width : texture.image.width , height : texture.image.height}))
    return await <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
  }

  async getRobotList(){
    let ticket = this.uiSrv.loadAsyncBegin()
    this.robotLists = await this.dataSrv.getRobotList();
    this.uiSrv.loadAsyncDone(ticket);
  }

  async ngAfterViewInit() {    
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
    this.orbitCtrl.addEventListener( 'change', (v)=> this.onOrbitControlChange(v) );
    document.addEventListener('pointermove', (e)=>this.onMouseMove(e), false);
    setTimeout(() => this.onResize())

    if(this.floorPlanDataset){
     await this.loadFloorPlan(this.floorPlanDataset);
    }

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
    waypoints.forEach(p=>{
      var marker = new MarkerObject3D(this , p.pointCode , p.pointType);
      marker.position.set( p.guiX -this.floorplan.width/2 , this.floorplan?.height/2 - p.guiY , 5)
      this.floorplan.add(marker)
    })
  }

  initFloorPlan(fp : JFloorPlan , fpWidth : number , fpHeight : number){   
    this.floorplan = new FloorPlanMesh(this ,fp.base64Image , fpWidth , fpHeight);
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
    this.dataSrv.subscribeSignalR('arcsPoses' , mapCode)
    this.dataSrv.signalRSubj.arcsPoses.pipe(filter(v => v) , takeUntil(this.$mapCodeChanged)).subscribe(async (poseObj) => { //{mapCode : robotId : pose}
      Object.keys(poseObj[mapCode]).forEach((robotCode)=>{
        let isNewRobot = !this.getRobot(robotCode) 
        let robotData : DropListRobot = this.robotLists.filter(r=>r.robotCode == robotCode)[0]
        if(!robotData){
          console.log(`ERROR : Robot not found : [${robotCode}`)
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
        let robot = this.getRobot(robotCode) ? this.getRobot(robotCode) : new RobotObject3D(this, robotCode, robotData.robotBase, robotData.robotType)
        let oldMapMesh = this.mapMeshes.filter(m => robot && m.robotBase != robotData.robotBase && m.children.includes(robot))[0]
        if (oldMapMesh) {
          oldMapMesh.remove(robot)
        }

        if(!mapMesh.children.includes(robot)){
          mapMesh.add(robot)
          this.refreshRobotColors()
        }

        let pose : {x : number , y : number , angle : number , interval : number} = poseObj[mapCode][robotCode]
        if(robot && mapMesh){
          robot.updatePositionAndRotation(pose)
          if(isNewRobot){
            robot.visible = true
          }
        }
     })
    })
    this.subscribedPoseMapCode = mapCode
  }
  
  unsubscribeRobotPoses() {
    if (this.subscribedPoseMapCode) {
      this.$mapCodeChanged.next()
      this.dataSrv.unsubscribeSignalR('arcsPoses', false, this.subscribedPoseMapCode)
      this.subscribedPoseMapCode = null
    }
  }

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
    }

    dispose(this.scene)
    this.floorplan = null
    this.shaderPass = null
    this.rendererPass = null
    this.pointLight = null
    this.ambientLight = null
    this.camera = null
    this.renderer?.renderLists.dispose()
    this.renderer.dispose()
    this.renderer = null
    this.composer = null
  }
}

class FloorPlanMesh extends Mesh{
  width 
  height
  aabb = new THREE.Box3()
  maxDepth = null
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

class Object3DCommon extends Object3D{
  scene : THREE.Scene = new THREE.Scene()
  outlinePass : OutlinePass
  master : ThreejsViewportComponent
  mouseOverChangeColor = true
  gltf : GLTF
  toolTip : CSS2DObject
  mouseOvered = false
  clickListener
  touchListener
  onClick = new Subject()
  defaultTooltipStyle = {
    padding : '8px',
    borderRadius : '5px',
    lineHeight : '12px',
    fontSize : '14px',
    background : 'rgba( 0, 0, 0, 0.6 )',
    whiteSspace: 'pre'
  }
  defaultOpacity = 1
  _color : number

  set toolTipText(v){
    this.toolTip.element.textContent = v
  }
  get toolTipText(){
    return this.toolTip?.element?.textContent
  }
  constructor(master : ThreejsViewportComponent){
    super()
    this.add(this.scene)
    this.master = master
    this._color = this.master.util.config.robot?.visuals?.[0].fillColor ?  Number(this.master.util.config.robot?.visuals?.[0].fillColor) : 0x00CED1
    this.initToolTip()
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

  showToolTip(text : string = null , position : THREE.Vector3 = null , addonStyle : object = null){
    if(text){
      this.toolTipText = text
    }
    Object.keys(this.defaultTooltipStyle).forEach(k=>{
      this.toolTip.element.style[k] = this.defaultTooltipStyle[k]
    })
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
    div.className = 'label-3js';
    div.textContent = '';
    this.toolTip = new CSS2DObject(div);
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

  addMouseClickListener() {
    if (this.clickListener || this.touchListener) {
      return
    }    
    this.master.container.style.cursor = 'pointer'
    this.clickListener =  this.master.ngRenderer.listen(this.master.container,'click',()=> this.onClick.next())
    this.touchListener =  this.master.ngRenderer.listen(this.master.container,'touchstart',()=> this.onClick.next())
  }

  removeMouseClickListener() {
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
  }

  setOpactiy(opacity : number){
    this.getMaterials(this).forEach(o=>{
      o.depthWrite = opacity >= this.defaultOpacity
      o.opacity = opacity
    })
  }
}

class MarkerObject3D extends Object3DCommon {
  // 95 37 159
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
  set toolTipAlwaysOn(v){
    this._toolTipAlwaysOn = v
    this.toolTip.position.set(0, (v ? -0.2 : 1 )* (this.glbSettings.size * 20) * this.master.ROSmapScale  , 0)
    if(v){
      this.showToolTip(this.pointCode, undefined, { fontSize: '10px', lineHeight: '0px', background: 'rgba(0,0,0,0.4)', whiteSspace: 'pre' })
    }else{
      this.hideToolTip()
    }
  }
  get toolTipAlwaysOn(){
    return this._toolTipAlwaysOn
  }
  _toolTipAlwaysOn = false

  constructor( master: ThreejsViewportComponent , private _name : string , private _pointType = 'NORMAL'){
    super(master)
    this.pointCode = _name
    this.pointType = _pointType
    this.loader = new GLTFLoader();
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
}

export class RobotObject3D extends Object3DCommon{
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
    vector :  Vector3
    rotation : number
    vectorDiff : Vector3
    rotationDiff : number
    movingRef : any
    ticksRemaining : number
  }
  get importSetting(){
    return this.robotImportSetting[this.robotType] ? this.robotImportSetting[this.robotType] : this.robotImportSetting.BASE
  }
  
  robotImportSetting = {
    BASE: {
      path : ASSETS_ROOT + "/robot.glb",
      scale : 30,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 0, y: 0, z: 180 / radRatio },
      alertPositionZ : 45
    },
    FLOOR_SCRUB: {
      path : ASSETS_ROOT + "/robot_floor_scrub.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      alertPositionZ : 45
    },
    MOBILE_CHAIR:{
      path : ASSETS_ROOT + "/robot_mobile_chair.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      alertPositionZ : 45
    },
    PATROL: {
      path : ASSETS_ROOT + "/robot_patrol.glb",
      scale : 30,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 0, y: 0, z: 180 / radRatio },
      alertPositionZ : 45
      // recolorMaterials : ['0.019608_0.000000_0.000000_0.000000_0.000000']
      // replaceColors:[{r: 0 , g : 0 , b : 0 , tolerance : 0.1}], 
    },
    DELIVERY: {
      path : ASSETS_ROOT + "/robot_delivery.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: {x : NORMAL_ANGLE_ADJUSTMENT, y: 0, z: 180 / radRatio },
      alertPositionZ : 40
    },
    DISINFECTION: {
      path : ASSETS_ROOT + "/robot_disinfection.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      alertPositionZ : 40
    },
    FORKLIFT: {
      path : ASSETS_ROOT + "/robot_forklift.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      alertPositionZ : 40
    },
    STOCKTAKING: {
      path : ASSETS_ROOT + "/robot_stocktaking.glb",
      scale : 0.6,
      position: { x: 0, y: 0, z: -12.5 },
      rotate: { x: 90 / radRatio, y:  180 / radRatio , z: 0 },
      alertPositionZ : 40
    },

  }

  pointerSetting : Import3DModelSettings = {
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
    this._offline = v
    // this.gltf?.scene.traverse((s: any) => {
    //   if (s.isMesh === true && s.material?.originalHex != null) {
    //     console.log(this.offlineColor)
    //     s.material.emissive.setHex(v ? this.offlineColor : s.material?.originalHex)
    //   }
    // });
    // this.opacity =  v ? 0.5 : 1
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
  constructor( master: ThreejsViewportComponent , _robotCode : string , _robotBase : string , _robotType : string){
    super(master)
    this.add(this.scene)
    this.robotImportSetting = this.master.util.config.MAP_3D?.ROBOT ? this.master.util.config.MAP_3D.ROBOT : this.robotImportSetting
    this.pointerSetting = this.master.util.config.MAP_3D?.POINTER ? this.master.util.config.MAP_3D.POINTER : this.pointerSetting
    this.robotCode = _robotCode;
    this.robotBase = _robotBase;
    this.robotType = _robotType;
    this.master = master;
    // this.master.robots = this.master.robots.filter(r=>r != this).concat(this)
    this.loader = new GLTFLoader();
    //
    let ticket = this.master.uiSrv.loadAsyncBegin()
    let setting = this.importSetting
    this.loader.load(setting.path ,(gltf : GLTF)=> {
      new GLTFLoader().load(this.alertIconPath, (alertGltf : GLTF)=>{
        this.gltf = gltf       
        this.alertIcon = alertGltf.scene
        new Object3DCommon(this.master).getMaterials(  this.alertIcon ).forEach(m=>m.color.set(0xFF0000))
        this.alertIcon.rotateX(-NORMAL_ANGLE_ADJUSTMENT)
        this.alertIcon.scale.set(this.alertIconSetting.size , this.alertIconSetting.size , this.alertIconSetting.size)
        this.alertIcon.position.z = setting.alertPositionZ ? setting.alertPositionZ : this.alertIconSetting.positionZ
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
          this.offlineTexture = texture
          this.offlineTexture.wrapS = THREE.RepeatWrapping;
          this.offlineTexture.wrapT = THREE.RepeatWrapping;
          this.changeMainColor(this.color)
        })
        this.changeMainColor(this.color)
        let robotInfo = this.master.parent.robotInfos.filter(r=>r.robotCode == this.robotCode)[0]
        this.offline = robotInfo?.robotStatus == 'UNKNOWN'
        this.alert = robotInfo?.alert!= null && robotInfo.alert.length > 0 
        this.master.uiSrv.loadAsyncDone(ticket)
      })
    })

    this.toolTip.position.set(0, 0 , 25 );
    this.visible = false
    this.onClick.subscribe(()=>{
      this.master.robotClicked.emit({id:this.robotCode , object : this})
    })
    // var testColors = [0xFF66B9 , 0xFFD700 , 0x87CEFA, 0x9ACD32, 0xFF8C00 , 0xB3B3FF]
    // setTimeout(() => this.changeMainColor(testColors[this.master.robotObjs.indexOf(this)]), 5000)

    // if( this.master.outlinePass){
    //   this.master.outlinePass.enabled = true
    //   this.master.outlinePass.selectedObjects = (this.master.outlinePass.selectedObjects ? this.master.outlinePass.selectedObjects : []).concat(this)
    // }
  }

  updatePositionAndRotation(pose : {x : number  , y : number , angle : number , interval : number}){
    let vector =  this.master.getConvertedRobotVector(pose.x , pose.y , <MapMesh>this.parent) 
    const frameMs = 50
    const totalTicks =  Math.max(1 , Math.ceil(Math.min((pose.interval ? pose.interval : frameMs) , 3000) / frameMs))
    let diffAngle = (pose.angle * radRatio - 90 - this.rotation.z * radRatio) 
    diffAngle = diffAngle > 180 ? (diffAngle - 360) : diffAngle < -180 ? (360 + diffAngle) : diffAngle

    let forceUpdate = (v : Vector3 , r : number)=>{
      if(this.targetPose?.movingRef){
        this.targetPose.ticksRemaining = 0
        clearInterval(this.targetPose.movingRef)
      }
      this.position.set(v.x, v.y, v.z) //this.position.set(v.x , v.y , v.z)      
      this.position.z = this.getPositionZ(this.position.x , this.position.y )
      this.rotation.z = r
    }

    if(!this.targetPose){//just spawn or not using smooth transition
      forceUpdate(vector , pose.angle - 90 / radRatio)
    }else if(this.targetPose.ticksRemaining > 0 ){ 
      forceUpdate(this.targetPose.vector , this.targetPose.rotation)
    }

    if(this.master.util.config.MOVE_USING_TRANSITION){
      this.targetPose = {
        vector : vector,
        rotation :  (pose.angle - 90 / radRatio),
        vectorDiff : new Vector3(vector.x - this.position.x , vector.y - this.position.y , vector.z),
        rotationDiff : diffAngle / radRatio,        
        ticksRemaining :totalTicks,
        movingRef : setInterval(()=> {
          if( this.targetPose.ticksRemaining > 1){ // not arrived
            this.position.x += this.targetPose.vectorDiff.x / totalTicks
            this.position.y += this.targetPose.vectorDiff.y / totalTicks
            this.rotation.z += this.targetPose.rotationDiff / totalTicks 
            this.position.z = this.getPositionZ(this.position.x , this.position.y )
            this.targetPose.ticksRemaining -= 1
          }else{
            forceUpdate(this.targetPose.vector , this.targetPose.rotation)
          }
        }, frameMs)
      }
    }else{
      forceUpdate(vector , pose.angle - 90 / radRatio)      
    } 
  }

  changeMainColor(color: number) {
    // let colorStr = this._color.toString(16).padStart(6,'0')
    // let colorDelta =  -40
    // let adjustedColor = parseInt ((
    //                         Math.max(0, parseInt(colorStr.substring(0, 2), 16) + colorDelta).toString(16).padStart(2,'0') + 
    //                         Math.max(0, parseInt(colorStr.substring(2, 4), 16) + colorDelta).toString(16).padStart(2,'0') + 
    //                         Math.max(0, parseInt(colorStr.substring(4, 6), 16) + colorDelta).toString(16).padStart(2,'0')) , 
    //                     16)
    // console.log(adjustedColor)
    this.outlinePass?.visibleEdgeColor.set(this.offline ? this.offlineColor : color)
    this.outlinePass?.hiddenEdgeColor.set(this.offline ? this.offlineColor : color)
    if (this.offline && this.outlinePass) {
      this.outlinePass.usePatternTexture = true
      this.outlinePass.patternTexture = this.offlineTexture
    } else if (this.outlinePass) {
      this.outlinePass.usePatternTexture = false
    }
    let materials: MeshStandardMaterial[] = new Object3DCommon(this.master).getMaterials(this.gltf.scene)
    materials.filter(m => this.importSetting.recolorMaterials?.includes(m.name) || 
                          (this.importSetting.replaceColors && 
                           this.importSetting.replaceColors.some(c=>
                            c.r - c.tolerance <= m.color.r && c.r + c.tolerance >= m.color.r &&
                            c.g - c.tolerance <= m.color.g && c.g + c.tolerance >= m.color.g &&
                            c.b - c.tolerance <= m.color.b && c.b + c.tolerance >= m.color.b )
                          )
                    ).forEach(m => {
                      m.color.set(color)
                    });
    new Object3DCommon(this.master).getMaterials(this.frontFacePointer).forEach(m=>{
      m.color.set(color)
    })
  }


  addFrontFacePointer() {
    //this.frontFacePointer = new Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshPhongMaterial({ map: THREE.ImageUtils.loadTexture('assets/3D/pointer.png'), opacity: 0.5, transparent: true }))
    const geometry = new THREE.RingGeometry(0.2, 1, 32 , 1 , 35 /radRatio , 110 /radRatio);
    const material = new THREE.MeshBasicMaterial({ color: 0xffff00, side: THREE.FrontSide , transparent : true , opacity : 0.4});
    this.frontFacePointer = new THREE.Mesh(geometry, material);
    let setting = this.pointerSetting
    // this.frontFacePointer.rotateX(NORMAL_ANGLE_ADJUSTMENT);
    //this.frontFacePointer.rotateZ(180 / radRatio);
    this.frontFacePointer.position.set(setting.position.x , setting.position.y , setting.position.z)
    this.frontFacePointer.scale.set(setting.scale , setting.scale  , setting.scale )
    this.add(this.frontFacePointer)
  }

  getTooltipText(){
    return `${this.robotCode} ${this.offline ? this.master.uiSrv.translate("\n (Offline)") : ""}` 
  }

  getPositionZ(x: number, y: number) {
    if(!this.master.floorplan.maxDepth ){
      return 15
    }
    let aabbWidth = Math.abs(this.aabb.max.x - this.aabb.min.x)
    let aabbHeight = Math.abs(this.aabb.max.y - this.aabb.min.y)
    let castRayVecs = [new THREE.Vector3(x, y, 0), new THREE.Vector3(x + aabbWidth / 2, y + aabbHeight / 2, 0), new THREE.Vector3(x + aabbWidth / 2, y - aabbHeight / 2, 0), new THREE.Vector3(x - aabbWidth / 2, y + aabbHeight / 2, 0), new THREE.Vector3(x - aabbWidth / 2, y - aabbHeight / 2, 0)]
    let distances = []
    const offset = 15
    const casterHeight = this.master.floorplan.maxDepth
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

class Import3DModelSettings {
  type? : string = "GLB"
  path : string
  scale? : number = 1
  rotate ? : number = 0
  position? : {
    x : number 
    y : number 
    z : number
  }
  recolorMaterials?: string[]
  replaceMaterial? : Object //key : material name  , values : image path
  replaceColors?: {r:number , g: number , b : number , tolerance : number}[]
  alertPositionZ ? : number
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
      //   // //let container = this.mapContainerStore[mapCode] //  + robotBase //
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