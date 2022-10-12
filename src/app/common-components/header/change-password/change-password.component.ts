import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CmLoginComponent } from '../../cm-login/cm-login.component';

@Component({
  selector: 'app-change-password',
  templateUrl: './change-password.component.html',
  styleUrls: ['./change-password.component.scss']
})
export class ChangePasswordComponent implements OnInit {
  frmGrp = new FormGroup({
    oldPassword : new FormControl(''),
    password : new FormControl(''),
    confirmPassword : new FormControl(''),
  })
  constructor(public uiSrv : UiService, public dataSrv : DataService , public util : GeneralUtil) { }

  dialogRef : DialogRef
  @Input() parent : CmLoginComponent
  @Input() uid
  @Input() requireOldPw = true
  @Input() oldPw
  @Input() msg : string
  @Input() bearerToken

  get parentIsLoginComponent(){
    return this.parent && this.parent instanceof CmLoginComponent
  }

  ngOnInit(): void {
    this.requireOldPw = this.requireOldPw || this.uid == this.util.getUserId()
  }

  getSubmitDataset(){
    let ret = {
      userCode : this.uid ? this.uid : this.util.getUserId(),
      oldPassword: this.oldPw ? this.oldPw : this.frmGrp.controls['oldPassword'].value,
      password :  this.frmGrp.controls['password'].value
    }
    return ret
  }

  async onClose(){
    this.bearerToken = null
    if(this.parentIsLoginComponent){
      this.parent.showChangePasswordDialog = false
    }else if(await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }

  async saveToDB(){
    let header = this.bearerToken ? {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'localeId' : this.uiSrv.selectedLangOption?.['value'],
        'Authorization': 'Bearer ' + this.bearerToken
    } : undefined
    console.log(header)
    if(this.validate() && (await this.dataSrv.saveRecord("api/user/changePassword/v1" , this.getSubmitDataset() , this.frmGrp , undefined, header)).result == true) {
      if(this.parentIsLoginComponent){
        this.parent.showChangePasswordDialog = false
      }else{
        this.dialogRef.close()
      }
    }
  }

  validate(){
    Object.keys(this.frmGrp.controls).forEach(k => this.frmGrp.controls[k].setErrors(null))
    this.frmGrp.markAsTouched()
    if(this.frmGrp.controls['password'].value != this.frmGrp.controls['confirmPassword'].value){
      this.frmGrp.controls['confirmPassword'].setErrors({message:this.uiSrv.translate("Confirm password not matched")})
      return false
    } else if(this.frmGrp.controls['oldPassword'].value == this.frmGrp.controls['password'].value){
      this.frmGrp.controls['password'].setErrors({message:this.uiSrv.translate("New password should be different with current password")})
      return false      
    }else if( this.requireOldPw && this.frmGrp.controls['oldPassword'].value.length == 0){
      this.frmGrp.controls['password'].setErrors({message:this.uiSrv.translate("Please enter current password")})
    }else if(this.frmGrp.controls['password'].value.length == 0){
      this.frmGrp.controls['password'].setErrors({message:this.uiSrv.translate("Please enter new password")})
    }else{
      return true
    }
  }


}
