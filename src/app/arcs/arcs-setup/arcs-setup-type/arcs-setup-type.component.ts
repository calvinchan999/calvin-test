import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-type',
  templateUrl: './arcs-setup-type.component.html',
  styleUrls: ['./arcs-setup-type.component.scss']
})
export class ArcsSetupTypeComponent implements OnInit {

  windowRef
  parent
  constructor(public uiSrv : UiService , private dataSrv : DataService ,  public util : GeneralUtil , public httpSrv : RvHttpService) { }
  frmGrp = new FormGroup({
    typeId: new FormControl(null),
    typeName: new FormControl(null),
    typeStatus: new FormControl(null),
    typeCode: new FormControl('', Validators.required),
    subTypeName:new FormControl(''),
  })
  primaryKey = 'typeId'

  dropdownData = {
    types:[],
    actions:[]
  }

  dropdownOptions = {
    types:[],
    actions:[],
    status:[]
  }

  get id() {
    return this.frmGrp.controls[this.primaryKey].value ? this.frmGrp.controls[this.primaryKey].value : 0
  }

  set id(v) {
    this.frmGrp.controls[this.primaryKey].setValue(v)
  }


  async ngOnInit() {
    await this.initDropdown()
    if(this.id){
      this.loadData(this.id)
    }
  }
  
  async loadData(id){
    let ticket = this.uiSrv.loadAsyncBegin()   
    let ds = await this.httpSrv.get('api/robot/type/v1/' + this.id);
    this.util.loadToFrmgrp(this.frmGrp , ds)
    this.uiSrv.loadAsyncDone(ticket)
  }

  async initDropdown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let actionDropObj = await this.dataSrv.getDropLists(["types","actions"]);
    this.dropdownData = JSON.parse(JSON.stringify(actionDropObj.data))
    this.dropdownOptions = JSON.parse(JSON.stringify(actionDropObj.option))
    this.dropdownOptions.status = [{value : 'A' , text : 'Active' } ,{value : 'I' , text : 'Inactive' }]
    this.uiSrv.loadAsyncDone(ticket)
  }
  
  async onClose(){
    if(await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
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

    if((await this.dataSrv.saveRecord("api/robot/type/v1"  , await this.getSubmitDataset(), this.frmGrp)).result){      
      this.windowRef.close()
    }
  }

}
