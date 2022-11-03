import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpResponse } from '@microsoft/signalr';
import { DataService, DropListFloorplan, DropListMap, DropListRobot } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
@Component({
  selector: 'app-arcs-setup-export-floorplan',
  templateUrl: './arcs-setup-export-floorplan.component.html',
  styleUrls: ['./arcs-setup-export-floorplan.component.scss']
})
export class ArcsSetupExportFloorplanComponent implements OnInit {

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
  }

  async getStandaloneFloorPlanList(robotCode : string) : Promise<AMRfloorPlanResponse[]>{
    let ticket = this.uiSrv.loadAsyncBegin()
    let ret = await this.httpSrv.rvRequest("GET",`dataSync/v1/floorPlanList/${robotCode}` , undefined, false)
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }

  onBaseSelected(){
    let base =  this.frmGrp.controls['robotBase'].value
    this.dropdown.options.robots = this.dataSrv.getDropListOptions('robots' , this.dropdown.data.robots , base ? {robotBase : this.frmGrp.controls['robotBase'].value} : undefined)
  }

  async initDropDown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropLists(['robots' , 'floorplans'])
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
    let fpCode = this.frmGrp.controls['floorPlanCode'].value
    let robotCode = this.frmGrp.controls['robotCode'].value
    let saFps = await this.getStandaloneFloorPlanList(robotCode)
    let arcsLinkedMap : DropListMap = (<DropListMap[]>(await this.dataSrv.getDropList('maps')).data).filter((m)=> m.floorPlanCode == fpCode && m.robotBase == this.frmGrp.controls['robotBase'].value)[0]
    let oldFloorPlan : AMRfloorPlanResponse = saFps.filter(m=>m.floorPlanCode == fpCode)[0]
    let saMaps : DropListMap[] = await this.httpSrv.rvRequest("GET",`dataSync/v1/mapList/${this.frmGrp.controls['robotCode'].value}` , undefined, false)
    let oldMap = saMaps.filter(m => arcsLinkedMap && m.mapCode == arcsLinkedMap.mapCode)[0]
    if(oldFloorPlan && !await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Floor plan record already exist in the robot. Are you sure to overwrite the existing record ?'))){
      return false
    }
    if(oldMap && !await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Map record [${MAP_CODE}] linked to the floor plan already exist in the robot. Are you sure to overwrite the existing map record ?'.replace("${MAP_CODE}", oldMap.mapCode)))){    
      return false
    }
    return true
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let result  = await this.httpSrv.rvRequest("PUT",`dataSync/v1/floorPlanCode/export/${this.frmGrp.controls['robotCode'].value}/${this.frmGrp.controls['floorPlanCode'].value}` ,undefined , true , "Start Floor Plan Export")
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
