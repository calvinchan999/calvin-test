import { Component, HostBinding, OnInit, ViewChild } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { SaTopModuleComponent } from 'src/app/standalone/sa-top-module/sa-top-module.component';

@Component({
  selector: 'app-sa-pages-delivery-fillup',
  templateUrl: './sa-pages-delivery-fillup.component.html',
  styleUrls: ['./sa-pages-delivery-fillup.component.scss']
})
export class SaPagesDeliveryFillupComponent implements OnInit {
  @HostBinding('class') view = 'cabinet'
  @ViewChild('topModule') topModule : SaTopModuleComponent
  // orderNoForm = {}
  showPinList = false
  currentContainerId = null
  pinList = [
    {containerId: '1', pin:'215648' , order:null},
    {containerId: '2', pin:'305976' , order:null},
    {containerId: '3', pin:'515211' , order:null},
  ]
  constructor(public uiSrv:UiService , public httpSrv : RvHttpService) { }

  async ngOnInit() {
    // let cabinetsResp = await this.httpSrv.rvRequest("GET", "cabinet/v1", undefined, false)
    // cabinetsResp.doorList.forEach(door=>{
    //   this.orderNoForm[door.id] = ''
    // })
  }

  ngAfterViewInit(){
    
  }

  showPinListAndConfirmDialog() {
    this.pinList.forEach(p => {
      p.order = Object.values(this.topModule.ngModelObj).filter(model => model['containerId'] == p.containerId)[0]?.['value']
    })
    this.showPinList = true
  }


  sendGUIresponseToRV(){

  }

  onDoorToggled(evt ){
    // if(evt.action == 'close' && evt.response?.status == 200){
    //   this.currentContainerId = evt.containerId
    //   this.view = 'form'
    // }
    // console.log(this.orderNoForm)
  }

}
