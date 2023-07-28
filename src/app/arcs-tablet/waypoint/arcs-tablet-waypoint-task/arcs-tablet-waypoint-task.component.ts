import { Component, Input, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { RobotInfo } from 'src/app/arcs/arcs-dashboard/arcs-dashboard.component';
import { ARCS_STATUS_MAP, RobotStatusARCS } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { MqService } from 'src/app/services/mq.service';
import { RobotService, RobotState } from 'src/app/services/robot.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-tablet-waypoint-task',
  templateUrl: './arcs-tablet-waypoint-task.component.html',
  styleUrls: ['./arcs-tablet-waypoint-task.component.scss']
})
export class ArcsTabletWaypointTaskComponent implements OnInit {
  @Input() floorPlanCode = ''
  robotStates : RobotState[] = []  
  constructor(public dataSrv : DataService , public robotSrv : RobotService , public mqSrv : MqService , public uiSrv : UiService) { }
  $onDestroy = new Subject<any>()
  ARCS_STATUS_MAP = ARCS_STATUS_MAP
  ngOnDestroy(){
    this.$onDestroy.next()
  }

  async ngOnInit() {
    let data : RobotStatusARCS [] = await this.dataSrv.httpSrv.fmsRequest('GET', 'robot/v1/info?floorPlanCode=' + this.floorPlanCode, undefined, false);   
    this.refreshRobotStates(data);
    this.mqSrv.subscribeMQTTUntil('arcsRobotStatusChange' , this.floorPlanCode , this.$onDestroy)
    this.mqSrv.data.arcsRobotStatusChange.pipe(skip(1), filter(v => v != null), takeUntil(this.$onDestroy)).subscribe((data: RobotStatusARCS[]) => {
      this.refreshRobotStates(data)
    })
  }

  refreshRobotStates(data: RobotStatusARCS[]) {
    data.forEach(r => {
      this.robotSrv.robotState(r.robotCode).updateRobotInfo(r)
      if (!this.robotStates.map(s => s.robotCode).includes(r.robotCode)) {
        this.robotStates.push(this.robotSrv.robotState(r.robotCode))
        this.mqSrv.subscribeMQTTsUntil(<any>['battery'], r.robotCode, this.$onDestroy)
      }
    })

    this.robotStates.filter(s => !data.map(r => r.robotCode).includes(s.robotCode)).forEach(s => {
      this.mqSrv.unsubscribeMQTTs(<any>['battery'], false, s.robotCode)
      this.robotStates = this.robotStates.filter(s2 => s2 != s)
    })

  }
}
