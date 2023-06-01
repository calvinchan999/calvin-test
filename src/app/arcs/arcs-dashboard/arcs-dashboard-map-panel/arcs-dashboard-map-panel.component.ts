import { Component, Input, OnInit } from '@angular/core';
import { WaypointState } from 'src/app/services/data.models';
import { MapService } from 'src/app/services/map.service';
import { UiService } from 'src/app/services/ui.service';
import { WaypointMarkerObject3D } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';


@Component({
  selector: 'app-arcs-dashboard-map-panel',
  templateUrl: './arcs-dashboard-map-panel.component.html',
  styleUrls: ['./arcs-dashboard-map-panel.component.scss']
})
export class ArcsDashboardMapPanelComponent implements OnInit {
  @Input() panelType : 'BOTTOM' | 'LEFT'
  @Input() waypointState : WaypointState 
  @Input() floorPlanCode : string
  constructor(public mapSrv : MapService , public uiSrv : UiService) { 

  }

  ngOnInit(): void {
  }

  async selectedMapObjChange(obj) {
    this.waypointState  = null
    if (obj instanceof PixiWayPoint || obj instanceof WaypointMarkerObject3D) {
      let pointCode = obj instanceof PixiWayPoint ? obj.code : obj.pointCode
      this.waypointState = await this.mapSrv.getWayPointState(this.floorPlanCode, pointCode)
      this.waypointState =  this.waypointState ?  this.waypointState : {
        floorPlanCode : this.floorPlanCode,
        pointCode : pointCode,
        reserve : null ,
        wait : [],
        pointType : obj.pointType
      }
    }
  }

}
