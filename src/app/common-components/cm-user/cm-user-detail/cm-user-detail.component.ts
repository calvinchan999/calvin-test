import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { filter, take } from 'rxjs/operators';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { ChangePasswordComponent } from '../../header/change-password/change-password.component';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-cm-user-detail',
  templateUrl: './cm-user-detail.component.html',
  styleUrls: ['./cm-user-detail.component.scss']
})
export class CmUserDetailComponent implements OnInit {
  readonly = false
  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, public authSrv : AuthService,
              public ngZone: NgZone, public httpSrv: RvHttpService, public dataSrv:DataService) {
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }
  frmGrp = new FormGroup({
    userCode: new FormControl(null , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(null, Validators.required),
    userGroupCode: new FormControl(null , Validators.required),
    password: new FormControl(null ),
    email:new FormControl(null),
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
  pk = 'userCode'
  canSetPw = false
  parentRow = null
  get isCreate(){
    return this.parentRow == null
  }

  get code(){
    return  this.parentRow?.[this.pk]
  }



  ngOnInit(): void {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.code? "USER_EDIT" : "USER_ADD")
    this.canSetPw = this.authSrv.hasRight("USER_PASSWORD")
    if (this.readonly) {
      Object.keys(this.frmGrp.controls).forEach(k => this.frmGrp.controls[k].disable())
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
    if (this.code) {
      let ticket = await this.uiSrv.loadAsyncBegin()
      let resp = (await this.httpSrv.get("api/user/v1/" + this.code))
      if(resp){
        this.util.loadToFrmgrp(this.frmGrp ,resp)
        // console.log(data)
        // this.frmGrp.controls['typeId'].setValue(data['attributes']['actionTypeId'])//API Please Revise
      }else{
        //??
      }
      this.uiSrv.loadAsyncDone(ticket)
    } else {
      this.initialDataset = this.getSubmitDataset()
    }
  }

  async getDropdownData(){
    var userGrpDropdown = await this.dataSrv.getDropList('userGroups');
    this.dropdownData.userGroup = userGrpDropdown.data
    this.dropdownOptions.userGroup = userGrpDropdown.options
  }

  async validate() {
    let email = this.frmGrp.controls['email'].value
    var pattern = /\w+([-+.']\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*/; 
    if(email && email.length > 0 && !new RegExp(pattern).test(email)){
      this.frmGrp.controls['email'].setErrors({ message : this.uiSrv.translate("Invalid email format")})
    }
    return this.util.validateFrmGrp(this.frmGrp) &&  await this.remoteValidate()
  }

  async remoteValidate() {
    return true
  }

  getSubmitDataset() {
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    return ret
  }

  checkNoChanges() : boolean{
    return JSON.stringify(this.initialDataset) == JSON.stringify(this.getSubmitDataset())
  }

  async onClose(){
    if(this.readonly||this.checkNoChanges()||await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.windowRef.close()
    }
  }

  async saveToDB(){
    if (await this.validate() && (await this.dataSrv.saveRecord("api/user/v1" , this.getSubmitDataset() , this.frmGrp , this.isCreate )).result == true ) {
      this.windowRef.close()
    }
  }

  showChangePasswordDialog(){
    const window : DialogRef = this.uiSrv.openKendoDialog({
      content: ChangePasswordComponent ,   
      preventAction: () => true
    });
    const content = window.content.instance;
    content.parent = this
    content.dialogRef = window
    content.uid = this.code
    content.requireOldPw = false
    window.result.subscribe(()=> this.loadData())
  }
}
