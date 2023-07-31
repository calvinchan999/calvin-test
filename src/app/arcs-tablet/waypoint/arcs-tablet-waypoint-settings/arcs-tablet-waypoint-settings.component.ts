import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-arcs-tablet-waypoint-settings',
  templateUrl: './arcs-tablet-waypoint-settings.component.html',
  styleUrls: ['./arcs-tablet-waypoint-settings.component.scss']
})
export class ArcsTabletWaypointSettingsComponent implements OnInit {
@Input() fixedWaypoint  
  constructor() { }

  ngOnInit(): void {
  }

}
