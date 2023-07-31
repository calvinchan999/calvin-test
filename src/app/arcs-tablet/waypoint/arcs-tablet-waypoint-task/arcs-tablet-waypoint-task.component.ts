import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { RobotInfo } from 'src/app/arcs/arcs-dashboard/arcs-dashboard.component';
import { ARCS_STATUS_MAP, AUTONOMY, ActionParameter, DropListAction, DropListLocation, RobotStatusARCS, TaskItem } from 'src/app/services/data.models';
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
  @Input() fixedWaypoint  
  robotStates : RobotState[] = []  
  constructor(public dataSrv : DataService , public robotSrv : RobotService , public mqSrv : MqService , public uiSrv : UiService) { 
    this.resetSelectedAction()
  }
  $onDestroy = new Subject<any>()
  ARCS_STATUS_MAP = ARCS_STATUS_MAP
  selectedRobotCode = null
  selectedWaypoint = null
  selectedAction : { actionParams? : ActionParameter[] , actionItem? :  {alias : string , properties : object}}
  showCreateTaskDialog = false

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  tabs = [
    { id: 'destination', label: 'Destination' },
    { id: 'action', label: 'Action' }
  ]
  selectedTab = 'destination'
  waypoints: DropListLocation[] = []
  taskActions : DropListAction [] = []

  async ngOnInit() {
    const ticket = this.uiSrv.loadAsyncBegin()
    let data : RobotStatusARCS [] = await this.dataSrv.httpSrv.fmsRequest('GET', 'robot/v1/info?floorPlanCode=' + this.floorPlanCode, undefined, false);   
    this.refreshRobotStates(data);
    this.mqSrv.subscribeMQTTUntil('arcsRobotStatusChange' , this.floorPlanCode , this.$onDestroy)
    this.mqSrv.data.arcsRobotStatusChange.pipe(skip(1), filter(v => v != null), takeUntil(this.$onDestroy)).subscribe((data: RobotStatusARCS[]) => {
      this.refreshRobotStates(data)
    })
    const DDL = await this.dataSrv.getDropLists(['actions' , 'locations'])

    this.waypoints = DDL.data['locations'].filter((l:DropListLocation) => l.floorPlanCode == this.floorPlanCode) 
    this.taskActions = DDL.data['actions']
    console.log(this.waypoints)
    console.log(this.taskActions)
    this.uiSrv.loadAsyncDone(ticket)
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
      pointCode : this.selectedWaypoint ? this.selectedWaypoint : this.fixedWaypoint  ,
      navigationMode : AUTONOMY ,
      orientationIgnored : false,
      fineTuneIgnored : true
    }
    taskItem.actionList = this.selectedAction?.actionItem?.alias ? [this.selectedAction.actionItem] : []
    let payload = {
      taskId: "", 
      robotCode :  this.selectedRobotCode,
      robotType :  this.robotStates.filter((r)=> r.robotCode == this.selectedRobotCode)[0]?.robotType ,
      name : this.uiSrv.translate("Navigate to ") + this.selectedWaypoint,
      taskItemList: [
        taskItem
      ]
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp = await this.dataSrv.httpSrv.post('api/task/v1', payload)
    this.uiSrv.loadAsyncDone(ticket)
    resp = resp ? resp : { result: false }
    if (resp?.result) {
      this.uiSrv.showNotificationBar('Sent Successful' , 'success')
      this.showCreateTaskDialog = false
    } else {
      this.uiSrv.showNotificationBar('Sent Failed ' + resp?.msg ? ` - ${resp?.msg}`: '' , 'error')
    }
  }

}
