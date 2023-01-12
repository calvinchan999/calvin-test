import { Component, OnInit , Input, HostBinding } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ARCS_STATUS_MAP, DataService, DropListRobot, RobotDetailARCS, signalRType } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-dashboard-robot-detail',
  templateUrl: './arcs-dashboard-robot-detail.component.html',
  styleUrls: ['./arcs-dashboard-robot-detail.component.scss']
})
export class ArcsDashboardRobotDetailComponent implements OnInit {
  @HostBinding('class') customClass = 'dialog-content robot-detail'
  constructor(public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil) { 
    this.initDataSource()
  }
  dialogRef
  selectedTab = 'info'
  tabs = [
    {id: 'info' , label : 'Info'},
  ]
  dashboardLayout = [
    [{ id: 'status' , rowSpan: 3 , col:1 } , { id: 'battery' , col : 2 }],
    [{ id: 'mode' , col: 2 }],
    [{ id: 'speed' , col: 2 }],
  ]
  ds : {status? : {} , battery? : {} , mode? : {} , speed? : {}} = {}
  @Input() robotId
  robotType
  robotSubType 
  topics : signalRType[] =  ['battery' , 'speed' , 'state'] 
  topModuleTabs = {
    PATROL : [{id : 'topModule' , label : 'Module'} , {id : 'camera' , label : 'Cameras'}],
    DELIVERY :[{ id :'topModule' , label : 'Module'}]
  }
  alertMsg = null
  streamingUrl = null
  streamingError = null

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let robotList : DropListRobot[] = <any>(await this.dataSrv.getDropList('robots')).data
    this.uiSrv.loadAsyncDone(ticket)
    let robot = robotList.filter(r=>r.robotCode == this.robotId)[0]
    this.robotType = robot?.robotType
    this.robotSubType = robot?.robotSubType
    this.tabs = this.tabs.concat(this.topModuleTabs[this.robotType ] && !(this.robotType == 'DELIVERY' && this.robotSubType == 'NA') ? this.topModuleTabs[this.robotType ] : [])
    this.dataSrv.subscribeSignalRs(this.topics, this.robotId)
    this.refreshRobotStatus()
  }

  ngOnDestroy(){
    this.dataSrv.unsubscribeSignalRs(this.topics, true ,  this.robotId )
  }
  
  initDataSource(){
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' , content : null },
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , signalR: this.dataSrv.signalRSubj.batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , signalR: this.dataSrv.signalRSubj.state},
      speed:{title: 'Speed',  suffix: 'm/s' , icon:'mdi-speedometer', signalR: this.dataSrv.signalRSubj.speed},
      // pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', signalR: this.dataSrv.signalRSubj.currentTaskId},
    };
  }

  async refreshRobotStatus(blockUI = true) {
    let ticket
    if (blockUI) {
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let robotDetail: RobotDetailARCS = await this.dataSrv.httpSrv.rvRequest("GET", "robot/v1/robotDetail/" + this.robotId, undefined, false)
    //let robotDetail = { robotCode: this.robotId, robotStatus: "IDLE", modeState: "NAVIGATION", batteryPercentage: 0.46965376, speed: 0.023951124 }
    this.ds.status['robotStatus'] = robotDetail.robotStatus
    this.ds.status['content'] = ARCS_STATUS_MAP[robotDetail.robotStatus]
    this.ds.status['cssClass'] = this.ds.status['content']
    this.ds.battery['signalR'].next(this.dataSrv.signalRMaster.battery.mapping.batteryRounded({ percentage: robotDetail.batteryPercentage }))
    this.ds.mode['signalR'].next(this.dataSrv.signalRMaster.state.mapping.state({ state: robotDetail.modeState }))
    this.ds.speed['signalR'].next(this.dataSrv.signalRMaster.speed.mapping.speed({ speed: robotDetail.speed }))
    this.alertMsg = (robotDetail.estopped ? [this.uiSrv.commonAlertMessages.estopped] : []).concat(robotDetail.obstacleDetected ? [this.uiSrv.commonAlertMessages.obstacleDetected] : []).concat(robotDetail.tiltDetected ? [this.uiSrv.commonAlertMessages.tiltDetected] : []).join(" ,\n")
    if (blockUI) {
      this.uiSrv.loadAsyncDone(ticket)
    }
  }

  async reserveRobot() {
    if (await this.uiSrv.showConfirmDialog("Are you sure to reserve the robot ?")) {
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.dataSrv.httpSrv.rvRequest("PUT", `robot/v1/hold?robotCode=${this.robotId}&hold=true`, undefined, true, this.uiSrv.translate("Robot reserved sucessfully - ") + this.robotId)
      this.uiSrv.loadAsyncDone(ticket)
      this.refreshRobotStatus()
    }
  }

  async releaseRobot(){
    if(await this.uiSrv.showConfirmDialog("Are you sure to release the robot ?")){
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.dataSrv.httpSrv.rvRequest("PUT",`robot/v1/hold?robotCode=${this.robotId}&hold=false`, undefined, true, this.uiSrv.translate("Robot released sucessfully - ") + this.robotId)
      this.uiSrv.loadAsyncDone(ticket)
      this.refreshRobotStatus()
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
      }else{
        this.streamingUrl = 'wss://calvinchan999.eastasia.cloudapp.azure.com/RV-ROBOT-2023/ws' //testing
      }
    }
  }
}
