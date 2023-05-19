import { Component, ElementRef, EventEmitter, OnInit } from '@angular/core';
import { DataService } from 'src/app/services/data.service';
import { MqService } from 'src/app/services/mq.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-custom-button',
  templateUrl: './custom-button.component.html',
  styleUrls: ['./custom-button.component.scss']
})
export class CustomButtonComponent implements OnInit {
  cssClass
  data 
  content
  toolTipMsg 
  toolTipMsgBinding = null
  clicked = new EventEmitter()
  //customTemplate TBD
  constructor(public mqSrv : MqService , public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
  
  }

  ngOnInit(): void {

  }

}
