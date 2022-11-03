import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpResponse } from '@microsoft/signalr';
import { DataService, DropListMap, DropListRobot } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-export-map',
  templateUrl: './arcs-setup-export-map.component.html',
  styleUrls: ['./arcs-setup-export-map.component.scss']
})
export class ArcsSetupExportMapComponent implements OnInit {
  frmGrp = new FormGroup({
    robotBase: new FormControl(null, Validators.required),
    robotCode: new FormControl(null, Validators.required),
    mapCode: new FormControl(null, Validators.required),
  })
  dialogRef
  dropdown = {
    data : {
      bases: [],
      robots: [],
      maps: []
    },
    options : {
      bases: [],
      robots: [],
      maps: []
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


  onBaseSelected(){
    let base =  this.frmGrp.controls['robotBase'].value
    this.dropdown.options.robots = this.dataSrv.getDropListOptions('robots' , this.dropdown.data.robots , base ? {robotBase : this.frmGrp.controls['robotBase'].value} : undefined)
  }

  async getStandaloneMapList(robotCode : string) : Promise<DropListMap[]>{
    let ticket = this.uiSrv.loadAsyncBegin()
    let maps = await this.httpSrv.rvRequest("GET",`dataSync/v1/mapList/${robotCode}` , undefined, false)
    this.uiSrv.loadAsyncDone(ticket)
    return maps
  }

  async initDropDown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropLists(['robots' , 'maps'])
    // Object.keys(ddl.data).forEach(k=> this.dropdown.data[k] = ddl.data[k])
    ddl.data['maps'].forEach((m: DropListMap) => {
      if(!this.dropdown.data.maps.map((m2 : {mapCode : string , name : string}) => m2.mapCode).includes(m.mapCode)){
        this.dropdown.data.maps.push({mapCode : m.mapCode  , name : m.name})
      }
    })
    this.dropdown.data.robots = ddl.data['robots']
    Object.keys(ddl.option).forEach(k=> this.dropdown.options[k] = this.dataSrv.getDropListOptions(<any>k ,this.dropdown.data[k]))
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
    var mapList =  await this.getStandaloneMapList(this.frmGrp.controls['robotCode'].value)
    var oldMap : DropListMap = mapList.filter(m=>m.mapCode == this.frmGrp.controls['mapCode'].value)[0]
    if(oldMap){
      // var msg = this.uiSrv.translate( oldMap.floorPlanCode ? (' and remove it from floor plan ' + `[${oldMap.floorPlanCode}]`) : "")
      return await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Map record already exist in the robot. Are you sure to overwrite the existing record ?'))
    }
    return true
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let result  = await this.httpSrv.rvRequest("PUT",`dataSync/v1/map/export/${this.frmGrp.controls['robotCode'].value}/${this.frmGrp.controls['mapCode'].value}` ,undefined , true , "Start Map Export")
    if(result?.['status'] == 200){
      this.dialogRef.close()
    }
    this.uiSrv.loadAsyncDone(ticket)   
  }

}
