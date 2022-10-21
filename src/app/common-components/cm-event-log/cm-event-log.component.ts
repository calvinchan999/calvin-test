import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Subject  } from 'rxjs';
import {  takeUntil , filter } from 'rxjs/operators';
import { DataService, DropListRobot } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
@Component({
  selector: 'cm-event-log',
  templateUrl: './cm-event-log.component.html',
  styleUrls: ['./cm-event-log.component.scss']
})
export class CmEventLogComponent implements OnInit {
  constructor(public uiSrv : UiService , public dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }
  $onDestroy = new Subject()
  ngOnInit(): void {
    this.dataSrv.unreadNotificationCount.pipe(takeUntil(this.$onDestroy) , filter(v=>v > 0)).subscribe(v=> this.dataSrv.unreadNotificationCount.next(0))
    // var storedEvents = this.dataSrv.getlocalStorage('eventLog')
    // if(storedEvents!=null){
    //   this.data = JSON.parse(storedEvents)
    // }
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

}
