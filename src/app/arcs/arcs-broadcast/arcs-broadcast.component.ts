import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent, Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { Router } from '@angular/router';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { skip, takeUntil } from 'rxjs/operators';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ListviewComponent } from 'src/app/ui-components/listview/listview.component';
import { ArcsDashboardComponent } from '../arcs-dashboard/arcs-dashboard.component';
@Component({
  selector: 'app-arcs-broadcast',
  templateUrl: './arcs-broadcast.component.html',
  styleUrls: ['./arcs-broadcast.component.scss']
})
export class ArcsBroadcastComponent implements OnInit {
  parent : ArcsDashboardComponent
  parentRow
  readonly
  dialogRef
  dbTable = "broadcast"
  @HostBinding('class') cssClass : string = 'broadcast'
  frmGrp = new FormGroup({
    robotCodes : new FormControl([], Validators.required),
    subject : new FormControl(null , Validators.required),
    content : new FormControl(null )
  })

  dropdown = {
    options : { robots : []} ,
    data : { robots : []}
  }

  key = 'broadcastId'

  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, public ngZone: NgZone, public httpSrv: RvHttpService,
    public changeDetector: ChangeDetectorRef, private dataSrv: DataService, public dialogSrv: DialogService, public authSrv: AuthService) { 

  }

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropList('robots')
    this.dropdown.data.robots = ddl.data
    this.dropdown.options.robots =  this.dataSrv.getDropListOptions('robots' , ddl.data , this.parent?.robotTypeFilter ? {robotType :this.parent.robotTypeFilter.toUpperCase() } : undefined)
    await this.loadData()
    this.uiSrv.loadAsyncDone(ticket)
  }

  async loadData(){
    if(this.parentRow){
      let data = await this.dataSrv.httpSrv.get('api/broadcast/v1/' + this.parentRow[this.key])
      this.util.loadToFrmgrp(this.frmGrp, data)
    }
  }

  

  async onClose(){
    if( this.readonly ||await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }

  getSubmitDataset() {
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    return ret
  }

  async saveToDB() {
    if (!this.util.validateFrmGrp(this.frmGrp)) {
      return
    }
    let ds = this.getSubmitDataset()
    if ((await this.dataSrv.saveRecord("api/broadcast/v1", ds,  this.frmGrp , true)).result == true) { // ONLY have POST method for schedule
      this.dialogRef.close()
    }
  }
}



