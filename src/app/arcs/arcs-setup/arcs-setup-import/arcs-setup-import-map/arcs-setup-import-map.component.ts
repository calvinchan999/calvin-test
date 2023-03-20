import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { HttpResponse } from '@microsoft/signalr';
import { DataService, DropListMap, DropListRobot } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-import-map',
  templateUrl: './arcs-setup-import-map.component.html',
  styleUrls: ['./arcs-setup-import-map.component.scss']
})
export class ArcsSetupImportMapComponent implements OnInit {
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
    this.getStandaloneMapList(this.frmGrp.controls['robotCode'].value)
  }

  async getStandaloneMapList(robotCode){
    if(!robotCode){
      return
    }
    this.dropdown.options.maps = []
    let ticket = this.uiSrv.loadAsyncBegin()
    let maps = await this.httpSrv.fmsRequest("GET",`dataSync/v1/mapList/${robotCode}` , undefined, false)
    this.dropdown.options.maps = this.dataSrv.getDropListOptions('maps' , maps)
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
    var mapList = (<DropListMap[]>(await this.dataSrv.getDropList('maps')).data)
    var oldMap : DropListMap = mapList.filter(m=>m.mapCode == this.frmGrp.controls['mapCode'].value && m.robotBase == this.frmGrp.controls['robotBase'].value)[0]
    if(oldMap){
      return await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Map record already exist. Are you sure to overwrite the existing record ?'))
    }
    return true
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let result  = await this.httpSrv.fmsRequest("PUT",`dataSync/v1/map/import/${this.frmGrp.controls['robotCode'].value}/${this.frmGrp.controls['mapCode'].value}` ,undefined , true , "Start Map Import")
    if(result?.['status'] == 200){
      this.dialogRef.close()
    }
    this.uiSrv.loadAsyncDone(ticket)   
  }
}
