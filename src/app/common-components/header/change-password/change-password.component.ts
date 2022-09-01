import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

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

  initialDataset
  dialogRef : DialogRef
  uid
  requireOldPw = true

  ngOnInit(): void {
    this.initialDataset = this.getSubmitDataset()
    this.requireOldPw = this.requireOldPw || this.uid == this.util.getUserId()
  }

  async checkNoChanges() {
    let initDs = JSON.parse(JSON.stringify(this.initialDataset))
    let ds = await this.getSubmitDataset();
    return JSON.stringify(initDs) == JSON.stringify(ds)
  }

  getSubmitDataset(){
    let ret = {
      userCode : this.uid ? this.uid : this.util.getUserId(),
      oldPassword: this.frmGrp.controls['oldPassword'].value,
      password :  this.frmGrp.controls['password'].value
    }
    return ret
  }


  async onClose(){
    if(await this.checkNoChanges()|| await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }

  async saveToDB(){
    if(this.validate() && (await this.dataSrv.saveRecord("api/user/changePassword/v1" , this.getSubmitDataset() , this.frmGrp)).result == true) {
      this.dialogRef.close()
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
