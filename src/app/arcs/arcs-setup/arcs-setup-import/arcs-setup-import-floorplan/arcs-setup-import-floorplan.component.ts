import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpResponse } from '@microsoft/signalr';
import { DataService } from 'src/app/services/data.service';
import {  DropListFloorplan, DropListMap, DropListRobot } from 'src/app/services/data.models';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-import-floorplan',
  templateUrl: './arcs-setup-import-floorplan.component.html',
  styleUrls: ['./arcs-setup-import-floorplan.component.scss']
})
export class ArcsSetupImportFloorplanComponent implements OnInit {

  frmGrp = new FormGroup({
    robotBase: new FormControl(null, Validators.required),
    robotCode: new FormControl(null, Validators.required),
    floorPlanCode: new FormControl(null, Validators.required),
  })
  dialogRef
  dropdown = {
    data : {
      bases: [],
      robots: [],
      floorplans: []
    },
    options : {
      bases: [],
      robots: [],
      floorplans: []
    }
  }

  
  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }

  ngOnInit(): void {
    this.initDropDown()
  }

  
  async onClose() {
     this.dialogRef.close()
  }

  onRobotSelected(){
    this.frmGrp.controls['robotBase'].setValue(this.dropdown.data.robots.filter((r : DropListRobot)=> r.robotCode == this.frmGrp.controls['robotCode'].value)[0]?.robotBase)
    this.getStandaloneFloorPlanList(this.frmGrp.controls['robotCode'].value)
  }

  async getStandaloneFloorPlanList(robotCode){
    if(!robotCode){
      return
    }
    this.dropdown.options.floorplans = []
    let ticket = this.uiSrv.loadAsyncBegin()
    this.dropdown.data.floorplans =  await this.httpSrv.fmsRequest("GET",`dataSync/v1/floorPlanList/${robotCode}` , undefined, false)
    this.dropdown.options.floorplans = this.dataSrv.getDropListOptions('floorplans' , this.dropdown.data.floorplans)
    this.uiSrv.loadAsyncDone(ticket)
  }

  onBaseSelected(){
    let base =  this.frmGrp.controls['robotBase'].value
    this.dropdown.options.robots = this.dataSrv.getDropListOptions('robots' , this.dropdown.data.robots , base ? {robotBase : this.frmGrp.controls['robotBase'].value} : undefined)
  }

  async initDropDown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropLists(['robots'])
    Object.keys(ddl.data).forEach(k=> this.dropdown.data[k] = ddl.data[k])
    Object.keys(ddl.option).forEach(k=> this.dropdown.options[k] = ddl.option[k])
    this.dropdown.data.robots.forEach((r:DropListRobot)=>{
      if(!this.dropdown.options.bases.map(o=>o['value']).includes(r.robotBase)){
        this.dropdown.options.bases.push({value : r.robotBase , text : r.robotBase})
      }
    })
    this.uiSrv.loadAsyncDone(ticket)
  }

  async getSubmitDataset(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }

  async validate() {
    if(!this.util.validateFrmGrp(this.frmGrp)){
      return false
    }
    let dropLists = await this.dataSrv.getDropLists(['floorplans' , 'maps'])
    let floorPlanList = (<DropListFloorplan[]>dropLists.data['floorplans'])
    let mapList = (<DropListMap[]>dropLists.data['maps'])
    let fpCode = this.frmGrp.controls['floorPlanCode'].value
    var oldFloorPlan : DropListFloorplan = floorPlanList.filter(m=>m.floorPlanCode == fpCode)[0]
    var selectedFloorPlan : AMRfloorPlanResponse = this.dropdown.data.floorplans.filter((f:AMRfloorPlanResponse)=>f.floorPlanCode == fpCode)[0]
    var oldMap : DropListMap = mapList.filter(m=> selectedFloorPlan.map?.mapCode && m.mapCode == selectedFloorPlan.map?.mapCode && m.robotBase == this.frmGrp.controls['robotBase'].value)[0]
    if(oldFloorPlan && !await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Floor plan record already exist. Are you sure to overwrite the existing record ?'))){
      return false
    }
    if(oldMap && !await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Map record [${MAP_CODE}] linked to the floor plan already exist. Are you sure to overwrite the existing map record ?'.replace("${MAP_CODE}", selectedFloorPlan.map?.mapCode)))){    
      return false
    }
    return true
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let result  = await this.httpSrv.fmsRequest("PUT",`dataSync/v1/floorPlanCode/import/${this.frmGrp.controls['robotCode'].value}/${this.frmGrp.controls['floorPlanCode'].value}` ,undefined , true , "Start Floor Plan Import")
    if(result?.['status'] == 200){
      this.dialogRef.close()
    }
    this.uiSrv.loadAsyncDone(ticket)   
  }
}

class AMRfloorPlanResponse {
  floorPlanCode: string
  name: string
  map: {
    mapCode: string
    name: string
  }
}
