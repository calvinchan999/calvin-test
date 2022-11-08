import { Component, OnInit, ViewChild , NgZone, HostListener, EventEmitter, Renderer2, Output , Input} from '@angular/core';
import { ThCamera, ThCanvas, ThDragControls, ThObject3D , ThOrbitControls, ThScene } from 'ngx-three';
import { UiService } from 'src/app/services/ui.service';
import * as THREE from 'three';
import { ThGLTFLoader } from 'ngx-three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DragControls } from 'three/examples/jsm/controls/DragControls';
import { AmbientLight, DirectionalLight, DoubleSide, Mesh, Object3D, ShapeGeometry } from 'three';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService, JFloorPlan, JMap, JPoint } from 'src/app/services/data.service';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';
import { radRatio } from '../drawing-board/drawing-board.component';
import { Subject } from 'rxjs';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer'; //three-css2drender
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Geometry } from 'three/examples/jsm/deprecated/Geometry';
import { EffectComposer  } from  'three/examples/jsm/postprocessing/EffectComposer.js' ;
import {  RenderPass  } from  'three/examples/jsm/postprocessing/RenderPass' ;
import {  ShaderPass  } from  'three/examples/jsm/postprocessing/ShaderPass' ;
import {  OutlinePass  } from  'three/examples/jsm/postprocessing/OutlinePass' ;
import {  FXAAShader  } from  'three/examples/jsm/shaders/FXAAShader' ;
import { getBorderVertices } from 'src/app/utils/math/functions';

const NORMAL_ANGLE_ADJUSTMENT =  - 90 / radRatio
@Component({
  selector: 'uc-3d-viewport',
  templateUrl: './threejs-viewport.component.html',
  styleUrls: ['./threejs-viewport.component.scss']
})
export class ThreejsViewportComponent implements OnInit {
  public selected = false;
  public readonly glbPath = `assets/3D/DamagedHelmet.glb`;
  public loadingTicket = null
  @ViewChild('scene') scene : ThScene
  @ViewChild('canvas') canvas 
  @ViewChild('camera') camera : ThCamera
  @Output() robotClicked = new EventEmitter<any>();
  @Input() floorPlanDataset : JFloorPlan= null;
  // @ViewChild('orbitControl') 
  orbitCtrl : OrbitControls
  container : HTMLElement
  dragCtrl : DragControls
  robots : RobotObject3D[] = []
  maps : MapMesh[] = []
  floorplan : FloorPlanMesh
  $onDestroy = new Subject()
  renderer : THREE.Renderer
  labelRenderer : CSS2DRenderer
  suspended = false
  composer : EffectComposer
  effectFXAA 
  outlinePass : OutlinePass
  ROSmapScale = 1
  mapCode = ''
  constructor(public uiSrv: UiService , public ngZone : NgZone , public util : GeneralUtil , public dataSrv : DataService ,  public ngRenderer:Renderer2) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }

  mouse = new THREE.Vector2();
  mouseRaycaster = new THREE.Raycaster();
  focusedRaycaster = new THREE.Raycaster();
  cameraRayCaster = new THREE.Raycaster();

  @HostListener('window:resize', ['$event'])
  onResize() {
    this.labelRenderer.setSize( this.container.clientWidth, this.container.clientHeight )
  }

  animate() {
    if(!this.suspended){
      this.labelRenderer.render( this.scene.objRef, this.camera.objRef );
      this.computeRayCaster()
    }
  }

  getParentObj(obj: any , type : any = Object3DCommon) {
    if (obj instanceof type) {
      return obj
    } else if (obj.parent) {
      return this.getParentObj(obj.parent , type)
    } else {
      return null
    }
  }


  onMouseMove(event : MouseEvent) {
    if(!this.canvas?._rendererCanvas || this.suspended){
      return
    }
    const rect = this.canvas.rendererCanvas.nativeElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / (rect.right - rect.left)) * 2 - 1;
    this.mouse.y = - ((event.clientY - rect.top) / (rect.bottom - rect.top)) * 2 + 1;
    this.mouseRaycaster.setFromCamera(this.mouse, this.camera.objRef);
    const mouseIntersects = this.mouseRaycaster.intersectObjects(this.scene.objRef.children, true);

    let firstObj = mouseIntersects.map(i=>this.getParentObj(i.object)).filter(o=>o && o.visible)[0]
    if(firstObj){
      firstObj.setMousOverEffect()
      if (firstObj instanceof RobotObject3D || firstObj instanceof MarkerObject3D) {
        firstObj.addMouseClickListener()
        let tip = firstObj instanceof RobotObject3D ? firstObj.robotCode : (firstObj instanceof MarkerObject3D ? firstObj.pointCode : null)
        firstObj.showToolTip(tip)
      }
    }

    let blocks = firstObj ? this.getIntersectedBlocks(this.focusedRaycaster , firstObj ) : []
    this.floorplan?.children.filter(c => c instanceof Extruded2DMesh).forEach((b: Extruded2DMesh) => {
      b.blockedFocusedObject = blocks.includes(b)
    })

    this.scene.objRef.traverse((object: any) => {
      if (object instanceof Object3DCommon && object!=firstObj) {
        object.removeMouseOverEffect()
        if(object instanceof RobotObject3D || object instanceof MarkerObject3D){
          object.removeMouseClickListener()
          object.hideToolTip()
        }
      }
    });


  }

  getIntersectedBlocks(caster : THREE.Raycaster, toObject : Object3D , frObject : Object3D = this.camera.objRef) : Extruded2DMesh[]{   
    let frObjPos = new THREE.Vector3();
    let toObjPos = new THREE.Vector3();
    frObject.getWorldPosition(frObjPos);
    toObject.getWorldPosition(toObjPos)
    let direction = new THREE.Vector3().subVectors( toObjPos , frObjPos).normalize()
    caster.set(frObjPos, direction);
    const camIntersects =  caster.intersectObjects(this.scene.objRef.children, true)
    const objectIntersection = camIntersects.filter(i=> this.getParentObj(i.object , Object3DCommon) == toObject)[0]
    const blocks =[ ... new Set(camIntersects.filter(i=> this.getParentObj(i.object , Extruded2DMesh) && camIntersects.indexOf(i) < camIntersects.indexOf(objectIntersection)).
                                              map(i=> this.getParentObj(i.object , Extruded2DMesh))
                                  )
                    ]
    return blocks
  }


  computeRayCaster(){
    let cameraPostion = new THREE.Vector3();
    this.camera.objRef.getWorldPosition(cameraPostion);
    let transparentBlocks = []
    this.robots.forEach(r => {
      transparentBlocks = transparentBlocks.concat(this.getIntersectedBlocks(this.cameraRayCaster, r))
    })
    this.floorplan?.children.filter(c => c instanceof Extruded2DMesh).forEach((b: Extruded2DMesh) => {
      b.setOpactiy(transparentBlocks.includes(b) || b.blockedFocusedObject ? b.transparentOpacity : b.defaultOpacity)
    })
  }

  ngOnInit(): void {
    
  }

  getRobot(robotCode : string): RobotObject3D{
    return this.robots.filter(r=>r.robotCode == robotCode)[0]
  }

  getMapMesh( robotBase : string = ""):MapMesh{
    return this.maps.filter(m=>  m.robotBase == robotBase)[0]
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  initLabelRenderer(){
    const canvasHTML : HTMLElement =  this.canvas.rendererCanvas.nativeElement
    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize( canvasHTML.clientWidth  , canvasHTML.clientHeight );
    this.labelRenderer.domElement.style.position = 'absolute';
    this.container.appendChild( this.labelRenderer.domElement );
  }

  async loadFloorPlan(floorplan : JFloorPlan){
    let dimension =  await this.getImageDimension(floorplan.base64Image)
    this.initFloorPlan(floorplan , dimension.width , dimension.height);
    this.initROSmaps(floorplan.mapList)
    this.initWaypoints(floorplan.pointList)
    //this.initBlocks() // TBR
    this.camera.objRef.position.set(this.floorplan.width / 10, this.floorplan.height / 2, this.maps[0].scale.x * 20 * 30)
    this.camera.objRef.lookAt(0, - this.floorplan.height / 10, this.maps[0].scale.x * 20)
  }

  async getImageDimension(base64 : string) : Promise<{width : number , height : number}>{
    let ret = new Subject()
    THREE.ImageUtils.loadTexture(base64 , undefined , (texture)=> ret.next({width : texture.image.width , height : texture.image.height}))
    return await <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
  }

  async ngAfterViewInit() {
    this.renderer = this.canvas.engServ.renderer
    this.container =  this.canvas.rendererCanvas.nativeElement.parentElement
    this.initLabelRenderer()
    this.orbitCtrl = new OrbitControls( this.camera.objRef, this.labelRenderer.domElement );
    this.orbitCtrl.addEventListener( 'change', (v)=> this.onOrbitControlChange(v) );
    document.addEventListener('pointermove', (e)=>this.onMouseMove(e), false);
    if(this.floorPlanDataset){
      await this.loadFloorPlan(this.floorPlanDataset)
      this.subscribeRobotPoses();
    }
    // this.floorplan = new FloorPlanMesh(this ,FP_BASE64 , fpWidth , fpHeight);
    // this.scene.objRef.add(this.floorplan );
    // this.initROSmaps(JSON.parse(MAP_LIST));
    // await this.loadFloorPlan(JSON.parse(FP_DATASET))
 

    // this.subscribeRobotPoses();

    // this.initBlocks()
  }

  initWaypoints(waypoints : JPoint[]){
    waypoints.forEach(p=>{
      var marker = new MarkerObject3D(this , p.pointCode);
      marker.position.set( p.guiX -this.floorplan.width/2 , this.floorplan?.height/2 - p.guiY , 5)
      this.floorplan.add(marker)
    })
  }

  initFloorPlan(fp : JFloorPlan , fpWidth : number , fpHeight : number){
    let prefix = 'data:image/png;base64,'
    let base64 = (fp.base64Image.startsWith(prefix) ? '': prefix) + fp.base64Image
    
    this.floorplan = new FloorPlanMesh(this ,base64 , fpWidth , fpHeight);
    this.scene.objRef.add(this.floorplan );
  }

  initROSmaps(mapList : JMap[] ){
    // const mapList : JMap[] = JSON.parse(MAP_LIST)
    this.ROSmapScale = mapList[0] ? mapList[0]?.transformedScale : this.ROSmapScale
    this.mapCode = mapList[0] ? mapList[0]?.mapCode : this.mapCode
    mapList.forEach(m=>{
      let prefix = 'data:image/png;base64,'
      let base64 = (m.base64Image.startsWith(prefix) ? '': prefix) + m.base64Image
      const mapPlane = new MapMesh(this, m.mapCode, m.robotBase , base64 , m.transformedScale, m.transformedAngle , m.transformedPositionX ,  m.transformedPositionY , m.imageWidth , m.imageHeight , m.originX , m.originY );
      this.scene.objRef.add(mapPlane)
    })

    // let robot = new RobotObject3D(this , "RV-ROBOT-103");
    // mapPlane.addRobot(robot)
  }

  initBlocks(){
    [BLOCK1_VERTICES , BLOCK2_VERTICES , BLOCK3_VERTICES , BLOCK4_VERTICES].forEach(vertices=>{
      let block = new Extruded2DMesh(this , JSON.parse(vertices))
      this.floorplan.add(block)
      block.position.set(-this.floorplan.width/2 , - this.floorplan.height/2 , this.floorplan.position.z + 1);
    });
  }

  public subscribeRobotPoses(mapCode = this.mapCode){
    console.log(mapCode)
    this.dataSrv.subscribeSignalR('arcsPoses' , mapCode)
    this.$onDestroy.subscribe(()=>this.dataSrv.unsubscribeSignalR('arcsPoses' , false , mapCode))
    this.dataSrv.signalRSubj.arcsPoses.pipe(filter(v => v) , takeUntil(this.$onDestroy)).subscribe(async (poseObj) => { //{mapCode : robotId : pose}
      Object.keys(poseObj[mapCode]).forEach((robotCode)=>{
        let robot = this.getRobot(robotCode) ?   this.getRobot(robotCode) : new RobotObject3D(this , robotCode , TEST_ROBOTS_BASE_MAP[robotCode] )
        let mapMesh = this.getMapMesh(robot.robotBase)
        if(!mapMesh.children.includes(robot)){
          mapMesh.add(robot)
        }
        let pose : {x : number , y : number , angle : number} = poseObj[mapCode][robotCode]
        if(robot && mapMesh){
          robot.visible = true
          let vector =  this.getConvertedRobotVector(pose.x , pose.y , mapMesh)
          robot.position.set(vector.x, vector.y, vector.z)
          robot.rotation.set(robot.rotation.x , robot.rotation.y , (pose.angle - 90 / radRatio)  ) 
        }
     })

    })
  }
  
  public onOrbitControlChange(evt) {

  }

  getConvertedRobotVector(rosX: number, rosY: number, map: MapMesh ): THREE.Vector3 {
    let retX = (rosX - map.originX) * map.meterToPixelRatio - map.width / 2
    let retY = (map.originY - rosY) * map.meterToPixelRatio + map.height / 2
    return new THREE.Vector3(retX, -retY, 20)
  }
}

class FloorPlanMesh extends Mesh{
  floorPlanCode
  width 
  height
  constructor(public master: ThreejsViewportComponent , base64Image : string , width : number , height : number){
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map : THREE.ImageUtils.loadTexture(base64Image ) }))
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
  constructor(public master: ThreejsViewportComponent , mapCode : string , robotBase : string,base64 : string, scale : number, angle : number , x  : number , y  : number , width  : number , height  : number , originX : number , originY : number){
    super(new THREE.PlaneGeometry(width, height), new THREE.MeshLambertMaterial({ map : THREE.ImageUtils.loadTexture(base64) , opacity: 0.5 , transparent :true , visible : false }))
    this.mapCode = mapCode
    this.robotBase = robotBase
    this.master.maps = this.master.maps.filter(m=>m!= this).concat(this)
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
    this.scale.set(scale , scale , 1 )
  }

  // addRobot(robot : RobotObject3D){
  //   // robot.rotateY(1.57)
  //   this.add(robot)
  //   this.robots = this.robots.filter(r=>r!=robot).concat(robot)
  // }

}

class Object3DCommon extends Object3D{
  master : ThreejsViewportComponent
  mouseOverChangeColor = true
  gltf : GLTF
  toolTip : CSS2DObject
  mouseOvered = false
  clickListener
  onClick = new Subject()

  set toolTipText(v){
    this.toolTip.element.textContent = v
  }
  get toolTipText(){
    return this.toolTip?.element?.textContent
  }
  constructor(master : ThreejsViewportComponent){
    super()
    this.master = master
    this.initToolTip()
  }


  setTooltipText(){
    // if(this.toolTip){
    //   this.toolTip.
    // }
  }

  showToolTip(text : string = null , position : THREE.Vector3 = null){
    if(text){
      this.toolTipText = text
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
    div.textContent = 'test';
    div.style.padding = '8px';
    div.style.borderRadius = '5px';
    div.style.lineHeight = '12px'
    div.style.background = 'rgba( 0, 0, 0, .6 )'
    this.toolTip = new CSS2DObject(div);
    this.toolTip.position.set(0, 40 , 0);
    this.toolTip.layers.set(0);
  }

  storeOriginalMaterialData(){
    if(!this.gltf){
      return
    }
    this.gltf.scene.traverse((object: any) => {
      if (object.isMesh === true) {
       object.material.originalColor = object.material.color.clone();
       object.material.originalHex = object.material.emissive.getHex();
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
    this.gltf.scene.traverse( (s : any)=> {      
      if (s.isMesh === true && s.material?.originalHex!= null){
        s.material.emissive.setHex(color)
      } 
    } );
  }

  removeMouseOverEffect(){
    if(!this.gltf || !this.mouseOvered ){
      return
    }
    this.gltf.scene.traverse( (s : any)=> {      
      if (s.isMesh === true && s.material?.originalHex!=null){
        s.material.emissive.setHex( s.material.originalHex )
      } 
    } );
  }

  addMouseClickListener() {
    if (this.clickListener) {
      return
    }    
    this.master.container.style.cursor = 'pointer'
    this.clickListener =  this.master.ngRenderer.listen(this.master.container,'click',()=> this.onClick.next())
  }

  removeMouseClickListener() {
    if (this.clickListener) {
      this.master.container.style.cursor = 'default'
      this.clickListener()
      this.clickListener = null
    }
  }

  // reColor(color : number){
  //   if(!this.gltf){
  //     return
  //   }
  //   this.gltf.scene.traverse( (s : any)=> {      
  //     if (s.isMesh === true && s.material?.originalColor){
  //       s.material.color.set(color);
  //     } 
  //   } );
  // }
}

class MarkerObject3D extends Object3DCommon {
  pointCode : string
  readonly size : number = 2
  loader : GLTFLoader
  readonly glbPath = "assets/3D/pin.glb"
  constructor( master: ThreejsViewportComponent , private _name : string){
    super(master)
    this.pointCode = _name
    this.toolTip.position.set(0 , 50 , 0)
    this.loader = new GLTFLoader();
    let ticket = this.master.uiSrv.loadAsyncBegin()
     this.loader.load(this.glbPath ,(gltf : GLTF)=> {
       this.gltf = gltf
       let scale = this.size * this.master.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO
       gltf.scene.rotateX(- NORMAL_ANGLE_ADJUSTMENT)
       gltf.scene.scale.set(scale, scale, scale)
       gltf.scene.position.set(0, 0, 5)
       this.add(gltf.scene)
       this.storeOriginalMaterialData()
       this.master.uiSrv.loadAsyncDone(ticket)
    })
  }
}

class RobotObject3D extends Object3DCommon{
  loader : GLTFLoader
  robotCode : string
  robotBase : string
  master : ThreejsViewportComponent
  readonly size = 0.8
  // mesh : Mesh  
  readonly glbPath = "assets/3D/robot.glb" // Raptor Heavy Planetary Crawler by Aaron Clifford [CC-BY] via Poly Pizza
  // Remote car by Nutpam [CC-BY] via Poly Pizza
  constructor( master: ThreejsViewportComponent , _robotCode : string , _robotBase : string){
    super(master)
    this.robotCode = _robotCode;
    this.robotBase = _robotBase
    this.master = master
    this.master.robots = this.master.robots.filter(r=>r != this).concat(this)
    this.loader = new GLTFLoader();
    let ticket = this.master.uiSrv.loadAsyncBegin()
     this.loader.load(this.glbPath ,(gltf : GLTF)=> {
      this.gltf = gltf
      let scale =  this.size * this.master.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO
      this.add(gltf.scene)      
      this.gltf.scene.scale.set(scale ,scale ,scale)
      this.gltf.scene.rotateX( - NORMAL_ANGLE_ADJUSTMENT)
      this.storeOriginalMaterialData()
      this.master.uiSrv.loadAsyncDone(ticket)
    })
    this.visible = false
    this.onClick.subscribe(()=>{
      this.master.robotClicked.emit({id:this.robotCode , object : this})
    })
    this.master.robots = this.master.robots.filter(r=>r!= this).concat(this)
  }
  
}


class Extruded2DMesh extends Mesh{
  shapeGeom : THREE.ExtrudeGeometry
  blockedFocusedObject = false
  readonly wallThickness = 0.3
  readonly defaultOpacity = 0.8
  readonly transparentOpacity = 0.15
  constructor(public master : ThreejsViewportComponent , private vertices : {x : number ,y:number}[]){
    super();
    const shape = new THREE.Shape(); 
    const extrudeSettings = {
      steps: 1,
      depth: 100,
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

    const hole = new THREE.Shape()
    let holeVertices = getBorderVertices(vertices , - this.wallThickness * this.master?.ROSmapScale * this.master.util.config.METER_TO_PIXEL_RATIO)
    holeVertices.forEach(v=>{
      if(holeVertices.indexOf(v) == 0){
        hole.moveTo(v.x , this.master.floorplan.height -  v.y)

      }else{
        hole.lineTo(v.x , this.master.floorplan.height - v.y)
      }
    })

    hole.lineTo(holeVertices[0].x, this.master.floorplan.height - holeVertices[0].y)    

    shape.holes.push(hole);

    this.shapeGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    var materials = [
      new THREE.MeshPhongMaterial({ color: 0x777777, opacity: this.defaultOpacity, transparent: true }),
      new THREE.MeshPhongMaterial({ color: 0xEAE6EA, opacity: this.defaultOpacity, transparent: true , side : THREE.DoubleSide  }) //0xEAE6EA
    ]

    super(this.shapeGeom, materials);
    // this.shapeGeom.computeVertexNormals();
    // this.shapeGeom.computeBoundingSphere();
    // this.shapeGeom.computeBoundingBox();
    // this.shapeGeom.computeTangents();
    // this.shapeMesh.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1))
    // this.shapeMesh.scale.set(-1,1,1)
  }

  setOpactiy(opacity : number){
    (<any>this.material).forEach(o=>{
      o.opacity = opacity
    })
  }

}


       // initLights(scene) {
  //   // const light = new THREE.DirectionalLight(0xFFFFFF);
  //   // light.intensity = 1;
  //   // light.position.set(1000, 1000, 100);
  //   // scene.add(light); 
  
  //   // const ambient = new THREE.AmbientLight( 0x80ffff );
  //   // ambient.intensity = 0.2;
  //   // scene.add(ambient); 
  // }

  // initShaders() {
  //   // this.composer = new EffectComposer(this.renderer);

  //   // const renderPass = new RenderPass(this.scene.objRef, this.camera.objRef);
  //   // this.composer.addPass(renderPass);

  //   // this.outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), this.scene.objRef, this.camera.objRef);
  //   // this.composer.addPass(this.outlinePass);

  //   // const textureLoader = new THREE.TextureLoader();
  //   // textureLoader.load('textures/tri_pattern.jpg', function (texture) {

  //   //   this.outlinePass.patternTexture = texture;
  //   //   texture.wrapS = THREE.RepeatWrapping;
  //   //   texture.wrapT = THREE.RepeatWrapping;

  //   // });

  //   // this.effectFXAA = new ShaderPass(FXAAShader);
  //   // this.effectFXAA.uniforms['resolution'].value.set(1 / window.innerWidth, 1 / window.innerHeight);
  //   // this.composer.addPass(this.effectFXAA);
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



const TEST_ROBOTS_BASE_MAP = {
  "RV-ROBOT-103" : "WC",
  "RV-ROBOT-104" : "PATROL",
  "Mobilechair-02" : "DEFAULT"
}

const BLOCK1_VERTICES = `[{"x":99.02021985708224,"y":267.2522632772183},{"x":170.25654617656147,"y":266.30885246868274},{"x":171.67184476950354,"y":405.4625135450282},{"x":156.57546081761444,"y":405.4625135450282},{"x":159.8778074045427,"y":726.6950904657913},{"x":909.8634512709015,"y":722.744217751932},{"x":904.6554591338161,"y":217.79894773168402},{"x":883.9066521146965,"y":217.79894773168402},{"x":883.845186132649,"y":57.19247468823681},{"x":96.52106182998074,"y":62.65031168422087}]`
const BLOCK2_VERTICES = `[{"x" : 665 , "y": 782} , {"x" : 665 , "y": 948} , {"x" : 591 , "y": 948} , {"x" : 591 , "y": 1026},{"x" : 905 , "y": 1026} ,{"x" : 905 , "y": 782}]`
const BLOCK3_VERTICES = `[{"x" : 415 , "y": 782} , {"x" : 660 , "y": 782} , {"x" : 660 , "y": 945} , {"x" : 415 , "y": 945} ]`
const BLOCK4_VERTICES = `[{"x" : 105 , "y": 782} , {"x" : 410 , "y": 782} , {"x" : 410 , "y": 945} , {"x" : 105 , "y": 945} ]`
