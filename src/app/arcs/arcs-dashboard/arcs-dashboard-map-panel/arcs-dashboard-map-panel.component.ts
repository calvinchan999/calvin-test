import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { TaskItem, WaypointState } from 'src/app/services/data.models';
import { MapService } from 'src/app/services/map.service';
import { UiService } from 'src/app/services/ui.service';
import { ElevatorObject3D, Object3DCommon, RobotObject3D, WaypointMarkerObject3D } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { PixiRobotMarker, PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { ArcsDashboardNewTaskComponent } from '../arcs-dashboard-new-task/arcs-dashboard-new-task.component';
import { ArcsDashboardComponent, RobotInfo } from '../arcs-dashboard.component';
import { Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { RobotService, RobotState } from 'src/app/services/robot.service';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { ArcsLiftIotComponent } from '../../arcs-iot/arcs-lift-iot/arcs-lift-iot.component';
import { MqService } from 'src/app/services/mq.service';
import { PixiGraphics } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-base-graphics';


@Component({
  selector: 'app-arcs-dashboard-map-panel',
  templateUrl: './arcs-dashboard-map-panel.component.html',
  styleUrls: ['./arcs-dashboard-map-panel.component.scss']
})
export class ArcsDashboardMapPanelComponent implements OnInit , OnDestroy {
  @Input() waypointState : WaypointState 
  @Input() robotState : RobotState
  @Input() liftCode : string 
  @Input() floorPlanCode : string
  @Input() parent : ArcsDashboardComponent
  @Input() panelMode: 'CREATE-TASK'
  @ViewChild('newTaskComp') newTaskCompRef : ArcsDashboardNewTaskComponent
  pointTypeIconClassMap = {
    LIFT : "mdi mdi-elevator-passenger-outline",
    TURNSTILE : "mdi mdi-turnstile",
    LOBBY : "mdi mdi-human-queue",
    CHARGING_STATION : "mdi mdi-battery-charging"
  }

  get taskComp() {
    return this.parent.rightMapPanel.newTaskCompRef
  }
  get isCreatingTask() {
    return this.parent.rightMapPanel.panelMode == 'CREATE-TASK' 
  }
  showNewTaskDialog = false
  _showNewTaskPanel = false
  robotType = null

  set showNewTaskPanel(v) {
    this._showNewTaskPanel = v
    this.parent.rightMapPanel.robotState = this.robotState
    this.parent.rightMapPanel.panelMode = v ?  'CREATE-TASK' : null 
  }

  get showNewTaskPanel(){
    return this._showNewTaskPanel
  }

  
  @Input() bottomPanel = false
  @Input() rightPanel = false
  $onDestroy = new Subject()
  robotInfo : RobotInfo
  constructor(public mapSrv : MapService , public uiSrv : UiService , public robotSrv : RobotService , public mqSrv : MqService) { 

  }

  ngOnInit(): void {
    
  }

  ngOnDestroy(): void {
    this.$onDestroy.next()
  }

  originalToolTipsOn
  selectedObj : Object3DCommon | PixiGraphics
  async selectedMapObjChange(obj) {

    if(this.isCreatingTask){
      if (obj instanceof PixiWayPoint || obj instanceof WaypointMarkerObject3D) {
        const pointCode = obj instanceof PixiWayPoint ? obj.code : obj.pointCode
        this.taskComp.addTaskItem(pointCode)
      }
      return
    }
    if(this.parent.pixiElRef && obj == null && this.selectedObj instanceof PixiGraphics && this.selectedObj.viewport.selectedGraphics == this.selectedObj){
      this.parent.pixiElRef.viewport.selectedGraphics = null
    }

    this.clearSelected()
    if(obj instanceof ElevatorObject3D || (obj instanceof PixiWayPoint && obj.pointType == 'LIFT' && obj.liftCode?.length > 0)){
      this.liftCode =  obj.liftCode
    }else if (obj instanceof PixiWayPoint || obj instanceof WaypointMarkerObject3D) {
        this.setWaypointInfoAtBottomPanel(obj)
    }else if(obj instanceof Robot || obj instanceof RobotObject3D){
      this.setRobotInfoAtBottomPanel(obj)
    }else {
      return
    }

    this.selectedObj = <any>obj
    this.setSelectedObjStyle()
    //set Style
  }

  clearSelected(){
    if (!this.originalToolTipsOn && this.selectedObj && this.selectedObj instanceof Object3DCommon) {
      this.selectedObj.toolTipAlwaysOn = false
    }
    if( this.selectedObj instanceof Object3DCommon){
        this.selectedObj.toolTipSettings.cssClass = 'label-3js'
        this.selectedObj.toolTip.element.className = 'label-3js'
    } 
    if(this.selectedObj instanceof RobotObject3D){
      this.selectedObj.refreshMiniLabel()
    }
    this.waypointState  = null
    this.robotState = null
    this.liftCode = null
  }

  setSelectedObjStyle(){
    let obj = this.selectedObj
    this.originalToolTipsOn = (obj instanceof WaypointMarkerObject3D || (obj instanceof RobotObject3D && obj.robotIotCompRef?.instance?.mode != 'MINI' ) || obj instanceof ElevatorObject3D) && obj.toolTipAlwaysOn 
    if(obj instanceof Object3DCommon){
      obj.toolTipSettings.cssClass = 'label-3js selected'
      obj.toolTipAlwaysOn = true 
    }
  }

  async setWaypointInfoAtBottomPanel(obj){
    let pointCode = obj instanceof PixiWayPoint ? obj.code : obj.pointCode
    this.waypointState = new WaypointState()
    this.waypointState.floorPlanCode = this.floorPlanCode
    this.waypointState.pointCode = pointCode
    this.waypointState.wait = null
    this.waypointState = await this.mapSrv.getWayPointState(this.floorPlanCode, pointCode)
    this.waypointState =  this.waypointState ?  this.waypointState : {
      floorPlanCode : this.floorPlanCode,
      pointCode : pointCode,
      reserve : null ,
      wait : [],
      pointType : obj.pointType
    }
  
  }

  async setRobotInfoAtBottomPanel(obj : Robot | RobotObject3D ){
    const robotCode = obj instanceof Robot  ? obj.id : obj.robotCode
    this.robotType = this.parent.robotInfos.filter(r=>r.robotCode == robotCode)[0]?.robotType
    this.robotState = this.robotSrv.robotState(robotCode)
    this.robotInfo = this.parent.robotInfos.filter(r=>r.robotCode == this.robotState?.robotCode)[0]
  }

  sendRobotClicked(){
    if(this.parent.robotInfos.filter(r=>r.robotStatus == 'IDLE').length > 0){
        this.showNewTaskDialog = true
    }else{
      this.uiSrv.showNotificationBar("No idle robot available on this floor plan" , 'warning')
    }
  }
  

}
