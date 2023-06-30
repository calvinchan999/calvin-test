import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnInit, ViewChild, HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { filter, retry, take } from 'rxjs/operators';
import {  Subject } from 'rxjs';
import { DataService} from 'src/app/services/data.service';
import { DropListBuilding, DropListMap, JFloorPlan, JLift3DModel, JMap, MapJData, SaveRecordResp, ShapeJData } from 'src/app/services/data.models';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent, radRatio } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import * as PIXI from 'pixi.js';
import { TabStripComponent } from '@progress/kendo-angular-layout';
import { AuthService } from 'src/app/services/auth.service';
import { SaMapComponent } from 'src/app/standalone/sa-map/sa-map.component';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';
import { trimAngle } from 'src/app/utils/math/functions';
import { Observable, of } from 'rxjs';
import { PixiGraphicStyle, DRAWING_STYLE } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import { PixiEditableMapImage, PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { HttpEventType } from '@angular/common/http';
import { ThreejsViewportComponent, TurnstileObject3D , Object3DCommon, ElevatorObject3D, RobotObject3D } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { MapService } from 'src/app/services/map.service';
import { Object3D } from 'three';
// import * as JSZIP from '@progress/jszip-esm';

@Component({
  selector: 'app-arcs-setup-floorplan3d',
  templateUrl: './arcs-setup-floorplan3d.component.html',
  styleUrls: ['./arcs-setup-floorplan3d.component.scss']
})
export class ArcsSetupFloorplan3dComponent implements OnInit {
  readonly = false
  @ViewChild('uploader') public uploader
  @ViewChild('container') mainContainer: ElementRef
  @ViewChild('threeJs') threeJsElRef: ThreejsViewportComponent
  @HostBinding('class') customClass = 'setup-floorplan3d'

  constructor(public util: GeneralUtil, public uiSrv: UiService, public windowSrv: DialogService, public ngZone: NgZone, public mapSrv : MapService,
    public httpSrv: RvHttpService, private dataSrv: DataService, public authSrv: AuthService) {
      this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }

  get floorPlanCode (){
    return this.frmGrp.controls['floorPlanCode'].value
  }
  frmGrp = new FormGroup({
    floorPlanCode: new FormControl('', Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    fileName: new FormControl(null),
    scale: new FormControl(1),
    positionX : new FormControl(0),
    positionY : new FormControl(0),
    positionZ : new FormControl(0),
    rotationX : new FormControl(0),
    rotationY : new FormControl(0),
    rotationZ : new FormControl(0),
    modifiedDateTime: new FormControl(null),
  })
  // initialDataset = null
  // get initialFloorPlan(){
  //   return this.initialDataset?.['floorPlan']
  // }
  windowRef
  @Input() parent: SaMapComponent
  // dropdownData: { maps?: DropListMap[], buildings?: DropListBuilding[] } = {
  //   // sites : [],
  //   maps: [],
  //   buildings: [],
  //   // floors:[]
  // }

  // dropdownOptions = {
  //   // sites : [],
  //   maps: [],
  //   buildings: [],
  //   // floors:[]
  // }

  // selectedMapIds = []
  pk = 'planId'
  @Input() set id(v) {
    // this.code = v
  }
  get id() {
    return this.code
  }

  file: Blob = null
  fileType = 'glb'
  loadingTicket
  subscriptions = []
  pixiMapBorders = []
  floorPlanDataset : JFloorPlan = null
  iotObjs : {  
    type : 'LIFT' | 'TURNSTILE' | 'DOOR',
    id : string ,
    objectRef : Object3D
  } [] = []

  // scale: number , 
  // width : number ,
  // length : number ,
  // height : number,
  // positionX : number,
  // positionY : number,
  // positionZ : number,
  // rotationX : number,
  // rotationY : number,
  // rotationZ : number,

  get iotLifts(){
    return this.iotObjs.filter(i=>i.type == 'LIFT')
  }

  
  get iotTurnstiles(){
    return this.iotObjs.filter(i=>i.type == 'TURNSTILE')
  }

  
  get iotDoors(){
    return this.iotObjs.filter(i=>i.type == 'DOOR')
  }


  @Input() parentRow = null
  get isCreate() {
    return this.parentRow == null
  }
  get code(): string {
    return this.parentRow?.floorPlanCode
  }


  ngOnInit(): void {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.id ? "FLOORPLAN_EDIT" : "FLOORPLAN_ADD")
    if (this.readonly) {
      Object.keys(this.frmGrp.controls).forEach(k => this.frmGrp.controls[k].disable())
    }

  }

  ngOnDestroy() {
    this.subscriptions.forEach(s => s.unsubsribe())
  }


  async ngAfterViewInit() {
    this.frmGrp.controls['fileName']['uc'].textbox.input.nativeElement.disabled = true
    await this.loadData(this.id)
    this.uiSrv.loadAsyncDone(this.loadingTicket);
  }

  onfileLoad(event) {
    const files : FileList = (<HTMLInputElement>event.target).files;
    if (files.length === 0) {
      return;
    }
    
    
    let max_file_size = this.util.config['UPLOAD_MODEL_MAX_SIZE_KB'] ? this.util.config['UPLOAD_MODEL_MAX_SIZE_KB'] : 102400
    this.frmGrp.controls['fileName'].setValue(files[0].name)
    if (files[0].size / 1024 > max_file_size) {
      this.uiSrv.showWarningDialog(this.uiSrv.translate(`The uploaded file exceeds the maximum size`) + `( ${max_file_size > 1024 ? (max_file_size / 1024 + 'MB') : (max_file_size + 'KB')} )`);
      return;
    }
    

    let ticket = this.uiSrv.loadAsyncBegin()
    var reader = new FileReader();
    this.fileType = files[0].name.split(".")[files[0].name.split.length - 1]
    reader.readAsArrayBuffer(files[0])
    reader.onload = async (event) => {
      this.file = new Blob([event.target.result]);
      await this.load3DModel()
      this.uiSrv.loadAsyncDone(ticket)
      // if (this.fileType == 'glb') {
      //   await this.load3DModel({glb : this.file})
      //   this.uiSrv.loadAsyncDone(ticket)
      // } else if (this.fileType == 'zip') {
      //   await this.load3DModel({zip : this.file})
      //   this.uiSrv.loadAsyncDone(ticket)
      // }
      // event.target.value = null
    }
  }


  onUploadClicked(){
    this.uploader.nativeElement.click()
  }

 

  async loadData(id) {
    this.file =  await this.mapSrv.get3DFloorPlanBlob( id.toString())    
    const data = await this.mapSrv.get3DFloorPlanSettings(id.toString())
    if(data){
      this.util.loadToFrmgrp(this.frmGrp , data.floorPlan)
    }else{  
      this.frmGrp.controls['floorPlanCode'].setValue(id.toString())
    }
    this.floorPlanDataset = await this.httpSrv.get("api/map/plan/v1/" + id.toString()) 
    await this.load3DModel()
  }
  
  async load3DModel(){
    if(this.file){
      setTimeout(async()=>{
        await this.threeJsElRef.$initDone.toPromise()
        await this.threeJsElRef.loadFloorPlan(this.floorPlanDataset , false , this.file)
        this.threeJsElRef.elevators.forEach(e=> this.addIotObj3D("LIFT" , e.liftId , e))
        this.threeJsElRef.uiToggled('showFloorPlanImage')
        this.refreshModelTransformation()
        this.selectObject3D(this.threeJsElRef.floorPlanModel)
      })
    }
  }

  Object3DClicked(obj : Object3DCommon){
    if(this.iotObjs.map(i=>i.objectRef).includes(obj)){
      this.selectObject3D(obj)
    }
  }

  Object3DRemoved(obj ){
    if(obj == this.threeJsElRef.floorPlanModel){
      this.uploader.nativeElement.value = null
      this.frmGrp.controls['fileName'].setValue(null)
      this.file = null
    }
  }

  selectObject3D(obj : Object3D){
    this.threeJsElRef.transformCtrl.attach(obj)
  }

  refreshModelTransformation(){
    this.threeJsElRef.floorPlanModel.scale.set(this.frmGrp.controls['scale'].value , this.frmGrp.controls['scale'].value , this.frmGrp.controls['scale'].value)
    this.threeJsElRef.floorPlanModel.position.set(this.frmGrp.controls['positionX'].value , this.frmGrp.controls['positionY'].value ,this.frmGrp.controls['positionZ'].value)
    this.threeJsElRef.floorPlanModel.rotation.set(this.frmGrp.controls['rotationX'].value / radRatio , this.frmGrp.controls['rotationY'].value /radRatio ,this.frmGrp.controls['rotationZ'].value /radRatio)
  }

  addIotObj3D(type: string , id = null, obj : Object3DCommon = null) {
    let objs = this.iotObjs.filter(i => i.type == type)
    let ids = ([objs.length + 1]).concat(objs.map(o => objs.indexOf(o) + 1))
    if (type == "TURNSTILE") {      
      id = id ? id : Math.min.apply(null, ids.filter(id => !objs.map(o => (<TurnstileObject3D>o.objectRef).turnstileId).includes(id.toString()))).toString()
      obj = obj ? obj : new TurnstileObject3D(this.threeJsElRef , id);
      (<TurnstileObject3D>obj).toolTipCompRef.instance.showDetail = true
    }else if(type == "LIFT"){
      id = id ? id : "1"
      obj = obj ? obj : new ElevatorObject3D(this.threeJsElRef, id, '');
      (<ElevatorObject3D>obj).boxMesh.visible = true;
      (<ElevatorObject3D>obj).robotDisplay = new RobotObject3D(this.threeJsElRef, ' ', '', '', '');
      (<ElevatorObject3D>obj).robotDisplay.position.set(0, 0, 15);
      (<ElevatorObject3D>obj).robotDisplay.visible = true;
      (<ElevatorObject3D>obj).add((<ElevatorObject3D>obj).robotDisplay);
      (<any>(<ElevatorObject3D>obj).boxMesh).defaultOpacity = 0.4;
      obj.toolTipAlwaysOn = true
    } else {
      return
    }
    this.iotObjs.push({
      type : <any>type,
      id : id ,
      objectRef : obj
    })
    this.threeJsElRef.floorPlanModel.add(obj)
    obj.$destroyed.pipe(take(1)).subscribe(()=>{
      this.iotObjs = this.iotObjs.filter(i=>i.objectRef != obj)
    })
    this.selectObject3D(obj)
  }
  // async get3DModel() {
  //   let ret = new Subject()
  //   let ticket = this.uiSrv.loadAsyncBegin()
  //   this.httpSrv.http.get(this.util.getRvApiUrl() + `/api/map/3dModel/v1/${this.code}.glb`, { reportProgress: true, observe: 'events', responseType: "blob" }).subscribe(resp => {
  //     if (resp.type === HttpEventType.Response) {
  //       this.uiSrv.loadAsyncDone(ticket)
  //       if (resp.status == 200) {
  //         this.file = resp.body
  //       } 
  //       ret.next(true)
  //     }
  //   },
  //     error => {
  //       ret.next(false)
  //       this.uiSrv.loadAsyncDone(ticket)
  //       console.log(error)
  //     });
  //   await <any>ret.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
  // }

  async tabletClose(planId) {
    this.parent.editingFpKeySet = false
    setTimeout(async () => {
      await this.parent.refreshTabletList();
      this.parent.selectedFloorplanCode = planId
      this.parent.onTabChange('floorplan', true, !planId)
    })
  }


  async validate(){
    ['scale','positionX' , 'positionY' , 'positionZ' , 'rotationX' , 'rotationY' , 'rotationZ'].forEach(k=>{
      this.frmGrp.controls[k].setValue(this.frmGrp.controls[k].value == null ? 0 : this.frmGrp.controls[k].value)
    })
    return true
  }
  
  getBaseIotDataObject(obj : Object3DCommon){
    let ret =  {
      floorPlanCode : this.floorPlanCode,
      scale : obj.scale.x,
      positionX : obj.position.x,
      positionY : obj.position.y,
      positionZ : obj.position.z,
      rotationX : obj.rotation.x,
      rotationY : obj.rotation.y,
      rotationZ : obj.rotation.z,
    }
    return ret
  }

  async saveToDB() {
    if(!await this.validate()){
      return
    }

    let ticket = this.uiSrv.loadAsyncBegin()
    this.refreshTransformation(null)
    // below to be moved to httpSrv
    const formData = new FormData();
    
    formData.append('file', this.file, this.floorPlanDataset.floorPlanCode + '.glb');
    formData.set('fileExtension', '.glb');
    formData.set('floorPlan' , JSON.stringify(this.frmGrp.value)) 
    formData.set('lifts' , JSON.stringify(this.iotLifts.map(l=>{
      const lift : ElevatorObject3D = <any>l.objectRef ;      
      return this.dataSrv.appendKeyValue(this.getBaseIotDataObject(lift) , {
        floor : "TEST",
        liftCode : l.id,
        width : lift.boxMesh.scale.x,
        height : lift.boxMesh.scale.y,
        length : lift.boxMesh.scale.z
      })
    })))
    this.httpSrv.http.put(this.util.getRvApiUrl() + `/api/map/3dModel/v1/${this.floorPlanDataset.floorPlanCode}`, formData, { reportProgress: false, observe: 'events'}).subscribe(resp => {
      if (resp.type === HttpEventType.Response) {       
        const respData : SaveRecordResp = resp.body?.['data']
        this.uiSrv.loadAsyncDone(ticket)
        if(resp.status == 200 && respData.result == true){
          this.uiSrv.showNotificationBar('Save Successful', 'success' , undefined , undefined , true)
          this.windowRef.close()
        }else{
          this.uiSrv.showMsgDialog(respData?.msg ? respData?.msg : 'Save Failed')
        }
      }
    },
    error =>{
      console.log(error)
      this.uiSrv.loadAsyncDone(ticket)
      this.uiSrv.showMsgDialog(error?.message ? ` : ${error?.message}`: 'Save Failed')
    });
  }

  async onClose(){    
    if( this.readonly || await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      if(this.uiSrv.isTablet){
        this.tabletClose(null)
      }else{
        this.windowRef.close()
      }
    }
  }

  scaleChange(value:number){
    this.threeJsElRef.floorPlanModel.scale.set(value , value , value)
  }

  positionChange(dim : 'x' | 'y' | 'z' ,  value : number){
    if(dim == 'x'){
      this.threeJsElRef.floorPlanModel.position.setX(value)
    }else if(dim == 'y'){
      this.threeJsElRef.floorPlanModel.position.setY(value)
    }else if(dim == 'z'){
      this.threeJsElRef.floorPlanModel.position.setZ(value)
    }
  }

  rotationChange(dim : 'x' | 'y' | 'z' ,  value : number){
    value = value/radRatio
    const originalRotation = this.threeJsElRef.floorPlanModel.rotation
    if(dim == 'x'){
      this.threeJsElRef.floorPlanModel.rotation.set(value , originalRotation.y , originalRotation.z)
    }else if(dim == 'y'){
      this.threeJsElRef.floorPlanModel.rotation.set(originalRotation.x , value , originalRotation.z)
    }else if(dim == 'z'){
      this.threeJsElRef.floorPlanModel.rotation.set(originalRotation.x ,originalRotation.y , value)
    }
  }

  refreshTransformation(event : Object3D){
    if(this.threeJsElRef.floorPlanModel){
      this.frmGrp.controls['scale'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.scale.x));
      this.frmGrp.controls['positionX'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.position.x));
      this.frmGrp.controls['positionY'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.position.y));
      this.frmGrp.controls['positionZ'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.position.z));
      this.frmGrp.controls['rotationX'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.rotation.x * radRatio));
      this.frmGrp.controls['rotationY'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.rotation.y * radRatio));
      this.frmGrp.controls['rotationZ'].setValue( this.util.trimNum(this.threeJsElRef.floorPlanModel.rotation.z * radRatio));
    }
  }
}



        // new JSZIP.default().loadAsync(this.file).then(async(zip) => {
        //   const objs = Object.keys(zip.files).filter(k => k.split(".")[k.split(".").length - 1]?.toLowerCase() == 'obj')
        //   const mtls = Object.keys(zip.files).filter(k => k.split(".")[k.split(".").length - 1]?.toLowerCase() == 'mtl')
        //   if (objs.length != 1) {
        //     this.uiSrv.showNotificationBar("The zip file must contain exactly 1 .obj file", "warning")
        //     this.uiSrv.loadAsyncDone(ticket)
        //     return
        //   } else if (mtls.length != 1) {
        //     this.uiSrv.showNotificationBar("The zip file must contain exactly 1 .mtl file", "warning")
        //     this.uiSrv.loadAsyncDone(ticket)
        //     return
        //   }
        //   const textureFiles = zip.file(/^.*\.(jpg|png)$/i)
        //   let objPromise = zip.file(objs[0]).async('string');
        //   let mtlPromise = zip.file(mtls[0]).async('string');
        //   let texturesData = {}
        //   let texturePromises = textureFiles.map((file) => file.async('base64'));
          
        //   let [objData, mtlData, ...imagesData] = await Promise.all([objPromise, mtlPromise, ...texturePromises]);
        //   for(let i = 0 ; i < textureFiles.length ; i ++){
        //     texturesData[textureFiles[i].name.split("/")[textureFiles[i].name.split("/").length - 1]] = imagesData[i]
        //   }

        //   // for (let i = 0; i < textureFiles.length; i++) {
        //   //   texturesData[textureFiles[i].name.split('.')[0]] = await textureFiles[i].async('base64')
        //   // }
        //   await this.load3DModel({obj: objData , mtl : mtlData , textures : texturesData})
        //   this.uiSrv.loadAsyncDone(ticket)

        //   // Object.keys(zip.files).forEach(function (filename) {
        //   //   zip.files[filename].async('string').then(function (fileData) {
        //   //     console.log(fileData) // These are your file contents      
        //   //   })
        //   // })
        // })
