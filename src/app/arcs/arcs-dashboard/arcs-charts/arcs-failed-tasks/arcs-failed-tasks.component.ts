import { Component, OnInit } from '@angular/core';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-failed-tasks',
  templateUrl: './arcs-failed-tasks.component.html',
  styleUrls: ['./arcs-failed-tasks.component.scss']
})
export class ArcsFailedTasksComponent implements OnInit {
  dialogRef
  data = []
  constructor(public uiSrv : UiService , public dataSrv : DataService) { }
  selectedTab = 'failed'
  gridSettings = {
    failed:{
      functionId:"TASK",
      apiUrl:"api/task/failed/page/v1",
      defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'createdDateTime'}]},
      columns:[
        { title: "Description", id: "name", width: 100 },
        { title: "Assigned To", id: "robotCode", width: 50 },
        { title :"Incomplete Reason" , id : "reasonCode" , width : 50},
        { title :"Reason Remarks" , id : "reasonMessage" , width : 100},
        { title: "Created Date", id: "createdDateTime",  type: "date" , width: 50 },
      ]
    }
  }

  dropDown = {
    failed : { options : [] , data : []}
  }

  async ngOnInit() {
    var ddl = await this.dataSrv.getDropLists(['taskFailReason'])
    this.dropDown.failed.options = ddl.option['taskFailReason']
    this.dropDown.failed.data = ddl.data['taskFailReason']
    this.gridSettings.failed.columns.filter(c => c.id == 'reasonCode')[0]['dropdownOptions'] = this.dropDown.failed.options
    this.gridSettings.failed.columns = JSON.parse(JSON.stringify(this.gridSettings.failed.columns))
  }

}
