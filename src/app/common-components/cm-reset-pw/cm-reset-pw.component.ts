import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { AuthService } from 'src/app/services/auth.service';
import { ConfigService } from 'src/app/services/config.service';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-cm-reset-pw',
  templateUrl: './cm-reset-pw.component.html',
  styleUrls: ['./cm-reset-pw.component.scss']
})
export class CmResetPwComponent implements OnInit {
  guid = null
  successMsg
  constructor(public dataSrv : DataService ,public uiSrv: UiService , public authSrv : AuthService, public router : Router, public util : GeneralUtil ,  private route: ActivatedRoute) { 
    
  }
  frmGrp = new FormGroup({
    password : new FormControl(''),
    confirmPassword : new FormControl(''),
  })

  ngOnInit(): void {
    this.route.queryParamMap.subscribe(v=>{
      this.guid = v?.['params']?.['id']
    })
  }
  
  validate(){
    Object.keys(this.frmGrp.controls).forEach(k => this.frmGrp.controls[k].setErrors(null))
    this.frmGrp.markAsTouched()
    if(this.frmGrp.controls['password'].value != this.frmGrp.controls['confirmPassword'].value){
      this.frmGrp.controls['confirmPassword'].setErrors({message:this.uiSrv.translate("Confirm password not matched")})
      return false
    }else if(this.frmGrp.controls['password'].value.length == 0){
      this.frmGrp.controls['password'].setErrors({message:this.uiSrv.translate("Please enter new password")})
    }else{
      return true
    }
  }

  getSubmitDataset(){
    let ret = {
      authId : this.guid,
      password :  this.frmGrp.controls['password'].value
    }
    return ret
  }

  async saveToDB(){
    if(this.validate()) {
      let req = await this.dataSrv.httpSrv.post("api/user/resetPassword/v1" , this.getSubmitDataset())
      if(req.result !== true){
        this.uiSrv.showMsgDialog(this.uiSrv.translate("Reset Password Failed") + " : " + this.uiSrv.translate(req.msg) )
      }else{
        this.successMsg = "The password has been reset successfully"
      }
    }
  }

  

}
