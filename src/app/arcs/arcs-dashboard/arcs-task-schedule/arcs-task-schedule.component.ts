import { ChangeDetectorRef, Component, HostListener, Input, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { debounce, debounceTime, filter, skip, take, takeUntil } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth.service';
import { DataService, JMap, MapJData, ShapeJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { SignalRService } from 'src/app/services/signal-r.service';
import { UiService } from 'src/app/services/ui.service';
import { SaMapComponent } from 'src/app/standalone/sa-map/sa-map.component';
import { DrawingBoardComponent, PixiCommon, PixiPolygon, Robot } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-task-schedule',
  templateUrl: './arcs-task-schedule.component.html',
  styleUrls: ['./arcs-task-schedule.component.scss']
})
export class ArcsTaskScheduleComponent implements OnInit {
  readonly = false
  constructor(public uiSrv: UiService, public dialogSrv: DialogService, public ngZone: NgZone, public httpSrv: RvHttpService,
    public signalRSrv: SignalRService, public util: GeneralUtil, public dataSrv: DataService, public authSrv: AuthService) {
  }

  frmGrp = new FormGroup({
    id: new FormControl(),
    missionId: new FormControl(null , Validators.required),
    startDateTime: new FormControl(new Date(new Date().getFullYear() , new Date().getMonth() ,new Date().getDay() , new Date().getHours() , new Date().getMinutes() , new Date().getSeconds()) , Validators.required),
    endDateTime: new FormControl(),
    cronExpress: new FormControl(),
    name: new FormControl(""),
    remark: new FormControl(""),
    guiGenerated : new FormControl(true),
    modifiedDateTime: new FormControl(null),
  })

  dialogRef
  @Input() parent: SaMapComponent
  @Input() set id(v) {

  }
  get id() {
    return null
  }

  onDestroy = new Subject()

  @Input() parentRow = null

  get isCreate() {
    return this.parentRow == null
  }
  get code(): string[] {
    return [this.parentRow?.scheduleId]
  }

  dropdownData = { missions: [] }
  dropdownOptions = { missions: [] }
  primaryKey = 'id'


  async ngOnInit() {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.parentRow ? "TASK_SCHEDULE_EDIT" : "TASK_SCHEDULE_ADD")
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>this.frmGrp.controls[k].disable())
    }
    let missionDDL =  await this.dataSrv.getDropList('missions')
    this.dropdownData.missions = missionDDL.data
    this.dropdownOptions.missions = missionDDL.options
    if(this.parentRow){
      this.loadData()
    }
  }

  ngOnDestroy() {
    this.onDestroy.next()
  }


  ngAfterViewInit() {

  }

  async loadData() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let data = await this.dataSrv.httpSrv.get('api/task/schedule/v1/' + this.parentRow[this.primaryKey])
    this.util.loadToFrmgrp(this.frmGrp , data)
    this.uiSrv.loadAsyncDone(ticket)
  }

  valueChange(evt) {

  }

  async validate() {
    //TBD : check if map resolution == original map resolution if update
    if (!this.util.validateFrmGrp(this.frmGrp)) {
      return false
    }
    // if(!this.frmGrp.controls['startDateTime'].value){
    //   this.frmGrp.controls['startDateTime'].setErrors({required:true})
    //   return false
    // }
    return true
  }

  getSubmitDataset() {
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k => ret[k] = this.frmGrp.controls[k].value)
    return ret
  }

  async onClose() {
    if (this.readonly || (await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?'))) {
      this.dialogRef.close()
    }
  }


  async saveToDB() {
    if (!this.util.validateFrmGrp(this.frmGrp) || !await this.validate()) {
      return
    }
    let ds = this.getSubmitDataset()
    if ((await this.dataSrv.saveRecord("api/task/schedule/v1", ds,  this.frmGrp , true)).result == true) { // ONLY have POST method for schedule
      this.dialogRef.close()
    }
  }
  
}


