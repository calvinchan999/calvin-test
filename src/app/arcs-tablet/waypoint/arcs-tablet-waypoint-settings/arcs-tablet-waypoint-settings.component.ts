import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { AuthService } from 'src/app/services/auth.service';
import { DropListMission } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
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
  constructor(public uiSrv : UiService , public authSrv : AuthService , public dataSrv : DataService) { }
  showBookmarkTemplateDialog = false
  bookMarkTemplateCodes = []
  taskTemplates = []
  templatesDesc = null

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.taskTemplates = (await this.dataSrv.getDropList('missions')).options
    this.uiSrv.loadAsyncDone(ticket)
    this.getBookMarkedTaskTemplatesFromLocalStorage()
    this.getBookMarkedTaskTemplatesFromLocalStorage()
  }

  getBookMarkedTaskTemplatesFromLocalStorage(){
    this.bookMarkTemplateCodes = this.dataSrv.getLocalStorage('pwaBookmarkedMissionId') ? JSON.parse(this.dataSrv.getLocalStorage('pwaBookmarkedMissionId')) : []
    this.templatesDesc = this.bookMarkTemplateCodes.join(', ')
  } 

  updateBookmarkedTaskTemplates(){
    this.dataSrv.setLocalStorage('pwaBookmarkedMissionId' , JSON.stringify(this.bookMarkTemplateCodes))
    this.getBookMarkedTaskTemplatesFromLocalStorage()
  }




  

}
