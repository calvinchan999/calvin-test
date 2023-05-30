import { ChangeDetectorRef, Component, HostListener, Input, NgZone, OnInit, ViewChild, HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { SHAPES } from 'pixi.js';
import { Subject } from 'rxjs';
import { debounce, debounceTime, filter, skip, take, takeUntil } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth.service';
import { DataService} from 'src/app/services/data.service';
import { JMap, MapJData, ShapeJData } from 'src/app/services/data.models';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { SaMapComponent } from 'src/app/standalone/sa-map/sa-map.component';
import { Map2DViewportComponent,  Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { calculateMapOrigin } from 'src/app/ui-components/map-2d-viewport/pixi-ros-conversion';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { GetImageDimensions} from 'src/app/utils/graphics/image';
import { MqService } from 'src/app/services/mq.service';
import { RobotService } from 'src/app/services/robot.service';

@Component({
  selector: 'app-cm-map-detail',
  templateUrl: './cm-map-detail.component.html',
  styleUrls: ['./cm-map-detail.component.scss']
})
export class CmMapDetailComponent implements OnInit {
  readonly = false
  @HostBinding('class') customClass = 'setup-map'
  @ViewChild('pixi') pixiElRef : Map2DViewportComponent
  constructor( public robotSrv : RobotService , public mqSrv : MqService , public uiSrv : UiService , public dialogSrv: DialogService, public ngZone : NgZone, public httpSrv : RvHttpService, public util : GeneralUtil , public dataSrv : DataService , public authSrv : AuthService) { 
             }

  frmGrp = new FormGroup({
    floorPlanCode : new FormControl(null),
    mapCode: new FormControl('' , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(''),
    robotBase : new FormControl( this.util.arcsApp ? null : this.util.config.ROBOT_BASE),
    fileName: new FormControl(null),
    originX : new FormControl(null),
    originY : new FormControl(null),
    imageWidth : new FormControl(null),
    imageHeight : new FormControl(null),
    modifiedDateTime: new FormControl(null),
  })

  createFloorPlan = true

  windowRef
  @Input() parent : SaMapComponent

  @Input() set id(v){

  }
  get id(){
    return null
  }
  subscriptions = []
  startedScanning = false
  occupancyGridReceived = false
  onDestroy = new Subject()
  mqSubscribedTopics = []
  latestBase64image = null
  orginalHeight = null
  orginalWidth = null
  backedtoNavigationMode = false
  showTabletSaveDialog = false
  @Input() parentRow = null
  locationDataMap =  new Map()
  get isCreate(){
    return this.parentRow == null
  }
  get codes():string[]{
    return [this.parentRow?.mapCode , this.parentRow?.robotBase]
  }

  scanOption = {
    show:  false,
    extend : false,
    activeMapCode : null
  }
  

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload($event) {
    if(this.startedScanning){
      $event.returnValue = this.uiSrv.translate('Are you sure to leave without saving? Map Scanning will be terminated.');
    }
  }
  loadingTicket
  stoppedScanning = false
  // metaData : {x : number |null , y :  number |null , angle :  number |null ,width: number |null , height :  number |null}  = null

  @HostListener('window:unload')
  onUnload() {
    // this.stopScanMap(!this.readonly)
    this.changeBackModeToNavigation()
  }


  ngOnInit(): void {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.isCreate ? "MAP_EDIT" : "MAP_ADD")
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>this.frmGrp.controls[k].disable())
    }
  }

  ngOnDestroy(){
    this.onDestroy.next()
    this.changeBackModeToNavigation()
    this.mqSrv.unsubscribeMQTTs(this.mqSubscribedTopics)
    this.subscriptions.forEach(s=>s.unsubsribe())
  }

 
  ngAfterViewInit(){
    this.pixiElRef.initDone$.subscribe(async () => {
      if(!this.isCreate){
        this.frmGrp.controls['fileName']['uc'].textbox.input.nativeElement.disabled = true
        this.loadData(this.codes)
      }
      // }else{
      //   this.listenScanMap_SA()
      //   // this.initialDataset = await this.getSubmitDataset()
      // }
    })
    this.pixiElRef.init()
  }
  
  async loadData(codes : string[]){
    let ticket = this.uiSrv.loadAsyncBegin()
    let data : JMap = await this.httpSrv.get('api/map/v1/' + codes[0] + '/' + codes[1] )    
    // await this.pixiElRef.convertJMapToUniversalResolution(data)
    this.orginalWidth = data.imageWidth
    this.orginalHeight = data.imageHeight
    await this.pixiElRef.loadToMainContainer( data.base64Image , undefined , undefined , undefined, undefined, true)
    let resolution = data.resolution ?  data.resolution : 1 /  this.util.config.METER_TO_PIXEL_RATIO
    let origin = calculateMapOrigin(data.originX , data.originY , data.imageHeight *  resolution ,  1 / resolution)
    this.pixiElRef.setMapOrigin(origin[0] , origin[1])
    this.util.loadToFrmgrp(this.frmGrp , data)
    this.uiSrv.loadAsyncDone(ticket)
  }

  valueChange(evt){

  }

  async validate() {
    //TBD : check if map resolution == original map resolution if update
    if(!this.isCreate){
      let currDimension = await GetImageDimensions('data:image/png;base64,' + await this.pixiElRef?.getMainContainerImgBase64())
      if(currDimension[0] != this.orginalWidth || currDimension[1] != this.orginalHeight){
        this.uiSrv.showMsgDialog("Map dimemsion changed. Drawing is out of boundary")
        return false
      }
    }

    if(!this.util.validateFrmGrp(this.frmGrp)){
      return false
    }
    return true
  }

  async getSubmitDataset(){
    let ret = new JMap()
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    ret.base64Image = await this.pixiElRef.getMainContainerImgBase64()
    if(!this.parentRow && this.createFloorPlan){
      this.frmGrp.controls['floorPlanCode'].setValue(this.frmGrp.controls['floorPlanCode'].value?.length > 0 ? this.frmGrp.controls['floorPlanCode'].value : this.frmGrp.controls['mapCode'].value )
      ret.floorPlanCode =  this.frmGrp.controls['floorPlanCode'].value
    }
    // ret.originX = this.isCreate ? this.metaData.x : ret.originX
    // ret.originY = this.isCreate ? this.metaData.y : ret.originY
    return ret
  }

  async onClose(){
    if(this.readonly || ( await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?'))){
      if(this.uiSrv.isTablet){
        this.tabletClose(null)
      }else{        
        this.windowRef.close()
      }
    }
  }

  async tabletClose(mapCode){ //TBR
    this.parent.editingMapKeySet = null
    this.parent.addingMap = false
    
    setTimeout(async()=>{
      await this.parent.refreshTabletList();
      this.parent.selectedMapKeySet = {mapCode : mapCode , robotBase : this.util.config.ROBOT_BASE}
      this.parent.onTabChange('map', true , !mapCode)
    })
  }

  async saveToDB(){
    if(this.uiSrv.isTablet && this.isCreate && !this.showTabletSaveDialog){
      this.showTabletSaveDialog = true
      return
    }
    if(!await this.validate()){
      return
    }
    // await this.stopScanMap(true)    
    let saveResult = await this.dataSrv.saveRecord("api/map/v1" ,await this.getSubmitDataset(), this.frmGrp , this.isCreate)
    if (saveResult.result == true) {
      let mapCode = this.frmGrp.controls['mapCode'].value
      if(this.startedScanning){
        this.parentRow = {mapCode:mapCode, robotBase : this.frmGrp.controls['robotBase'].value}
        this.changeBackModeToNavigation()
        this.startedScanning = false
        this.occupancyGridReceived = false
        if(this.uiSrv.isTablet){
          this.tabletClose(mapCode)
        }else{      
          this.pixiElRef.reset()
          this.pixiElRef.hideButton = { arrow: true, upload: true, point: true } 
          this.loadData( [mapCode , this.util.config.ROBOT_BASE])         
        }
        this.frmGrp.reset()
      }else if(!this.uiSrv.isTablet){
        this.windowRef.close()
      }else{
        this.tabletClose(mapCode)
      }
    }
    this.locationDataMap = new Map()
  }

  async changeBackModeToNavigation(){
    if (this.startedScanning && !this.backedtoNavigationMode) {
      this.backedtoNavigationMode = true
      await this.httpSrv.fmsRequest('POST', 'mode/v1/navigation')
      await this.httpSrv.fmsRequest('PUT','baseControl/v1/manual/OFF')
    }
  }

  async scanMapClicked(){
    //TBD : post rv 
    const activeMapCode = (await this.httpSrv.fmsRequest('GET', 'map/v1/activeMap' , undefined, false))?.name
    if(activeMapCode!=null && activeMapCode.length > 0){
      this.scanOption.activeMapCode = activeMapCode
      this.scanOption.show = true
    }else{
      this.startScan()
    }
  }

  async startScan(extend = false){
    this.scanOption.show = false
    this.listenScanMap_SA()
    this.robotSrv.data.occupancyGridMap.next(null)
    this.uiSrv.awaitMqBegin(this.robotSrv.data.occupancyGridMap)
    await this.httpSrv.fmsRequest('POST','mode/v1/mapping' + ( extend? '?expansion=true' : '') )
    await this.httpSrv.fmsRequest('PUT','baseControl/v1/manual/ON')
    // await this.httpSrv.rvRequest('POST','map/v1/startTrajectory')
    this.startedScanning = true
  }

  async listenScanMap_SA(){
    this.pixiElRef.hideButton = {all:true}
    let robot : Robot
    this.mqSubscribedTopics = ['occupancyGridMap' , 'pose' , 'state']
    await this.mqSrv.subscribeMQTTs(this.mqSubscribedTopics)
   
    this.robotSrv.data.occupancyGridMap.pipe(skip(1) ,filter(o=>o?.['data'], debounceTime(1000)), takeUntil(this.onDestroy)).subscribe(async(o)=>{
      let base64Img = 'data:image/png;base64,' + o['data']
      if(this.latestBase64image != base64Img){
        this.latestBase64image = base64Img 
        await this.pixiElRef.loadToMainContainer(this.latestBase64image, undefined, undefined, undefined, undefined, !this.occupancyGridReceived)
   
      }
      if(!this.occupancyGridReceived){
        robot = this.pixiElRef.robotModule.addRobot(this.dataSrv.robotMaster.robotCode)  
      }
     
      let metaData : {x : number |null , y :  number |null , angle :  number |null ,width: number |null , height :  number |null} = o['mapMetadata']
      this.frmGrp.controls['imageWidth'].setValue(metaData.width)
      this.frmGrp.controls['imageHeight'].setValue(metaData.height)
      this.frmGrp.controls['originX'].setValue(metaData.x)
      this.frmGrp.controls['originY'].setValue(metaData.y)
      let guiOrigin = calculateMapOrigin(metaData.x , metaData.y, metaData.height /this.util.config.METER_TO_PIXEL_RATIO , this.util.config.METER_TO_PIXEL_RATIO)
      this.pixiElRef.setMapOrigin(guiOrigin[0] , guiOrigin[1])
      this.pixiElRef.pixiRosMapOriginMarker.resize()
      this.pixiElRef.overlayMsg = null

      // this.pixiElRef.hideButton = { arrow: true, upload: true, point: true }
      this.occupancyGridReceived = true
      // if(!this.startedScanning){
      //   this.readonly = true
      // }
    })

    this.robotSrv.data.pose.pipe(skip(1) ,filter(p=>p), takeUntil(this.onDestroy)).subscribe(p=>{
      if(this.occupancyGridReceived){   
        robot.refreshPose(p.x, p.y, p.angle , undefined , undefined, undefined , true , true)
        robot.pixiGraphics.autoScaleModule.setScale()      
      }
    })
  }  

}
