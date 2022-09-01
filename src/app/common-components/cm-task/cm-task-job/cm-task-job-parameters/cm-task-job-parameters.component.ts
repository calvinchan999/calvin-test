import { Component, OnInit } from '@angular/core';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-cm-task-job-parameters',
  templateUrl: './cm-task-job-parameters.component.html',
  styleUrls: ['./cm-task-job-parameters.component.scss']
})
export class CmTaskJobParametersComponent implements OnInit {

  constructor(public uiSrv : UiService) { }
  parent
  row
  dialogRef 
  rowSummary
  actionName

  ngOnInit(): void {

  }

  async onClose(){
    this.dialogRef.close()
  }


}
