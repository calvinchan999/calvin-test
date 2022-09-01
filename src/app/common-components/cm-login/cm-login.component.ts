import { Component, Input, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { ConfigService } from 'src/app/services/config.service';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-cm-login',
  templateUrl: './cm-login.component.html',
  styleUrls: ['./cm-login.component.scss']
})
export class CmLoginComponent implements OnInit {
  @Input() showTabletLoginDialog = false
  @ViewChild('homeComp') homeComp 
  guestMode = false
  toExitGuestMode = false
  clientId
  constructor(public dataSrv : DataService ,public uiSrv: UiService , public authSrv : AuthService, public router : Router, public util : GeneralUtil ,  private route: ActivatedRoute) { 
    // this.authSrv.logout()
    this.authSrv.username = this.util.getCurrentUser()
    if(!this.uiSrv.isTablet && this.authSrv.username){
      this.router.navigate(['/home'])
    }else if(this.uiSrv.isTablet && !this.authSrv.username && !this.authSrv.isGuestMode){
      this.showTabletLoginDialog = true
      this.guestMode = true
    }else if(!this.authSrv.username && !this.util.arcsApp){
      this.router.navigate(['/login'])
    }
  }
  frmGrp = new FormGroup({
    username: new FormControl(''),
    password: new FormControl(''),
  })
  errMsg = null
  dialogRef
  ngOnInit(): void {
    this.route.queryParamMap.subscribe(v=>{
      this.clientId = v?.['params']?.['clientId']
      console.log( 'CLIENT ID : ' + this.clientId)
    })
  }

  async login(){
    let ticket = this.uiSrv.loadAsyncBegin(1000)

    let resp = await (this.authSrv.login(this.frmGrp.controls['username'].value , this.frmGrp.controls['password'].value , this.uiSrv.lang.value , this.guestMode , this.clientId).toPromise());
    this.uiSrv.loadAsyncDone(ticket,999999)
    
    if (resp?.['result'] == true) {
      if (this.toExitGuestMode) {
        this.dialogRef.close()        
        this.uiSrv.refreshDrawerItems.next(true)
      }else if (this.uiSrv.isTablet) {
        this.showTabletLoginDialog = false
        this.uiSrv.refreshDrawerItems.next(true)
      } else {
        this.router.navigate(['/home'])
      }
    } else {
      this.errMsg = this.uiSrv.translate(resp?.['msg'] ? resp?.['msg'] : 'An Error Has Occurred')
    }
  }


}
