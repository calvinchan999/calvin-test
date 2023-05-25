import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DropListRobot } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-robot',
  templateUrl: './arcs-setup-robot.component.html',
  styleUrls: ['./arcs-setup-robot.component.scss']
})
export class ArcsSetupRobotComponent implements OnInit {
  windowRef
  parent
  parentRow
  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }
  frmGrp = new FormGroup({
    robotId: new FormControl(null),
    robotCode: new FormControl(null, Validators.required),
    robotBase: new FormControl('', Validators.required),
    name: new FormControl(''),
    robotType: new FormControl(null, Validators.required),
    robotSubType: new FormControl(null),
    robotStatus: new FormControl(null),
    batteryLevelUpperLimit: new FormControl(null),
    batteryLevelLowerLimit: new FormControl(null),
    batteryLevelCriticalLimit: new FormControl(null),
    modifiedDateTime: new FormControl(null),
  })

  dropdownData = {
    types:[],
    subTypes : [],
    status : [], 
    robots: []
  }

  dropdownOptions = {
    types:[],
    subTypes : [],
    status : [] ,
    robots: []
  }
  primaryKey = 'robotCode'

  get id() {
    return this.parentRow? this.parentRow[this.primaryKey]: this.frmGrp.controls[this.primaryKey].value
  }

  set id(v) {
    this.frmGrp.controls[this.primaryKey].setValue(v)
  }

  async getNewRobotCodes(){
    let ticket = this.uiSrv.loadAsyncBegin()
    this.dropdownData.robots = await this.dataSrv.httpSrv.fmsRequest("GET" , "robot/v1/nonexist" , undefined , false)
    this.dropdownOptions.robots = this.dropdownData.robots.map((r:DropListRobot)=> {return {value : r.robotCode , text : r.robotCode}})
    this.uiSrv.loadAsyncDone(ticket)
  }

  async onNewRobotSelected(){
    let robot : DropListRobot = this.dropdownData.robots.filter((r: DropListRobot)=> r.robotCode == this.frmGrp.controls['robotCode'].value)[0]
    this.frmGrp.controls['robotBase'].setValue(robot?.robotBase === undefined ? null : robot?.robotBase )
    this.frmGrp.controls['robotType'].setValue(robot?.robotType === undefined ? null : robot?.robotType )
    this.frmGrp.controls['robotSubType'].setValue(robot?.robotSubType  === undefined ? null : robot?.robotSubType )
  }

  async ngOnInit() {
    await this.getNewRobotCodes()
    await this.initDropdown()
    if (this.parentRow) {
      this.loadData()
    }
  }

  async loadData() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let ds = await this.httpSrv.get('api/robot/v1/' + this.id);
    this.util.loadToFrmgrp(this.frmGrp, ds)
    this.refreshSubTypeOptions()
    this.uiSrv.loadAsyncDone(ticket)
  }

  async initDropdown() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let actionDropObj = await this.dataSrv.getDropLists(["subTypes", "types"]);
    ["subTypes", "types"].forEach(k => {
      this.dropdownData[k] = actionDropObj.data[k]
      this.dropdownOptions[k] = actionDropObj.option[k]
    })
    this.dropdownOptions.subTypes = []
    this.dropdownOptions.status = [{ value: 'A', text: 'Active' }, { value: 'I', text: 'Inactive' }]
    this.uiSrv.loadAsyncDone(ticket)
  }

  refreshSubTypeOptions() {
    this.dropdownOptions.subTypes = this.dataSrv.getDropListOptions('subTypes', this.dropdownData.subTypes.filter(st => st['typeName'] == this.frmGrp.controls['robotType'].value))
  }


  async onClose() {
    if ( (!this.parentRow && this.dropdownOptions.robots.length == 0) || await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')) {
      this.windowRef.close()
    }
  }

  async getSubmitDataset(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    ret[this.primaryKey] = this.id 
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }

  async validate() {
    return this.util.validateFrmGrp(this.frmGrp)
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }

    if((await this.dataSrv.saveRecord("api/robot/v1"  , await this.getSubmitDataset(), this.frmGrp , false)).result){      
      this.windowRef.close()
    }
  }
}
