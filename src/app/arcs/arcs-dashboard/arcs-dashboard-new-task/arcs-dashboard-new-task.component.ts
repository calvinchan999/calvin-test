import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ArcsDashboardComponent } from '../arcs-dashboard.component';
import { UiService } from 'src/app/services/ui.service';
import { DataService } from 'src/app/services/data.service';
import { AUTONOMY, ActionParameter, DropListAction, DropListLocation, DropListRobot, TaskItem } from 'src/app/services/data.models';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { CustomButtonComponent } from 'src/app/ui-components/threejs-viewport/custom-button/custom-button.component';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { Css2DObject3D } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { Subject } from 'rxjs';
import { RobotService } from 'src/app/services/robot.service';

@Component({
  selector: 'app-arcs-dashboard-new-task',
  templateUrl: './arcs-dashboard-new-task.component.html',
  styleUrls: ['./arcs-dashboard-new-task.component.scss']
})
export class ArcsDashboardNewTaskComponent implements OnInit , OnDestroy {
  @Input() dashboardCompRef: ArcsDashboardComponent
  @Input() singleMovementPointCode
  @Input() dropdownOptions = { robots: [] , actions :[]}
  @Input() selectedRobotCode 
  @Output()  close = new EventEmitter()
  @Input() multiMovement 
  @ViewChild('taskContainer') taskContainer : ElementRef

  taskItems : TaskItem[] = []
  dropdownData = {actions : [], locations: [] , robots : []}
  taskName 
  showActionIndex
  selectedAction : {taskItem : TaskItem , actionIndex : number , taskItemIndex : number , actionParams? : ActionParameter[] , actionItem? :  {alias : string , properties : object}}
  $onDestroy = new Subject()
  constructor(public uiSrv : UiService , public dataSrv : DataService , public robotSrv : RobotService) { 
    this.taskName = this.uiSrv.translate("New Task")
  }

  ngOnInit(): void {
    if(this.singleMovementPointCode){
      this.refreshDropDown()
    }else{
      if(this.dashboardCompRef.threeJsElRef){
        this.dashboardCompRef.threeJsElRef.uiToggles.showWaypoint = true
        this.dashboardCompRef.threeJsElRef.uiToggled('waypoint')
      }
      if(this.dashboardCompRef.pixiElRef){
        this.dashboardCompRef.pixiElRef.module.ui.toggle.showWaypoint = true
        this.dashboardCompRef.pixiElRef.module.ui.toggleWaypoint()
      }
      this.initDropDown()
    }
  } 

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  refreshDropDown() {
    this.dropdownOptions.robots = this.dashboardCompRef.robotInfos.filter(r => r.robotStatus == 'IDLE').map(r => { return { text: r.robotCode, value: r.robotCode } })
    if (this.singleMovementPointCode && this.dropdownOptions.robots.length == 0) {
      this.uiSrv.showNotificationBar("No idle robot available on this floor plan", 'warning')
      this.close.emit(true)
    }else if(this.singleMovementPointCode){
      this.selectedRobotCode = this.dropdownOptions.robots[0]?.value
    }
    if(this.selectedAction?.taskItem){
      let robotType = (<DropListRobot[]>this.dropdownData.robots).filter((r)=> r.robotCode == this.selectedRobotCode)[0]?.robotType 
      let point : DropListLocation = this.dropdownData.locations.filter((l:DropListLocation)=>l.floorPlanCode == this.dashboardCompRef.selectedFloorPlanCode && l.pointCode == this.selectedAction.taskItem?.movement?.pointCode)[0]
      this.dropdownOptions.actions = this.dataSrv.getDropListOptions( 'actions', this.dropdownData.actions.filter((a : DropListAction)=>(a.allowedPointTypes == null || a.allowedPointTypes.includes(point.pointType)) && (a.allowedRobotTypes == null || a.allowedRobotTypes.includes(robotType ))))
    }else{
      this.dropdownOptions.actions = this.dataSrv.getDropListOptions( 'actions', this.dropdownData.actions)
    }
  }

  async initDropDown(){
    //let dropListData = await this.dataSrv.getDropLists(<any>(['floorplans' , 'actions', 'locations'].concat(this.util.arcsApp ? ['sites','buildings'] : [])))
    let ticket = this.uiSrv.loadAsyncBegin()
    const dropData =  await this.dataSrv.getDropLists(<any>(['actions' , 'locations' , 'robots']))
    this.dropdownData = <any>dropData.data
    this.dropdownOptions = <any>dropData.option
    this.uiSrv.loadAsyncDone(ticket)
  }

  // refreshRobotDropdown(){
  //   let robotBases = (<DropListLocation[]>this.dropdownData.locations).filter(l=>l.floorPlanCode == this.dashboardCompRef.selectedFloorPlanCode && l.pointCode == this.singleMovementPointCode)[0]?.
  //   this.dropdownOptions.robots = this.dataSrv.getDropListOptions( 'robots' , this.dropdownData.robots , {robotBase :})
  // }

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
          navigationMode:  AUTONOMY ,
          orientationIgnored: true,
          fineTuneIgnored: true
        },
        actionList: [
        ]
      }]
    }

    if(this.dataSrv.fmsCreateTask(payload)){
      this.close.emit(true)
    }
  }

  addTaskItem(pointCode : string){
    if(this.taskItems[this.taskItems.length - 1 ]?.movement?.pointCode != pointCode){
      const taskItem = new TaskItem()
      taskItem.actionList = []
      taskItem.movement = {
        floorPlanCode: this.dashboardCompRef.selectedFloorPlanCode,
        pointCode: pointCode,
        fineTuneIgnored: true,
        orientationIgnored: true,
        navigationMode : AUTONOMY
      }
      this.taskItems.push(taskItem)
      this.selectedAction = null
      this.showActionIndex = this.taskItems.length - 1
    }
    this.refreshMapPoints()
  }

  refreshMapPoints(){
    if(this.dashboardCompRef.threeJsElRef){
      this.dashboardCompRef.threeJsElRef.waypointMeshes.forEach(w=>w.removeCustom2DObject())
      this.taskItems.forEach(t=>{
        let pointObj = this.dashboardCompRef.threeJsElRef.waypointMeshes.filter(w=> t.movement?.pointCode == w.pointCode)[0]
        let text = this.taskItems.filter(t=>t.movement?.pointCode == pointObj.pointCode).map(t=> (this.taskItems.indexOf(t) + 1).toString()).join(" , ")
        if(!pointObj.custom2Dobj){
          pointObj.appendCustom2DObject(0 , 0 , (pointObj.glbSettings.size * 10) * pointObj.master.ROSmapScale)
          pointObj.custom2Dobj.toolTipCompRef.instance.cssClass = 'task-item-seq'
        }
        pointObj.custom2Dobj.toolTipCompRef.instance.content = text
      })
    }else if(this.dashboardCompRef.pixiElRef){
      this.dashboardCompRef.pixiElRef.viewport.allPixiWayPoints.forEach(p=>p.setTaskItemSeq(''))
      this.taskItems.forEach(t=>{
        let point : PixiWayPoint =  this.dashboardCompRef.pixiElRef.viewport.allPixiWayPoints.filter(p=>p.waypointName == t.movement?.pointCode)[0]
        let text = this.taskItems.filter(t=>t.movement?.pointCode == point.waypointName).map(t=> (this.taskItems.indexOf(t) + 1).toString()).join(" , ")
        point.setTaskItemSeq(text)
      })
      this.dashboardCompRef.pixiElRef.viewport.selectedGraphics = null
    }
  }


  drop(event: CdkDragDrop<string[]>) {
    let showActionIndexItem = this.taskItems[this.showActionIndex]
    moveItemInArray(this.taskItems, event.previousIndex, event.currentIndex);
    this.taskItems.forEach(t => {
      if (t.movement?.pointCode == this.taskItems[this.taskItems.indexOf(t) - 1]?.movement.pointCode) {
        this.taskItems[this.taskItems.indexOf(t) - 1].actionList = t.actionList.concat(this.taskItems[this.taskItems.indexOf(t) - 1].actionList)
        this.taskItems = this.taskItems.filter(t2 => t2 != t)
      }
    })
    this.showActionIndex = showActionIndexItem ? this.taskItems.indexOf(showActionIndexItem) : this.showActionIndex
    this.selectedAction = null
    this.refreshMapPoints()
  }

  removeTaskItem(item: TaskItem) {
    this.selectedAction = this.selectedAction?.taskItem == item ? null : this.selectedAction
    this.taskItems = this.taskItems.filter(t => t != item)
    this.refreshMapPoints()
  }

  actionAliasChanged(action) {
    this.selectedAction.actionParams = (<DropListAction[]>this.dropdownData.actions).filter((a) => a.alias == action)[0]?.parameterList
    this.selectedAction.actionItem = this.selectedAction.actionItem ? this.selectedAction.actionItem : { alias: action, properties: {} }
    this.selectedAction.actionParams?.forEach(param => {
      if (this.selectedAction.actionItem.properties[param.parameterCode] === undefined) {
        let defaultValue: any = param.defaultValue;
        defaultValue = param?.parameterType == 'NUMBER' ? Number(defaultValue) : defaultValue
        defaultValue = param?.parameterType == 'BOOLEAN' ? defaultValue == 'true' : defaultValue
        this.selectedAction.actionItem.properties[param.parameterCode] = defaultValue === undefined ? null : defaultValue
      }
    })
  }

  removeSelectedAction(){
    if(this.selectedAction?.taskItem?.actionList){
      this.selectedAction.taskItem.actionList = this.selectedAction.taskItem.actionList.filter(a=>a!=this.selectedAction.actionItem)
      this.selectedAction = null
    }
  }

  async createStandardTask(){
    let payload = {
      taskId: "", 
      robotCode :  this.selectedRobotCode,
      robotType :  (<DropListRobot[]>this.dropdownData.robots).filter((r)=> r.robotCode == this.selectedRobotCode)[0]?.robotType ,
      name : this.taskName,
      taskItemList: this.taskItems
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp = await this.dataSrv.httpSrv.post('api/task/v1', payload)
    this.uiSrv.loadAsyncDone(ticket)
    resp = resp ? resp : { result: false }
    if (resp?.result) {
      this.uiSrv.showNotificationBar('Sent Successful' , 'success')
      this.taskItems = []
      this.refreshMapPoints()
      this.dashboardCompRef.rightMapPanel.panelMode = null
    } else {
      this.uiSrv.showNotificationBar('Sent Failed ' + resp?.msg ? ` - ${resp?.msg}`: '' , 'error')
    }
  }


}
