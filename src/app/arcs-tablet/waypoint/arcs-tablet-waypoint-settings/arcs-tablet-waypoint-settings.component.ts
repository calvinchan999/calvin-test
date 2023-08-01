import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-tablet-waypoint-settings',
  templateUrl: './arcs-tablet-waypoint-settings.component.html',
  styleUrls: ['./arcs-tablet-waypoint-settings.component.scss']
})
export class ArcsTabletWaypointSettingsComponent implements OnInit {
@Input() staticWaypoint  
@Input() floorPlanCode
@Input() floorPlanName
@Output() selectLocation = new EventEmitter()
  constructor(public uiSrv : UiService , public authSrv : AuthService) { }

  ngOnInit(): void {
  }

}
