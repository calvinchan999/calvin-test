import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
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
  selector: 'app-cm-user-group',
  templateUrl: './cm-user-group.component.html',
  styleUrls: ['./cm-user-group.component.scss']
})
export class CmUserGroupComponent implements OnInit , OnDestroy {
  readonly = false
  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, public authSrv : AuthService,
              public ngZone: NgZone, public httpSrv: RvHttpService, public dataSrv:DataService) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }
  frmGrp = new FormGroup({
    userGroupCode: new FormControl(null , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(null),
    require2FALogin: new FormControl(null),
    updatedDate: new FormControl(null),
    createdDate: new FormControl(null),
  })

  initialDataset = null
  windowRef
  parent
  dropdownData = {
    userGroup:[],
  }

  dropdownOptions ={
    userGroup:[],
  }

  loadingTicket

  isTableLoading = false
  subscriptions = []
  aliasParas = {}
  accessFunctionList : {functionCode:string , name : string , functionOrder : number , functionSubOrder : number}[] = []
  accessFunctionTree : {headerName : string , 
                        checked : boolean , 
                        indeterminate : boolean , 
                        functions : {functionCode : string , name : string , checked : boolean}[]}[] = []

  pk = 'userGroupCode'
  parentRow = null
  get isCreate(){
    return this.parentRow == null
  }

  get code(){
    return  this.parentRow?.[this.pk]
  }



  async ngOnInit() {
    this.readonly = this.readonly || !this.authSrv.hasRight( this.code ? "USERGROUP_EDIT" : "USERGROUP_ADD")
    if (this.readonly) {
      Object.keys(this.frmGrp.controls).forEach(k =>  this.frmGrp.controls[k].disable())
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    this.accessFunctionList = await this.dataSrv.httpSrv.get("api/sysparas/accessFunction/v1");
    this.initFunctionTree()
    await this.loadData()
    this.uiSrv.loadAsyncDone(ticket)
    // this.subscriptions.push(this.windowRef.window.instance.close.subscribe(()=>this.onClose()))
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubsribe())
  }


  async ngAfterViewInit() {
    // let ticket = this.uiSrv.loadAsyncBegin()
    // this.accessFunctionList = await this.dataSrv.httpSrv.get("api/sysparas/accessFunction/v1");
    // this.initFunctionTree()
    // await this.loadData()
    // this.uiSrv.loadAsyncDone(ticket)
    
    // this.frmGrp.controls['documentName']['uc'].textbox.input.nativeElement.disabled = true
    // this.uiSrv.loadAsyncDone(this.loadingTicket)

  }

  initFunctionTree(){
    this.accessFunctionTree = []
    let levels = [...new Set(this.accessFunctionList.map(f=>f.functionOrder))].sort()
    levels.forEach(l=>{
      let functions = this.accessFunctionList.filter(f => f.functionOrder == l).sort((a, b) => a.functionSubOrder - b.functionSubOrder);
      let row = { headerName : functions[0]?.name ,
                  checked : false,
                  indeterminate: false,
                  functions : functions.map(f=>{return {functionCode : f.functionCode, name : f.name   , checked :false}})}
      this.accessFunctionTree.push(row)
    })
  }

  async loadData() {
    if (this.code) {
      let resp = (await this.httpSrv.get("api/user/userGroup/v1/" + this.code))
      this.util.loadToFrmgrp(this.frmGrp, resp)
      resp.accessFunction.forEach(f => {
        let matchRow =  this.accessFunctionTree.filter(funcs => funcs.functions.map(f2 => f2.functionCode).includes(f.functionCode))[0]
        if(matchRow){
          let match = matchRow.functions.filter(f3 => f3.functionCode == f.functionCode)[0]
          if(match){
            match.checked = true
          }
          this.refreshExpanionPanelHeaderCheckbox(matchRow)
        }
      })
    } else {
      this.initialDataset = this.getSubmitDataset()
    }
  }

  refreshExpanionPanelHeaderCheckbox(functionRow){
    functionRow.checked = functionRow.functions.every(f2=>f2.checked) 
    functionRow.indeterminate = !functionRow.checked && functionRow.functions.some(f2=>f2.checked)
    functionRow = JSON.parse(JSON.stringify(functionRow)) //to force update ui
  }

  changeAllSubFunction(evt , functionRow){
    functionRow.functions.forEach(f=>f.checked = evt)
  }


  async validate() {
    return this.util.validateFrmGrp(this.frmGrp) &&  await this.remoteValidate()
  }

  async remoteValidate() {
    return true
  }

  getSubmitDataset() {
    let ret = { accessFunction: ([].concat.apply([], this.accessFunctionTree.map(funcs => funcs.functions.filter(f => f.checked).map(f => f.functionCode)))).map(fid => { return { functionCode: fid } }) }
    Object.keys(this.frmGrp.controls).forEach(k => ret[k] = this.frmGrp.controls[k].value)
    return ret
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
    if (await this.validate() && (await this.dataSrv.saveRecord("api/user/userGroup/v1" , this.getSubmitDataset() , this.frmGrp , this.isCreate)).result == true) {
      this.windowRef.close()
    }
  }
}
