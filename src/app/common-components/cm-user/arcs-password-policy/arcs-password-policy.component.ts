import { Component, OnInit , Input} from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-password-policy',
  templateUrl: './arcs-password-policy.component.html',
  styleUrls: ['./arcs-password-policy.component.scss']
})
export class ArcsPasswordPolicyComponent implements OnInit {

  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil , public authSrv : AuthService){ }
  frmGrp = new FormGroup({
    minLength: new FormControl(null),
    minUpperCase: new FormControl(null),
    minLowerCase: new FormControl(null),
    minDigit: new FormControl(null),
    minSymbol: new FormControl(null),
    reusableAfter: new FormControl(null),
    expireAfterDays: new FormControl(null),    
    notifyExpiryBeforeDays:new FormControl(null),
    modifiedDateTime:new FormControl(null),
  })
  readonly
  $onDestroy = new Subject()
  ngOnDestroy(){
    this.$onDestroy.next()
  }
  async ngOnInit(){
    this.frmGrp.controls['expireAfterDays'].valueChanges.subscribe(v=> {
      if(this.frmGrp.controls['notifyExpiryBeforeDays'].value > v){
        this.frmGrp.controls['notifyExpiryBeforeDays'].setValue(null)
      }
    })
    this.readonly = !this.authSrv.hasRight('PASSWORD_POLICY_EDIT')
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=> this.frmGrp.controls[k].disable())
    }
    this.loadData()
  }

  async loadData(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let data = await this.httpSrv.get('api/passwordPolicy/v1')
    if(data){
      this.util.loadToFrmgrp(this.frmGrp, data)
    }
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
    return this.util.validateFrmGrp(this.frmGrp)
  }

  async saveToDB() {
    if (!await this.validate()) {
      return
    }
    if(await (await this.dataSrv.saveRecord("api/passwordPolicy/v1", await this.getSubmitDataset(), this.frmGrp, true)).result){
      this.loadData()
    }
  }
}
