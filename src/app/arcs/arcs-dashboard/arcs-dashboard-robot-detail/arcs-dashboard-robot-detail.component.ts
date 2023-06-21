import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DataService} from 'src/app/services/data.service';
import { ARCS_STATUS_MAP, DropListRobot } from 'src/app/services/data.models';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { MqService , MQType } from 'src/app/services/mq.service';
import { RobotService } from 'src/app/services/robot.service';

// const testStreamUrl = 'wss://calvinchan999.eastasia.cloudapp.azure.com/RV-ROBOT-104.' //TESTING
@Component({
  selector: 'app-arcs-dashboard-robot-detail',
  templateUrl: './arcs-dashboard-robot-detail.component.html',
  styleUrls: ['./arcs-dashboard-robot-detail.component.scss']
})
export class ArcsDashboardRobotDetailComponent implements OnInit  {
  ARCS_STATUS_MAP = ARCS_STATUS_MAP
  @HostBinding('class') customClass = 'dialog-content robot-detail'
  constructor( public robotSrv : RobotService, public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef , public mqSrv : MqService) { 
  }
  @ViewChildren('videoPlayer') videoPlayers : List<VideoPlayerComponent>
  dialogRef
  parent
  selectedTab = 'info'
  cameraStreamUrl = ''
  tabs = [
    {id: 'info' , label : 'Info'},
  ]
  dashboardLayout = [
    [{ id: 'status' , rowSpan: 3 , col:1 } , { id: 'battery' , col : 2 }],
    [{ id: 'mode' , col: 2 }],
    [{ id: 'speed' , col: 2 }],
  ]
  cameraLayout = []
  ds : {status? : any , battery? : any , mode? : any , speed? :any} = {}
  @Input() robotId
  // @Input() set robotId(v){
  //   this._robotId = v
  // }
  // get robotId(){
  //   return this._robotId
  // }
  _robotId
  robotType
  robotSubType 
  topics : MQType[] =  ['battery' , 'speed' , 'state' , 'arcsRobotDestination'] 
  topModuleTabs = {
    PATROL : [{id : 'camera' , label : 'Cameras'}], //{id : 'topModule' , label : 'Module'} , 
    DELIVERY :[{ id :'topModule' , label : 'Module'}]
  }
  alertMsg = null
  streamingUrl = null
  streamingError = null
  $onDestroy  = new Subject()
  robotSubj = null

  async ngOnInit() {
    this.initDataSource()
    this.cameraStreamUrl = this.util.config.CAMERA_STREAM_URL + this.robotId + '.'
    this.cameraLayout = [
      [
        { id: '1', rowSpan: 2, colSpan: 2, col: 1, row: 1, streamingUrl: this.cameraStreamUrl + '1/ws?authorization=' + this.util.getUserAccessToken() },
        { id: '2', col: 3, row: 1, streamingUrl: this.cameraStreamUrl + '2/ws?authorization=' + this.util.getUserAccessToken() }
      ], 
      [
        { id: '3', col: 3, row: 2, streamingUrl: this.cameraStreamUrl + '3/ws?authorization=' + this.util.getUserAccessToken() }
      ]
    ]
    let ticket = this.uiSrv.loadAsyncBegin()
    let robotList : DropListRobot[] = <any>(await this.dataSrv.getDropList('robots')).data
    this.uiSrv.loadAsyncDone(ticket)
    let robot = robotList.filter(r=>r.robotCode == this.robotId)[0]
    this.robotType = robot?.robotType
    // this.robotType = 'PATROL'
    this.robotSubType = robot?.robotSubType
    this.tabs = this.tabs.concat(this.topModuleTabs[this.robotType] && !(this.robotType == 'DELIVERY' && this.robotSubType == 'NA') ? this.topModuleTabs[this.robotType ] : [])
    this.mqSrv.subscribeMQTTsUntil(this.topics, this.robotId,this.$onDestroy)
    this.refreshRobotStatus(this.parent)
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  
  initDataSource(){
    // this.mqSrv.initArcsRobotDataMap(this.robotId)
    this.robotSubj = this.robotSrv.robotState(this.robotId)
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' , content:null},
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , mq: this.robotSrv.robotState(this.robotId).batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , mq: this.robotSrv.robotState(this.robotId).state},
      speed:{title: 'Speed',  suffix: 'm/s' , icon:'mdi-speedometer', mq: this.robotSrv.robotState(this.robotId).speed},
      // pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', mq: this.robotSrv.data.currentTaskId},
    };
    this.robotSrv.robotState(this.robotId).status.pipe(takeUntil(this.$onDestroy)).subscribe(s=>{
      this.ds.status.robotStatus = s
      this.ds.status.content = ARCS_STATUS_MAP[s]
      this.ds.status.cssClass = this.ds.status.content
    })
  }

  async refreshRobotStatus(blockUI = true) {
    let ticket
    if (blockUI) {
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let robotDetail = await this.robotSrv.ARCS.getRobotDetail(this.robotId)
    // let robotDetail: RobotDetailARCS = await this.dataSrv.httpSrv.fmsRequest("GET", "robot/v1/robotDetail/" + this.robotId, undefined, false)
    //let robotDetail = { robotCode: this.robotId, robotStatus: "IDLE", modeState: "NAVIGATION", batteryPercentage: 0.46965376, speed: 0.023951124 }
    this.ds.status.robotStatus = robotDetail.robotStatus
    this.ds.status.content = ARCS_STATUS_MAP[robotDetail.robotStatus]
    this.ds.status.cssClass = this.ds.status.content
    this.robotSrv.robotState(this.robotId).batteryRounded.next(this.mqSrv.mqMaster.battery.robotState.batteryRounded({ robotId : this.robotId , percentage: robotDetail.batteryPercentage }))
    this.robotSrv.robotState(this.robotId).state.next(this.mqSrv.mqMaster.state.robotState.state({ robotId : this.robotId , state: robotDetail.modeState , manual : false }))
    this.robotSrv.robotState(this.robotId).speed.next(this.mqSrv.mqMaster.speed.robotState.speed({ robotId : this.robotId , speed: robotDetail.speed }))

    // this.mqSrv.updateArcsRobotDataMap(this.robotId , 'batteryRounded' , this.mqSrv.mqMaster.battery.mapping.batteryRounded({ robotId : this.robotId , percentage: robotDetail.batteryPercentage }))
    // this.mqSrv.updateArcsRobotDataMap(this.robotId , 'state' , this.mqSrv.mqMaster.state.mapping.state({ robotId : this.robotId , state: robotDetail.modeState , manual : false }))
    // this.mqSrv.updateArcsRobotDataMap(this.robotId , 'speed' , this.mqSrv.mqMaster.speed.mapping.speed({ robotId : this.robotId , speed: robotDetail.speed }))

    this.alertMsg = (robotDetail.estopped ? [this.uiSrv.commonAlertMessages.estopped] : []).concat(robotDetail.obstacleDetected ? [this.uiSrv.commonAlertMessages.obstacleDetected] : []).concat(robotDetail.tiltDetected ? [this.uiSrv.commonAlertMessages.tiltDetected] : []).join(" ,\n")
    if (blockUI) {
      this.uiSrv.loadAsyncDone(ticket)
    }
  }

  async reserveRobot() {
    if (await this.uiSrv.showConfirmDialog("Are you sure to reserve the robot ?")) {
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.dataSrv.httpSrv.fmsRequest("PUT", `robot/v1/hold?robotCode=${this.robotId}&hold=true`, undefined, true, this.uiSrv.translate("Robot reserved sucessfully - ") + this.robotId)
      this.uiSrv.loadAsyncDone(ticket)
      // this.refreshRobotStatus()
    }
  }

  async releaseRobot(){
    if(await this.uiSrv.showConfirmDialog("Are you sure to release the robot ?")){
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.dataSrv.httpSrv.fmsRequest("PUT",`robot/v1/hold?robotCode=${this.robotId}&hold=false`, undefined, true, this.uiSrv.translate("Robot released sucessfully - ") + this.robotId)
      this.uiSrv.loadAsyncDone(ticket)
      // this.refreshRobotStatus()
    }
  }

  async getStreamingUrl(){
    this.streamingError = null
    if(!this.streamingUrl){
      if(this.util.config.USE_AZURE_MEDIA){
        let ticket = this.uiSrv.loadAsyncBegin()
        try{
          this.streamingUrl = await this.dataSrv.httpSrv.get(`api/sysparas/streamingUrl/${this.robotId}/v1` , undefined,undefined,undefined,undefined,true , true)
        }catch(err){
          this.streamingUrl = null
          this.streamingError = 'No available streaming source found in Azure'
        }
        this.uiSrv.loadAsyncDone(ticket)
      }
      // else{
      //   this.streamingUrl = 'wss://calvinchan999.eastasia.cloudapp.azure.com/RV-ROBOT-104.1/ws?authorization=' + this.util.getUserAccessToken() //testing
      // }
    }
  }

  switchMainCamera(cameraLayoutItem : layoutItemDef){
    let currentMainCameraItem : layoutItemDef = this.cameraLayout.filter(itms=>itms.some((i:layoutItemDef)=>i.row == 1 && i.col == 1))[0].
                                                                  filter((i:layoutItemDef)=>i.row == 1 && i.col == 1)[0]
    currentMainCameraItem.row = cameraLayoutItem.row
    currentMainCameraItem.rowSpan = cameraLayoutItem.rowSpan
    currentMainCameraItem.colSpan = cameraLayoutItem.colSpan
    currentMainCameraItem.col = cameraLayoutItem.col
    cameraLayoutItem.col = 1
    cameraLayoutItem.row = 1
    cameraLayoutItem.rowSpan = 2
    cameraLayoutItem.colSpan = 2
    setTimeout(()=>{
      this.videoPlayers.forEach(v=>{
        v.refreshWidthHeight()
      })
    })
  }
}

class layoutItemDef {
  row: number
  rowSpan?: number
  colSpan?: number
  col: number
}
