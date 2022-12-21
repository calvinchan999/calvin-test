import { Component, Input, OnInit, ViewChild , Injector } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { AuthService } from 'src/app/services/auth.service';
import { ConfigService } from 'src/app/services/config.service';
import { DataService, loginResponse } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ForgetPasswordComponent } from './forget-password/forget-password.component';
import { ReCaptchaV3Service } from 'ng-recaptcha';
import { RECAPTCHA_V3_SITE_KEY, RecaptchaV3Module } from "ng-recaptcha";
import { environment } from 'src/environments/environment';

@Component({
  selector: 'app-cm-login',
  templateUrl: './cm-login.component.html',
  styleUrls: ['./cm-login.component.scss'],
  // providers: [{ provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.recaptchaSiteKey }]
})
export class CmLoginComponent implements OnInit {
  @Input() showTabletLoginDialog = false
  @ViewChild('homeComp') homeComp 
  guestMode = false
  toExitGuestMode = false
  clientId
  showForgetPasswordDialog
  changePwMsg
  me
  auth2FASegment
  recaptchaV3Service
  temporaryBearerToken
  set showChangePasswordDialog(v){
    if(!v){
      this.temporaryBearerToken = null
      this.errMsg = null
      this.auth2FASegment  = null
      this.frmGrp.controls['password'].setValue(null)
    }
    this._showChangePasswordDialog  = v
  }
  get showChangePasswordDialog(){
    return this._showChangePasswordDialog 
  }
  _showChangePasswordDialog = false
  constructor(private injector: Injector , public dataSrv : DataService ,public uiSrv: UiService , public authSrv : AuthService, public router : Router, public util : GeneralUtil ,  private route: ActivatedRoute) { 
    // this.authSrv.logout()
    this.me = this
    this.authSrv.username = this.util.getCurrentUser()
    if(!this.uiSrv.isTablet && this.authSrv.username){
      this.router.navigate(['/home'])
    }else if(this.uiSrv.isTablet && !this.authSrv.username && !this.authSrv.isGuestMode){
      this.showTabletLoginDialog = true
      this.guestMode = true
    }else if(!this.authSrv.username && !this.util.arcsApp){
      this.router.navigate(['/login'])
    }
    if(this.util.arcsApp && !this.util.config.DISABLE_RECAPTCHA){
      this.recaptchaV3Service = <ReCaptchaV3Service>this.injector.get(ReCaptchaV3Service);
    }
  }
  frmGrp = new FormGroup({
    username: new FormControl(''),
    password: new FormControl(''),
    verificationCode :  new FormControl(''),
  })
  errMsg = null
  dialogRef
  ngOnInit(): void {
    this.route.queryParamMap.subscribe(v=>{
      this.clientId = v?.['params']?.['clientId']
      console.log( 'CLIENT ID : ' + this.clientId)
    })
  }

  ngOnDestroy(){
    
  }

  async login() {
    let sendRequest = async (token) => {
      let ticket = this.uiSrv.loadAsyncBegin(1000)
      let resp : loginResponse
      try {
        resp = await (this.authSrv.login(this.frmGrp.controls['username'].value,
          this.frmGrp.controls['password'].value,
          this.uiSrv.lang.value,
          this.guestMode,
          this.clientId,
          this.auth2FASegment ? (this.frmGrp.controls['verificationCode'].value + this.auth2FASegment) : null,
          token
        ).toPromise());
      } catch (e) {
        this.uiSrv.showNotificationBar(e.message, 'error')
      }
      this.uiSrv.loadAsyncDone(ticket, 999999)
      if(resp?.msgCode == "PASSWORD_EXPIRED" || resp?.msgCode == "PASSWORD_POLICY_CHANGED"){
        // this.clientId = resp?.validationResults?.tenant_id
        this.changePwMsg = resp?.msgCode == "PASSWORD_EXPIRED" ? "Password has been expired. Please set the new one." : "Password policy has been updated. Please set the new password."
        this.temporaryBearerToken = resp?.validationResults?.access_token
        this.showChangePasswordDialog = true
        this.authSrv.tenantId = resp?.validationResults?.tenant_id ? resp?.validationResults?.tenant_id : this.authSrv.tenantId
        this.clientId = this.authSrv.tenantId 
        this.frmGrp.controls['username'].setValue(resp?.validationResults.user_id)
      }
      if (resp?.result == true) {
        this.authSrv.tenantId = resp?.validationResults?.tenant_id ? resp?.validationResults?.tenant_id : this.authSrv.tenantId
        this.clientId = this.authSrv.tenantId 
        this.errMsg = null
        this.frmGrp.controls['verificationCode'].setValue(null)
        if (this.util.arcsApp && resp?.auth2FASegment) {
          this.auth2FASegment = resp?.auth2FASegment
        } else if (this.toExitGuestMode) {
          this.dialogRef.close()
          this.uiSrv.refreshDrawerItems.next(true)
        } else if (this.uiSrv.isTablet) {
          this.showTabletLoginDialog = false
          this.uiSrv.refreshDrawerItems.next(true)
        } else {
          let recaptchaTagEl = document.getElementsByClassName("grecaptcha-badge")[0];
          if(recaptchaTagEl){
            (<HTMLElement> recaptchaTagEl).style.opacity = '0' ;
          }
          this.router.navigate(['/home'] )
          let pwExpire = resp?.validationResults?.password_expires_in
          if(pwExpire != null){
            setTimeout(()=>{
              this.uiSrv.showMsgDialog(this.uiSrv.translate("Please note that current password is expiring in {0} day" + (pwExpire > 1 ? "s" : "")).replace("{0}" , pwExpire))
            }) 
          }
        }
      } else {
        this.errMsg = this.uiSrv.translate(resp?.msg ? resp?.msg : 'An Error Has Occurred')
      }

    }
    if (this.util.standaloneApp || this.util.config.DISABLE_RECAPTCHA) {
      sendRequest(null)
    } else {
      this.recaptchaV3Service.execute('login').subscribe((token) => sendRequest(token))
    }
  }
}


    // async sendRecaptchaVerifyRequest(token : string){
    // //   var data = {
    // //     secret: 'reCAPTCHA 後台取得的「密鑰」',
    // //     response: token, 
    // //     remoteip: 
    // //   }
    // //   let req = this.dataSrv.httpSrv.post('recaptcha/api/siteverify' , {

    // //   } , undefined , undefined , 'www.google.com')
    // }

