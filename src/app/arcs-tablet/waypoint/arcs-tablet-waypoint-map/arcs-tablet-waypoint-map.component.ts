import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { RobotStatusARCS } from 'src/app/services/data.models';
import { MapService } from 'src/app/services/map.service';
import { MqService } from 'src/app/services/mq.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';

@Component({
  selector: 'app-arcs-tablet-waypoint-map',
  templateUrl: './arcs-tablet-waypoint-map.component.html',
  styleUrls: ['./arcs-tablet-waypoint-map.component.scss']
})
export class ArcsTabletWaypointMapComponent implements OnInit {
  @ViewChild('pixi') pixiElRef: Map2DViewportComponent
  @Input() floorPlanCode : string 
  $onDestroy : Subject<any>  = new Subject()
  constructor(public mapSrv : MapService , public mqSrv : MqService) { }

  ngOnInit(): void {
  }

  ngOnDestroy(){
    this.$onDestroy.next() 
  }

  async ngAfterViewInit() {
    this.pixiElRef?.initDone$.subscribe(async () => {
      let floorplan = await this.mapSrv.getFloorPlan(this.floorPlanCode);

      await this.pixiElRef.module.data.loadFloorPlan(this.floorPlanCode) // .loadDataset(floorplan, true, true);
      this.pixiElRef.module.robot.subscribeRobotPose([... new Set(floorplan.mapList.map(m => m.mapCode))])
      this.pixiElRef.module.data.subscribeFloorPlanAlertState()

      this.mqSrv.subscribeMQTTUntil( 'arcsRobotStatusChange', this.floorPlanCode , this.$onDestroy)
      this.mqSrv.data.arcsRobotStatusChange.pipe(skip(1), filter(v => v != null), takeUntil(this.$onDestroy)).subscribe((data: RobotStatusARCS[]) => {
        this.pixiElRef.robots.filter(r => !data.map(r2 => r2.robotCode).includes(r.id)).forEach(r => this.pixiElRef.robotModule.removeRobot(r))
      })
    })
  }
}
