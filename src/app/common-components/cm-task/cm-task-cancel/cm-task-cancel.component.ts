import { Component, OnInit ,HostBinding} from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-cm-task-cancel',
  templateUrl: './cm-task-cancel.component.html',
  styleUrls: ['./cm-task-cancel.component.scss']
})
export class CmTaskCancelComponent implements OnInit {

  constructor(public uiSrv : UiService , public dataSrv : DataService) { }
  dialogRef : DialogRef
  parent
  frmGrp = new FormGroup({
    reasonCode: new FormControl(),
    reasonMessage: new FormControl(),
    taskId: new FormControl(),
    taskName: new FormControl()
  })
  @HostBinding('class') cssClass = "dialog-content task-cancel"

  get taskId(){
    return this.frmGrp.controls['taskId'].value
  }

  set taskId(v){
    this.frmGrp.controls['taskId'].setValue(v)
  }

  get taskName(){
    return this.frmGrp.controls['taskName'].value
  }

  set taskName(v){
    this.frmGrp.controls['taskName'].setValue(v)
  }


  dropdown = {
    reasonCode : {
      data : [],
      options : []
    }
  }

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.dropdown.reasonCode = await this.dataSrv.getDropList('taskCancelReason')
    this.frmGrp.controls['reasonCode'].setValue(this.dropdown.reasonCode.options[0]?.value)
    this.uiSrv.loadAsyncDone(ticket)
  }

  async cancelTask() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let result = await this.dataSrv.httpSrv.fmsRequest('DELETE', 'task/v1/task?taskId=' + this.taskId + `&reasonCode=${this.frmGrp.controls['reasonCode'].value ? this.frmGrp.controls['reasonCode'].value : '' }&reasonMessage=${this.frmGrp.controls['reasonMessage'].value ? this.frmGrp.controls['reasonMessage'].value : '' }`, 
                                           undefined, true, this.uiSrv.translate("Cancel Task") + ` [${this.taskId}]`
                                        )
                                        
    this.uiSrv.loadAsyncDone(ticket)
    if(result.status == 200){
      this.dialogRef.close()
    }
  }

}
