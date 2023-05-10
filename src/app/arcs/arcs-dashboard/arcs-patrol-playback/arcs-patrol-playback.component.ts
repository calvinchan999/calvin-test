import { Component, OnInit } from '@angular/core';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-patrol-playback',
  templateUrl: './arcs-patrol-playback.component.html',
  styleUrls: ['./arcs-patrol-playback.component.scss']
})
export class ArcsPatrolPlaybackComponent implements OnInit {

  constructor(public uiSrv : UiService) { }
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

  delete(){

  }
}
