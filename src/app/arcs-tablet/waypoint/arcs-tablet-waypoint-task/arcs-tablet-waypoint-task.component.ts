import { HttpParams } from '@angular/common/http';
import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { RobotInfo } from 'src/app/arcs/arcs-dashboard/arcs-dashboard.component';
import { ARCS_STATUS_MAP, AUTONOMY, ActionParameter, DropListAction, DropListLocation, DropListMission, JTask, RobotStatusARCS, TaskItem } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { MqService } from 'src/app/services/mq.service';
import { RobotService, RobotState } from 'src/app/services/robot.service';
import { UiService } from 'src/app/services/ui.service';
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-arcs-tablet-waypoint-task',
  templateUrl: './arcs-tablet-waypoint-task.component.html',
  styleUrls: ['./arcs-tablet-waypoint-task.component.scss']
})
export class ArcsTabletWaypointTaskComponent implements OnInit {
  @Input() floorPlanCode 
  @Input() staticWaypoint  
  robotStates : RobotState[] = []  
  constructor(public dataSrv : DataService , public robotSrv : RobotService , public mqSrv : MqService , public uiSrv : UiService) { 
    this.resetSelectedAction()
  }
  $onDestroy = new Subject<any>()
  ARCS_STATUS_MAP = ARCS_STATUS_MAP
  selectedRobotCode = null
  selectedWaypoint = null
  get selectedRobotState (){
    return this.robotStates.filter((r)=> r.robotCode == this.selectedRobotCode)[0]
  }
  selectedAction : { actionParams? : ActionParameter[] , actionItem? :  {alias : string , properties : object}}
  showCreateTaskDialog = false

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  tabs = [
    { id :'template' , label : 'Template'},
    { id: 'destination', label: 'Destination' },
    { id: 'action', label: 'Action' }
  ]
  selectedTab 
  waypointsData: DropListLocation[] = []
  taskActions : DropListAction [] = []
  templates : DropListMission[] = []

  dropdownActions = []
  dropdownTemplates = []
  waypoints = []

  async ngOnInit() {
    const ticket = this.uiSrv.loadAsyncBegin()
    let data : RobotStatusARCS [] = await this.dataSrv.httpSrv.fmsRequest('GET', 'robot/v1/info?floorPlanCode=' + this.floorPlanCode, undefined, false);   
    this.refreshRobotStates(data);
    this.mqSrv.subscribeMQTTUntil('arcsRobotStatusChange' , this.floorPlanCode , this.$onDestroy)
    this.mqSrv.data.arcsRobotStatusChange.pipe(skip(1), filter(v => v != null), takeUntil(this.$onDestroy)).subscribe((data: RobotStatusARCS[]) => {
      this.refreshRobotStates(data)
    })
    const DDL : {data : {
        locations : DropListLocation [],
        actions : DropListAction [],
        missions : DropListMission [],
      }
    } = <any>await this.dataSrv.getDropLists(['actions' , 'locations' , 'missions'])

    this.waypointsData = DDL.data.locations.filter((l: DropListLocation) => l.floorPlanCode == this.floorPlanCode)
    this.taskActions = DDL.data.actions
    this.templates = DDL.data.missions
    this.waypoints = this.waypointsData.filter(wp => wp != this.staticWaypoint)
    this.selectedTab = this.tabs[0]?.id
    this.refreshDropdownTemplates()
    this.uiSrv.loadAsyncDone(ticket)
  }

  refreshDropdown(){
    this.refreshDropdownActions()
    this.refreshDropdownTemplates()
  }

  refreshDropdownActions(){
    let point = this.waypointsData.filter(w=>w.pointCode == this.selectedWaypoint || w.pointCode == this.staticWaypoint)[0]
    let robotType = this.selectedRobotState?.robotType
    this.dropdownActions = this.dataSrv.getDropListOptions('actions' ,  this.taskActions.filter(a=>(a.allowedPointTypes == null || a.allowedPointTypes.includes(point.pointType)) && (a.allowedRobotTypes == null || a.allowedRobotTypes.includes(robotType))))
  }

  refreshDropdownTemplates(){
    this.dropdownTemplates =  this.templates.filter(t=> this.selectedRobotCode == null || 
                                                        ((t.robotCode == null || t.robotCode == this.selectedRobotCode) && 
                                                          (t.robotType == null || t.robotType == this.selectedRobotState?.robotType)
                                                        )
                                                    )
  }

  refreshRobotStates(data: RobotStatusARCS[]) {
    data.forEach(r => {
      this.robotSrv.robotState(r.robotCode).robotType = r.robotType
      this.robotSrv.robotState(r.robotCode).updateRobotInfo(r)
      if (!this.robotStates.map(s => s.robotCode).includes(r.robotCode)) {
        this.robotStates.push(this.robotSrv.robotState(r.robotCode))
        this.mqSrv.subscribeMQTTsUntil(<any>['battery'], r.robotCode, this.$onDestroy)
      }
    })

    this.robotStates.filter(s => !data.map(r => r.robotCode).includes(s.robotCode)).forEach(s => {
      this.mqSrv.unsubscribeMQTTs(<any>['battery'], false, s.robotCode)
      this.selectedRobotCode = s.robotCode == this.selectedRobotCode ? null : this.selectedRobotCode
      this.robotStates = this.robotStates.filter(s2 => s2 != s)      
    })
  }

  actionAliasChanged(action : string) {
    this.resetSelectedAction()
    if(action != null){
      this.selectedAction.actionParams = (<DropListAction[]>this.taskActions).filter((a) => a.alias == action)[0]?.parameterList
      this.selectedAction.actionItem = this.selectedAction?.actionItem?.alias ? this.selectedAction.actionItem : { alias: action, properties: {} }
      this.selectedAction.actionParams?.forEach(param => {
        if (this.selectedAction.actionItem.properties[param.parameterCode] === undefined) {
          let defaultValue: any = param.defaultValue;
          defaultValue = param?.parameterType == 'NUMBER' ? Number(defaultValue) : defaultValue
          defaultValue = param?.parameterType == 'BOOLEAN' ? defaultValue == 'true' : defaultValue
          this.selectedAction.actionItem.properties[param.parameterCode] = defaultValue === undefined ? null : defaultValue
        }
      })
    }
  }

  resetSelectedAction(){
    this.selectedAction = {
      actionParams : null,
      actionItem : {
        alias : null ,
        properties : {}
      }
    }
  }

  validate(){
    if(!this.selectedRobotCode){
      this.uiSrv.showNotificationBar('Please select a robot first')
      return false
    }
    return true
  }

  async createTask() {
    if(!this.validate()){
      return
    }
    let taskItem = new TaskItem()
    taskItem.movement = {
      floorPlanCode : this.floorPlanCode,
      pointCode : this.selectedWaypoint ? this.selectedWaypoint : this.staticWaypoint  ,
      navigationMode : AUTONOMY ,
      orientationIgnored : false,
      fineTuneIgnored : true
    }
    taskItem.actionList = this.selectedAction?.actionItem?.alias ? [this.selectedAction.actionItem] : []
    let payload = {
      taskId: "", 
      robotCode :  this.selectedRobotCode,
      robotType :  this.selectedRobotState?.robotType ,
      name: this.selectedWaypoint || taskItem.actionList.length == 0 ? 
              (this.uiSrv.translate("Navigate to ") + (this.selectedWaypoint ? this.selectedWaypoint : this.staticWaypoint)) :
             `${this.uiSrv.translate(this.taskActions.filter(a => a.alias == taskItem.actionList[0]?.alias)[0]?.name)} ${this.uiSrv.translate('at')} ${this.staticWaypoint}`  ,
      taskItemList: [
        taskItem
      ]
    }
    if( await this.dataSrv.fmsCreateTask(payload)){
      this.showCreateTaskDialog = false
    }
  }

  async createTaskFromTemplate(missionId : string){
    let ticket = this.uiSrv.loadAsyncBegin()
    const missionList : any[] = await this.dataSrv.httpSrv.fmsRequest('GET', 'mission/v1?' + new HttpParams({ fromObject: { missionId: missionId } }).toString(), undefined, false)
    this.uiSrv.loadAsyncDone(ticket)
    if(missionList.length == 0){
      this.uiSrv.showNotificationBar(this.uiSrv.translate('Template no longer found') + `(ID : ${missionId})`,'error')
    }else{
      const mission : {
        robotCode : string,
        robotType : string,
        name : string,
        taskItemList : TaskItem[]
      }  = missionList[0]
      const robotCode = this.selectedRobotCode ? this.selectedRobotCode : mission.robotCode
      const msg = this.uiSrv.translate('Are you sure') + 
                  (robotCode.length > 0 ? (this.uiSrv.translate(' to order ') + robotCode ) : '') + 
                  this.uiSrv.translate(' to execute task : ') + `${missionId} (${mission.name})` + '?'

      if(await this.uiSrv.showConfirmDialog(msg)){
        let ticket2 = this.uiSrv.loadAsyncBegin()
        let payload = {
          taskId: "", 
          robotCode :  robotCode,
          robotType :  this.selectedRobotCode ? this.selectedRobotState?.robotType : mission.robotType,
          name: mission.name,
          taskItemList: mission.taskItemList
        }
        await this.dataSrv.fmsCreateTask(payload)
        this.uiSrv.loadAsyncDone(ticket2)
      }
    }
  }
}
