import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
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
    robotCode: new FormControl('', Validators.required),
    robotBase: new FormControl('', Validators.required),
    name: new FormControl(''),
    robotType: new FormControl(null, Validators.required),
    robotSubType: new FormControl(null),
    robotStatus: new FormControl(null),
    modifiedDateTime: new FormControl(null),
  })

  dropdownData = {
    types:[],
    subTypes : [],
    status : []
  }

  dropdownOptions = {
    types:[],
    subTypes : [],
    status : []
  }
  primaryKey = 'robotCode'

  get id() {
    return this.parentRow? this.parentRow[this.primaryKey]: this.frmGrp.controls[this.primaryKey].value
  }

  set id(v) {
    this.frmGrp.controls[this.primaryKey].setValue(v)
  }



  async ngOnInit() {
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
    if (await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')) {
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
