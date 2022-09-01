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
import { ArcsSetupComponent } from '../arcs-setup.component';
@Component({
  selector: 'app-arcs-setup-point-type',
  templateUrl: './arcs-setup-point-type.component.html',
  styleUrls: ['./arcs-setup-point-type.component.scss']
})
export class ArcsSetupPointTypeComponent implements OnInit {
  readonly = false
  @ViewChild('pixi') pixiElRef : DrawingBoardComponent
  constructor(public uiSrv: UiService, public dialogSrv: DialogService, public ngZone: NgZone, public httpSrv: RvHttpService,
    public signalRSrv: SignalRService, public util: GeneralUtil, public dataSrv: DataService, public authSrv: AuthService) {
  }

  frmGrp = new FormGroup({
    code: new FormControl(null , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(null, Validators.required),
    base64Image : new FormControl(""),
    modifiedDateTime: new FormControl(null),
  })

  dialogRef
  @Input() parent: ArcsSetupComponent

  $onDestroy = new Subject()

  @Input() parentRow = null

  get isCreate() {
    return this.parentRow == null
  }
  get code(): string[] {
    return [this.parentRow?.scheduleId]
  }
  functionId = "GUI_POINT_TYPE"
  primaryKey = 'code'

  async ngOnInit() {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.functionId + (this.parentRow ?  "_EDIT" : "_ADD"))
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>this.frmGrp.controls[k].disable())
    }
  }

  ngOnDestroy() {
    this.$onDestroy.next()
  }


  async ngAfterViewInit() {
    if (this.parentRow) {
      await this.loadData()
    }
    let getIconBase64 = ()=> (!this.frmGrp.controls['base64Image'].value || this.frmGrp.controls['base64Image'].value == '' ? undefined : this.frmGrp.controls['base64Image'].value)
    this.frmGrp.controls['code'].valueChanges.pipe(takeUntil(this.$onDestroy)).subscribe(v =>{
      if( this.pixiElRef.allPixiPoints[0]){
        this.pixiElRef.allPixiPoints[0].text = v.toUpperCase()
      }
    })
    this.pixiElRef.initDone$.subscribe(async () => {
      this.pixiElRef._ngPixi.background = 0xAAAAAA
      this.pixiElRef.loadDemoWaypoint(this.frmGrp.controls['code'].value,  getIconBase64());
    }) 
  }

  async loadData() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let data = await this.dataSrv.httpSrv.get('api/customization/pointType/v1/' + this.parentRow[this.primaryKey])
    this.util.loadToFrmgrp(this.frmGrp , data)
    this.uiSrv.loadAsyncDone(ticket)
  }

  valueChange(evt) {

  }

  async validate() {
    if (!this.util.validateFrmGrp(this.frmGrp)) {
      return false
    }
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
    if ((await this.dataSrv.saveRecord("api/customization/pointType/v1", ds,  this.frmGrp , true)).result == true) { // ONLY have POST method for schedule
      this.dialogRef.close()
    }
  }
}
