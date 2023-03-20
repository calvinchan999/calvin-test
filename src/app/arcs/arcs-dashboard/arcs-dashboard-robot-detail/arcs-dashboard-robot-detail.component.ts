import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ARCS_STATUS_MAP, DataService, DropListRobot, RobotDetailARCS, signalRType } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';

// const testStreamUrl = 'wss://calvinchan999.eastasia.cloudapp.azure.com/RV-ROBOT-104.' //TESTING
@Component({
  selector: 'app-arcs-dashboard-robot-detail',
  templateUrl: './arcs-dashboard-robot-detail.component.html',
  styleUrls: ['./arcs-dashboard-robot-detail.component.scss']
})
export class ArcsDashboardRobotDetailComponent implements OnInit  {
  @HostBinding('class') customClass = 'dialog-content robot-detail'
  constructor(public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
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
  topics : signalRType[] =  ['battery' , 'speed' , 'state' , 'arcsRobotDestination'] 
  topModuleTabs = {
    PATROL : [{id : 'topModule' , label : 'Module'} , {id : 'camera' , label : 'Cameras'}],
    DELIVERY :[{ id :'topModule' , label : 'Module'}]
  }
  alertMsg = null
  streamingUrl = null
  streamingError = null
  $onDestroy  = new Subject()
  robotSubj = null

  async ngOnInit() {
    this.initDataSource()
    this.cameraStreamUrl = this.util.config.CAMERA_STREAM_URL
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
    this.dataSrv.subscribeSignalRs(this.topics, this.robotId)
    this.refreshRobotStatus(this.parent)
  }

  ngOnDestroy(){
    this.$onDestroy.next()
    this.dataSrv.unsubscribeSignalRs(this.topics, true ,  this.robotId )
  }

  
  initDataSource(){
    this.dataSrv.initArcsRobotDataMap(this.robotId)
    this.robotSubj = this.dataSrv.arcsRobotDataMap[this.robotId]
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' , content:null},
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , signalR: this.dataSrv.arcsRobotDataMap[this.robotId].batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , signalR: this.dataSrv.arcsRobotDataMap[this.robotId].state},
      speed:{title: 'Speed',  suffix: 'm/s' , icon:'mdi-speedometer', signalR: this.dataSrv.arcsRobotDataMap[this.robotId].speed},
      // pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', signalR: this.dataSrv.signalRSubj.currentTaskId},
    };
    this.dataSrv.arcsRobotDataMap[this.robotId].status.pipe(takeUntil(this.$onDestroy)).subscribe(s=>{
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
    let robotDetail: RobotDetailARCS = await this.dataSrv.httpSrv.fmsRequest("GET", "robot/v1/robotDetail/" + this.robotId, undefined, false)
    //let robotDetail = { robotCode: this.robotId, robotStatus: "IDLE", modeState: "NAVIGATION", batteryPercentage: 0.46965376, speed: 0.023951124 }
    this.ds.status.robotStatus = robotDetail.robotStatus
    this.ds.status.content = ARCS_STATUS_MAP[robotDetail.robotStatus]
    this.ds.status.cssClass = this.ds.status.content
    this.dataSrv.updateArcsRobotDataMap(this.robotId , 'batteryRounded' , this.dataSrv.signalRMaster.battery.mapping.batteryRounded({ robotId : this.robotId , percentage: robotDetail.batteryPercentage }))
    this.dataSrv.updateArcsRobotDataMap(this.robotId , 'state' , this.dataSrv.signalRMaster.state.mapping.state({ robotId : this.robotId , state: robotDetail.modeState , manual : false }))
    this.dataSrv.updateArcsRobotDataMap(this.robotId , 'speed' , this.dataSrv.signalRMaster.speed.mapping.speed({ robotId : this.robotId , speed: robotDetail.speed }))

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
