import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { filter, take } from 'rxjs/operators';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'cm-action-action',
  templateUrl: './cm-action.component.html',
  styleUrls: ['./cm-action.component.scss']
})
export class CmActionComponent implements OnInit {
  readonly = false
  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, 
              public ngZone: NgZone, public httpSrv: RvHttpService, public dataSrv:DataService , public authSrv : AuthService) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }
  frmGrp = new FormGroup({
    actionId: new FormControl(null),
    // actionCode: new FormControl('' , Validators.required),
    actionName: new FormControl(''),
    typeIds: new FormControl(null),
    actionAlias: new FormControl(null, Validators.required),
    actionClass: new FormControl(''),
    updatedDate: new FormControl(null),
    createdDate: new FormControl(null),
  })

  initialDataset = null
  windowRef
  parent
  dropdownData = {
    types:[],
    alias:[]
  }

  dropdownOptions ={
    types:[],
    alias:[]
  }

  loadingTicket

  isTableLoading = false
  subscriptions = []
  aliasParas = {}
  pk = 'actionId'
  get id(){
    return this.frmGrp.controls[this.pk].value
  }
  set id(v){
    this.frmGrp.controls[this.pk].setValue(v)
  }



  ngOnInit(): void {
    this.readonly =  this.readonly || !this.authSrv.hasRight(this.id? "ACTION_EDIT" : "ACTION_ADD");
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>this.frmGrp.controls[k].disable())
    }
    // this.subscriptions.push(this.windowRef.window.instance.close.subscribe(()=>this.onClose()))
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubsribe())
  }


  async ngAfterViewInit() {
    await this.getDropdownData()
    await this.loadData()
    // this.frmGrp.controls['documentName']['uc'].textbox.input.nativeElement.disabled = true
    // this.uiSrv.loadAsyncDone(this.loadingTicket)

  }

  async loadData() {
    if (this.id) {
      let ticket = await this.uiSrv.loadAsyncBegin()
      let resp = (await this.httpSrv.get("api/robot/action/v1?action_id=" + this.id))
      if(resp){
        resp['action']['typeIds'] = ( resp['action']['typeIds'] ?  resp['action']['typeIds'] : '').split(',').map(i=>Number(i))
        this.util.loadToFrmgrp(this.frmGrp ,resp['action'])
        // console.log(data)
        // this.frmGrp.controls['typeId'].setValue(data['attributes']['actionTypeId'])//API Please Revise
        await this.refreshParam()
        this.loadParams(resp['parameters'])       
      }else{
        //??
      }
      this.uiSrv.loadAsyncDone(ticket)
    } else {
      this.initialDataset = this.getSubmitDataset()
    }
  }

  async getDropdownData(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let typeDropObj = await this.dataSrv.getDropList("types");
    this.dropdownData.types = typeDropObj.data
    this.dropdownOptions.types =  typeDropObj.options
    let aliases = await this.httpSrv.fmsRequest("GET","action/v1/alias",undefined,false)
    this.dropdownData.alias = aliases.map(a=>{return {text: a , value : a}})
    this.dropdownOptions.alias = JSON.parse(JSON.stringify(this.dropdownData.alias))
    console.log( this.dropdownOptions)
    this.uiSrv.loadAsyncDone(ticket)
    // this.dropdownData.maps = await this.http.get("api/map/v1/droplist/plan" + (this.id ? ("?plan_id=" + this.id) : ''))
    // this.dropdownData.buildings = await this.http.get("api/locations/building/v1")
    // this.dropdownOptions.buildings = this.dropdownData.buildings.map(b=>{return {text: b['displayName'] , value:b['id']}});
    // this.uiSrv.loadAsyncDone(ticket)
  }

  loadParams(paramList){
    let tmpObjs =  this.aliasParas[this.frmGrp.controls['actionAlias'].value]
    paramList.forEach(p => {
      let targetObj = tmpObjs.filter(o=>o.key == p['actionParameter'])[0]
      if(!targetObj){
        console.log('Parameter no longer found from RV API : [' + p['actionParameter'] + ']')
      }else{
        targetObj['form'].controls['label'].setValue(p['actionParameterName'])
      }
    });
  }

  async refreshParam(){
    let alias = this.frmGrp.controls['actionAlias'].value
    if(alias!=null && !Object.keys(this.aliasParas).includes(alias)){
      let ticket = this.uiSrv.loadAsyncBegin()
      let params = (await this.httpSrv.fmsRequest("GET","action/v1/parameter/" + alias,undefined,false))
      this.aliasParas[alias] = params.map(p=>{return {key: p.name ,  datatype: p.type ,  form: new FormGroup({label : new FormControl()})}})
      this.uiSrv.loadAsyncDone(ticket)
    }
  }

  async validate() {
    return this.util.validateFrmGrp(this.frmGrp) 
  }


  getSubmitDataset() {
    let action = {}
    Object.keys(this.frmGrp.controls).forEach(k=>{  action[k] = this.frmGrp.controls[k].value})
    action[this.pk] = this.id ? this.id : 0
    action['actionCode'] = this.frmGrp.controls['actionAlias'].value
    action['typeIds'] = action['typeIds'] ? action['typeIds'].join(',') : ''
    let parameters = []
    if(this.frmGrp.controls['actionAlias'].value){
      let paramObjs = this.aliasParas[this.frmGrp.controls['actionAlias'].value]
      parameters = paramObjs.map(o=> {return  {
        actionAlias: this.frmGrp.controls['actionAlias'].value , 
        actionParameter:o.key ,
        actionParameterName: o.form.controls.label.value ? o.form.controls.label.value : ''
      }})
    }
    return {
      action: action,
      parameters:parameters
    }
  }

  checkNoChanges() : boolean{
    return JSON.stringify(this.initialDataset) == JSON.stringify(this.getSubmitDataset())
  }

  async onClose(){
    if(this.readonly || this.checkNoChanges()||await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.windowRef.close()
    }
  }

  async saveToDB(){
    if (await this.validate() && (await this.dataSrv.saveRecord("api/robot/action/v1" , this.getSubmitDataset() )).result == true) {
      this.windowRef.close()
    }
  }
}
