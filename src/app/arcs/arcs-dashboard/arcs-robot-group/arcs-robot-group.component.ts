import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, PixiCommon, Robot } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { Router } from '@angular/router';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { skip, takeUntil } from 'rxjs/operators';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ListviewComponent } from 'src/app/ui-components/listview/listview.component';


@Component({
  selector: 'app-arcs-robot-group',
  templateUrl: './arcs-robot-group.component.html',
  styleUrls: ['./arcs-robot-group.component.scss']
})
export class ArcsRobotGroupComponent implements OnInit {
  parentRow
  readonly
  @ViewChild('editableGrid') editableGrid : ListviewComponent
  frmGrp = new FormGroup({
    master : new FormControl(null, Validators.required),
    groupName : new FormControl(null , Validators.required)
  })
  dropdown = {
    options : { robots : []} ,
    data : { robots : []}
  }
  listDef = [
    { id: 'drag' , type: 'drag',title: '',  width: 5 },
    { id: 'seq',  type: 'seq' , title: '#', width: 5 },
    { id: 'client', title: 'Client Robot', width: 30 , type : 'dropdown' },
    { id: 'remove', type: 'button', action: 'remove', title: '', width: 5, class: 'k-icon mdi mdi-close-thick',
      newRow: {
        id: 'add', type: 'button', action: 'add', class: 'k-icon mdi mdi-check-bold'
      }
    } 
  ] 
  clientList = []
  newClientRow = {}
  dialogRef
  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, public ngZone: NgZone, public httpSrv: RvHttpService,
              public changeDetector: ChangeDetectorRef, private dataSrv: DataService, public dialogSrv: DialogService, public authSrv: AuthService) { 
              
  }

  async ngOnInit(){
  }

  async ngAfterViewInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropList('robots')
    this.dropdown.data.robots = ddl.data
    this.dropdown.options.robots = ddl.options
    this.uiSrv.loadAsyncDone(ticket)
    this.listDef.filter(d => d.id == 'client')[0]['options'] = JSON.parse(JSON.stringify(this.dropdown.options.robots))
    this.listDef = JSON.parse(JSON.stringify(this.listDef))
  }

  validate():boolean{
    var clientRobotCodeList = this.clientList.map(c=>c.client)
    if(!this.editableGrid.validate()){
      return false
    }
    if(clientRobotCodeList.includes(this.frmGrp.controls['master'].value)){
      this.editableGrid.setErrors(clientRobotCodeList.indexOf(this.frmGrp.controls['master'].value) , 'client', "Client robot should be different from master robot")
      return false
    }
    var duplicateCode = clientRobotCodeList.filter(r=> clientRobotCodeList.filter(r2=> r2 == r).length > 1)[0]
    if(duplicateCode){
      this.editableGrid.setErrors(clientRobotCodeList.indexOf(duplicateCode) , 'client', "Duplicated Robot")
      return false
    }
    return true
  }

  async onClose(){
    // this.validate()
    if( this.readonly ||await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }

  getSubmitDataset() {
    let ret = {}
    Object.keys(this.frmGrp.controls).forEach(k => ret[k] = this.frmGrp.controls[k].value)
    return ret
  }

  async saveToDB() {
    if (!this.util.validateFrmGrp(this.frmGrp) || !await this.validate()) {
      return
    }
    let ds = this.getSubmitDataset()
    if ((await this.dataSrv.saveRecord("", ds,  this.frmGrp , true)).result == true) { // ONLY have POST method for schedule
      this.dialogRef.close()
    }
  }
}
