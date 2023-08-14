import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
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
    offline : {icon : 'mdi-alert-circle-outline' , message : 'You are currently offline. Please check you network connection'}
  }
  prevRoute = '/home'
  
  constructor(public uiSrv : UiService , public route : ActivatedRoute , public router : Router) {
    this.uiSrv.loadingTickets = []
    this.uiSrv.disconnected.pipe(skip(1),takeUntil(this.$onDestroy) , filter(v=>v ==false)).subscribe(()=>{
      console.log('navigate to ' + this.prevRoute)
      this.router.navigate([this.prevRoute])
    })
   }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(takeUntil(this.$onDestroy)).subscribe((v : any)=>{
        this.type = v.params?.type ? v.params.type : this.type 
        this.prevRoute = v.params?.prevRoute ? v.params.prevRoute : this.prevRoute 
    })
  }

}
