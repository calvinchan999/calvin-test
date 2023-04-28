import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnInit, ViewChild, HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { filter, retry, take } from 'rxjs/operators';
import {  Subject } from 'rxjs';
import { DataService, DropListBuilding, DropListMap, JFloorPlan, JMap, MapJData, SaveRecordResp, ShapeJData } from 'src/app/services/data.service';
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
import { ThreejsViewportComponent } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';


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

  constructor(public util: GeneralUtil, public uiSrv: UiService, public windowSrv: DialogService, public ngZone: NgZone,
    public httpSrv: RvHttpService, private dataSrv: DataService, public authSrv: AuthService) {
      this.loadingTicket = this.uiSrv.loadAsyncBegin()
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
  loadingTicket
  subscriptions = []
  pixiMapBorders = []
  floorPlanDataset : JFloorPlan = null


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
    reader.readAsArrayBuffer(files[0])
    reader.onload = async (event) => {
      this.file = new Blob([event.target.result]);
      await this.load3DModel()
      this.uiSrv.loadAsyncDone(ticket)
      // event.target.value = null
    }
  }


  onUploadClicked(){
    this.uploader.nativeElement.click()
  }

 

  async loadData(id) {
    this.file =  await this.dataSrv.getArcs3DFloorPlanBlob( id.toString())    
    console.log(this.file)
    const data = await this.dataSrv.getArcs3DFloorPlanSettings(id.toString())
    if(data){
      this.util.loadToFrmgrp(this.frmGrp , data)
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
        this.refreshModelTransformation()
      })
    }
  }

  refreshModelTransformation(){
    this.threeJsElRef.floorPlanModel.scale.set(this.frmGrp.controls['scale'].value , this.frmGrp.controls['scale'].value , this.frmGrp.controls['scale'].value)
    this.threeJsElRef.floorPlanModel.position.set(this.frmGrp.controls['positionX'].value , this.frmGrp.controls['positionY'].value ,this.frmGrp.controls['positionZ'].value)
    this.threeJsElRef.floorPlanModel.rotation.set(this.frmGrp.controls['rotationX'].value / radRatio , this.frmGrp.controls['rotationY'].value /radRatio ,this.frmGrp.controls['rotationZ'].value /radRatio)
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
  
  async saveToDB() {
    if(!await this.validate()){
      return
    }

    let ticket = this.uiSrv.loadAsyncBegin()
    // below to be moved to httpSrv
    const formData = new FormData();
    formData.append('file', this.file, this.floorPlanDataset.floorPlanCode + '.glb');
    formData.set('fileExtension', '.glb');
    formData.set('floorPlan3DSettings' , JSON.stringify(this.frmGrp.value)) 
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
    const originalRotation =   this.threeJsElRef.floorPlanModel.rotation
    if(dim == 'x'){
      this.threeJsElRef.floorPlanModel.rotation.set(value , originalRotation.y , originalRotation.z)
    }else if(dim == 'y'){
      this.threeJsElRef.floorPlanModel.rotation.set(originalRotation.x , value , originalRotation.z)
    }else if(dim == 'z'){
      this.threeJsElRef.floorPlanModel.rotation.set(originalRotation.x ,originalRotation.y , value)
    }
  }
}

