import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { AuthService } from 'src/app/services/auth.service';
import { ConfigService } from 'src/app/services/config.service';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CmLoginComponent } from '../cm-login.component';
import { ReCaptchaV3Service } from 'ng-recaptcha';

@Component({
  selector: 'app-forget-password',
  templateUrl: './forget-password.component.html',
  styleUrls: ['./forget-password.component.scss']
})

export class ForgetPasswordComponent implements OnInit {
  @Input() showTabletLoginDialog = false
  @ViewChild('homeComp') homeComp 
  @Input() parent : CmLoginComponent

  constructor(public recaptchaV3Service: ReCaptchaV3Service, public dataSrv : DataService ,public uiSrv: UiService , public authSrv : AuthService, public router : Router, public util : GeneralUtil ,  private route: ActivatedRoute) { 
    // this.authSrv.logout()
  }

  frmGrp = new FormGroup({
    userCode: new FormControl(''),
    email: new FormControl(''),
  })

  errMsg = null
  dialogRef : DialogRef
  successMsg = null
  ngOnInit(): void {

  }

  async confirm() {
    this.recaptchaV3Service.execute('forgetPassword')
    .subscribe(async(token) => {
      let ticket = this.uiSrv.loadAsyncBegin()
      let req = await this.dataSrv.httpSrv.post('api/user/forgotPassword/v1',
        {
          userCode: this.frmGrp.controls['userCode'].value,
          email: this.frmGrp.controls['email'].value,
          recaptchaToken : token
        }
      )
      this.uiSrv.loadAsyncDone(ticket)
  
      if(req['result'] === false){
        this.errMsg = this.uiSrv.translate(req['msg'])
      }else if(req['result'] === true){
        // this.parent.showForgetPasswordDialog = false
        this.successMsg = this.uiSrv.translate('The email for reset password has been sent successfully.')
      }
    })
  }

}
