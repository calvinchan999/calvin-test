import { Component, OnInit, ViewChild } from '@angular/core';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { TableComponent } from 'src/app/ui-components/table/table.component';

@Component({
  selector: 'app-arcs-patrol-playback',
  templateUrl: './arcs-patrol-playback.component.html',
  styleUrls: ['./arcs-patrol-playback.component.scss']
})
export class ArcsPatrolPlaybackComponent implements OnInit {
  @ViewChild('table') tableRef : TableComponent
  constructor(public uiSrv: UiService, public dataSrv: DataService) { }
  currentTime = 0  
  selectedRow
  tableDisabledButtons = {new : true , action : true}
  tableButtons = { new: false, action: true }
  gridColumns = [
    { title: "", type: "checkbox", id: "select", width: 30 ,fixed : true },
    { title: "Robot Code", id: "robotCode", width: 30 },
    { title: "Channel", id: "channel", width: 20 },
    { title: "Reference Date", id: "name", width: 150 },
    { title: "", type: "button", id: "play", width: 30 , icon: 'add-button k-icon k-i-play iconButton' , fixed : true  },
  ]
  data = []
  ngOnInit(): void {

  }

  async delete(){
    if (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))) {
      return
    }
   
    let resp = await this.dataSrv.deleteRecords( 'api/media/v1', this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
  }

  async loadData(evt = null) {
    await this.tableRef?.retrieveData()
  }
}
