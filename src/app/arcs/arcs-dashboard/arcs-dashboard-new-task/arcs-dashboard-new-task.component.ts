import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { ArcsDashboardComponent } from '../arcs-dashboard.component';
import { UiService } from 'src/app/services/ui.service';
import { DataService } from 'src/app/services/data.service';
import { TaskItem } from 'src/app/services/data.models';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

@Component({
  selector: 'app-arcs-dashboard-new-task',
  templateUrl: './arcs-dashboard-new-task.component.html',
  styleUrls: ['./arcs-dashboard-new-task.component.scss']
})
export class ArcsDashboardNewTaskComponent implements OnInit {
  @Input() dashboardCompRef: ArcsDashboardComponent
  @Input() singleMovementPointCode
  @Input() dropdownOptions = { robots: [] }
  @Input() selectedRobotCode 
  @Output()  close = new EventEmitter()
  @Input() multiMovement 
  taskItems : TaskItem[] = []
  
  constructor(public uiSrv : UiService , public dataSrv : DataService) { }

  ngOnInit(): void {
    this.refreshDropDown()
  } 

  refreshDropDown() {
    this.dropdownOptions.robots = this.dashboardCompRef.robotInfos.filter(r => r.robotStatus == 'IDLE').map(r => { return { text: r.robotCode, value: r.robotCode } })
    this.selectedRobotCode = this.dropdownOptions.robots[0]?.value
    if (this.singleMovementPointCode && this.dropdownOptions.robots.length == 0) {
      this.uiSrv.showNotificationBar("No idle robot available on this floor plan", 'warning')
      this.close.emit(true)
    }
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
    moveItemInArray(this.taskItems, event.previousIndex, event.currentIndex);
  }


}
