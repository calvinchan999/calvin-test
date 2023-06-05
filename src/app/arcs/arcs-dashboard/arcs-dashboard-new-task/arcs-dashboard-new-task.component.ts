import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ArcsDashboardComponent } from '../arcs-dashboard.component';
import { UiService } from 'src/app/services/ui.service';
import { DataService } from 'src/app/services/data.service';
import { ActionParameter, DropListAction, TaskItem } from 'src/app/services/data.models';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-arcs-dashboard-new-task',
  templateUrl: './arcs-dashboard-new-task.component.html',
  styleUrls: ['./arcs-dashboard-new-task.component.scss']
})
export class ArcsDashboardNewTaskComponent implements OnInit {
  @Input() dashboardCompRef: ArcsDashboardComponent
  @Input() singleMovementPointCode
  @Input() dropdownOptions = { robots: [] , actions :[]}
  @Input() selectedRobotCode 
  @Output()  close = new EventEmitter()
  @Input() multiMovement 
  taskItems : TaskItem[] = []
  dropdownData = {actions : []}

  showActionIndex
  selectedTaskItem : {taskItem : TaskItem , actionIndex : number , taskItemIndex : number , actionParams? : ActionParameter[] , actionItem? :  {alias : string , properties : object}}
  
  constructor(public uiSrv : UiService , public dataSrv : DataService) { }

  ngOnInit(): void {
    if(this.singleMovementPointCode){
      this.refreshDropDown()
    }else{
      this.initDropDown()
    }
  } 

  refreshDropDown() {
    this.dropdownOptions.robots = this.dashboardCompRef.robotInfos.filter(r => r.robotStatus == 'IDLE').map(r => { return { text: r.robotCode, value: r.robotCode } })
    this.selectedRobotCode = this.dropdownOptions.robots[0]?.value
    if (this.singleMovementPointCode && this.dropdownOptions.robots.length == 0) {
      this.uiSrv.showNotificationBar("No idle robot available on this floor plan", 'warning')
      this.close.emit(true)
    }
  }

  async initDropDown(){
    //let dropListData = await this.dataSrv.getDropLists(<any>(['floorplans' , 'actions', 'locations'].concat(this.util.arcsApp ? ['sites','buildings'] : [])))
    const dropData =  await this.dataSrv.getDropLists(<any>(['actions']))
    this.dropdownData = <any>dropData.data
    this.dropdownOptions = <any>dropData.option
  }

  async createSinglePointTask(){
    const robotInfo =  this.dashboardCompRef.robotInfos.filter(r=>r.robotCode == this.selectedRobotCode)[0]
    if(!robotInfo){
      this.uiSrv.showMsgDialog(`${this.selectedRobotCode} is no longer on in ${this.dashboardCompRef.selectedFloorPlanCode} now`)
      this.refreshDropDown()
      return
    }else if (robotInfo?.robotStatus == 'UNKNOWN'){
      this.refreshDropDown()
      this.uiSrv.showMsgDialog(`${this.selectedRobotCode} is no longer online now`)
      return
    }else if (robotInfo?.robotStatus != 'IDLE'){
      this.uiSrv.showMsgDialog(`${this.selectedRobotCode} is busy now.` )
      this.refreshDropDown()
      return
    }

    let payload = {
      taskId: "", 
      robotCode :  this.selectedRobotCode,
      robotType : this.dashboardCompRef.robotInfos.filter(r=>r.robotCode == this.selectedRobotCode)[0]?.robotType,
      name : "Navigate to " + this.singleMovementPointCode,
      taskItemList: [{
        actionListTimeout: 0,
        movement: {
          floorPlanCode: this.dashboardCompRef.selectedFloorPlanCode,
          pointCode: this.singleMovementPointCode,
          waypointName: this.singleMovementPointCode,
          navigationMode:  "AUTONOMY" ,
          orientationIgnored: true,
          fineTuneIgnored: true
        },
        actionList: [
        ]
      }]
    }

    let ticket = this.uiSrv.loadAsyncBegin()
    let resp = await this.dataSrv.httpSrv.post('api/task/v1', payload)
    this.uiSrv.loadAsyncDone(ticket)
    resp = resp ? resp : { result: false }
    if (resp?.result) {
      this.uiSrv.showNotificationBar('Sent Successful' , 'success')
      this.close.emit(true)
    } else {
      this.uiSrv.showNotificationBar('Sent Failed ' + resp?.msg ? ` - ${resp?.msg}`: '' , 'error')
    }
  }

  drop(event: CdkDragDrop<string[]>) {
    let showActionIndexItem = this.taskItems[this.showActionIndex]
    moveItemInArray(this.taskItems, event.previousIndex, event.currentIndex);
    this.taskItems.forEach(t => {
      if (t.movement?.pointCode == this.taskItems[this.taskItems.indexOf(t) - 1]?.movement.pointCode) {
        this.taskItems[this.taskItems.indexOf(t) - 1].actionList = this.taskItems[this.taskItems.indexOf(t) - 1].actionList.concat(t.actionList)
        this.taskItems = this.taskItems.filter(t2 => t2 != t)
      }
    })
    this.showActionIndex = showActionIndexItem ? this.taskItems.indexOf(showActionIndexItem) : this.showActionIndex
  }

  removeTaskItem(item: TaskItem) {
    this.selectedTaskItem = this.selectedTaskItem?.taskItem == item ? null : this.selectedTaskItem
    this.taskItems = this.taskItems.filter(t => t != item)
  }

  actionChanged(action){
    this.selectedTaskItem.actionParams = (<DropListAction []>this.dropdownData.actions).filter((a)=>a.alias == action)[0]?.parameterList
    this.selectedTaskItem.actionItem = this.selectedTaskItem.actionItem  ? this.selectedTaskItem.actionItem  : {alias : action , properties : {}}
    this.selectedTaskItem.actionItem.properties = {}
    this.selectedTaskItem.actionParams.forEach(param=>{
      let defaultValue : any =  param.defaultValue;
      defaultValue = param?.parameterType == 'NUMBER' ? Number(defaultValue):  defaultValue
      defaultValue = param?.parameterType  == 'BOOLEAN' ? defaultValue == 'true' : defaultValue
      this.selectedTaskItem.actionItem.properties[param.parameterCode] = defaultValue === undefined ? null : defaultValue
    })
  }



}
