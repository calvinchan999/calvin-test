import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { RouteService } from 'src/app/services/route.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-cm-error-page',
  templateUrl: './cm-error-page.component.html',
  styleUrls: ['./cm-error-page.component.scss']
})
export class CmErrorPageComponent implements OnInit {
  $onDestroy = new Subject()
  type 
  errorDisplayMap = {
    offline : {icon : 'mdi-alert-circle-outline' , message : 'You are currently offline. Please check you network connection'},
    webgl : {icon : 'mdi-alert-circle-outline' ,message : 'Map cannot be shown because WebGL is not supported. Please the graphics setting of your operating system'}
  }
  prevRoute = '/home'
  
  constructor( public routeSrv : RouteService, public uiSrv : UiService , public route : ActivatedRoute , public router : Router) {
    this.uiSrv.loadingTickets = []
    this.uiSrv.disconnected.pipe(skip(1),takeUntil(this.$onDestroy) , filter(v=>v ==false && this.type == 'offline')).subscribe(()=>{
      console.log('navigate to ' + this.prevRoute)
      this.router.navigate([this.prevRoute])
    })
   }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  ngOnInit(): void {
    this.uiSrv.closeAllDialogs()
    console.log(this.routeSrv.queryParams.value)
    this.type = this.routeSrv.queryParams.value?.type ?this.routeSrv.queryParams.value.type : this.type 
    this.prevRoute = this.routeSrv.queryParams.value?.prevRoute ? this.routeSrv.queryParams.value.prevRoute : this.prevRoute 
    this.uiSrv.loadingTickets = []

    // this.route.queryParamMap.pipe(takeUntil(this.$onDestroy)).subscribe((v : any)=>{
    //     this.type = this.routeSrv.queryParams.value?.type ?this.routeSrv.queryParams.value.type : this.type 
    //     this.prevRoute = this.routeSrv.queryParams.value?.prevRoute ? this.routeSrv.queryParams.value.prevRoute : this.prevRoute 
    //     this.uiSrv.loadingTickets = []
    // })
  }

}
