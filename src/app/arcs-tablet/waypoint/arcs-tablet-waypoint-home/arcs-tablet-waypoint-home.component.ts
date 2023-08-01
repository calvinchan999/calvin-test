import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { DropListFloorplan, DropListLocation } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-tablet-waypoint-home',
  templateUrl: './arcs-tablet-waypoint-home.component.html',
  styleUrls: ['./arcs-tablet-waypoint-home.component.scss']
})
export class ArcsTabletWaypointHomeComponent implements OnInit {
  floorPlanCode = ' '
  floorPlanName 
  waypoint = ' '
  
  frmGrp = new FormGroup({
    floorPlanCode : new FormControl(null , Validators.required),
    waypoint: new FormControl(null  , Validators.required)
  })

  dropdownOptions = {
    floorplans : [],
    locations : [],
  }
  dropdownData = {
    floorplans:[],
    locations : [],
  }

  tabs = ['map' , 'task' , 'settings']
  selectedTab 
  
  showSelectWaypointDialog

  constructor(public uiSrv : UiService , public authSrv : AuthService , public router : Router , public dataSrv  : DataService , public route : ActivatedRoute ) {
    if(!this.authSrv.username){
      this.router.navigate(['/login'], { queryParams: { floorplan : this.floorPlanCode , waypoint: this.waypoint } })
    }
   }
      
  async initDropDown() {
    let tblList = ['floorplans', 'maps', 'locations'].filter(k => !this.dropdownData[k] || this.dropdownData[k].length == 0)
    let dropLists = await this.dataSrv.getDropLists(<any>tblList);
    tblList.forEach(k => this.dropdownOptions[k] = dropLists.option[k]);
    tblList.forEach(k => this.dropdownData[k] = dropLists.data[k])
  }

  async ngOnInit() {
    if(!this.authSrv.username){
      return
    }
    this.route.queryParamMap.subscribe(async (v: any) => {
      const params : {floorplan : string , waypoint : string , selectedTab? : string} | null = v?.params
      const fpCode = params?.floorplan?.trim().length > 0 ? params?.floorplan : this.dataSrv.getLocalStorage('pwaFloorPlanCode')
      const wpCode = params?.waypoint?.trim().length > 0 ? params?.waypoint : this.dataSrv.getLocalStorage('pwaWaypointCode')
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.initDropDown()
      if (fpCode  && wpCode) {
        this.uiSrv.arcsTabletMode = 'WAYPOINT'
        if ((<DropListFloorplan[]>this.dropdownData.floorplans).filter(f => f.floorPlanCode == fpCode).length == 0 ||
          (<DropListLocation[]>this.dropdownData.locations).filter(l => l.floorPlanCode == fpCode && l.pointCode == wpCode).length == 0) {
            this.refreshWaypointDropDown()
            this.showSelectWaypointDialog = true
        } else {
          this.floorPlanCode = fpCode
          this.waypoint = wpCode
          this.frmGrp.controls['floorPlanCode'].setValue(this.floorPlanCode)
          this.frmGrp.controls['waypoint'].setValue(this.waypoint)
          this.refreshWaypointDropDown()
          this.refreshFloorPlanName()
          this.selectedTab = 'map'
        }
      }
      if(params.selectedTab){
        this.selectedTab = params.selectedTab
      }
      this.uiSrv.loadAsyncDone(ticket)
    })
  }

  refreshWaypointDropDown() {
    this.dropdownOptions.locations = this.dataSrv.getDropListOptions('locations', this.dropdownData.locations, { floorPlanCode: this.frmGrp.controls['floorPlanCode'].value })
  }

  refreshFloorPlanName(){
    this.floorPlanName = (<DropListFloorplan[]>this.dropdownData.floorplans).filter(f=>f.floorPlanCode == this.floorPlanCode)[0]?.name
  }

  updateLocation(){
    this.dataSrv.setLocalStorage('pwaFloorPlanCode' ,  this.frmGrp.controls['floorPlanCode'].value)
    this.dataSrv.setLocalStorage('pwaWaypointCode' ,  this.frmGrp.controls['waypoint'].value)
    this.router.navigate(['/waypoint'], { queryParams: { floorplan : this.frmGrp.controls['floorPlanCode'].value, waypoint: this.frmGrp.controls['waypoint'].value  , selectedTab : this.selectedTab} }).then(page => { window.location.reload(); });
  }

}
