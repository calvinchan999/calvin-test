import { DatePipe } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { DropListFloorplan, FloorPlanAlertTypeDescMap } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { MapService } from 'src/app/services/map.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-event-detection-detail',
  templateUrl: './arcs-event-detection-detail.component.html',
  styleUrls: ['./arcs-event-detection-detail.component.scss']
})
export class ArcsEventDetectionDetailComponent implements OnInit {
  robotCode : string
  timestamp : any
  dialogRef : DialogRef
  data : {
    // detectionDateTime? : Date,
    detectionType? : string,
    floorPlanCode? : string,
    base64Image? : string
  } = {
    detectionType : null,
    floorPlanCode : null,
    base64Image : null
  }
  title
  message
  parentRow : {robotCode : string ,  timestamp : string}

  constructor(public dataSrv : DataService, public uiSrv : UiService , public mapSrv : MapService , public datePipe : DatePipe) { 
    
  }

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    if(this.parentRow){
      this.robotCode = this.parentRow.robotCode
      this.timestamp = this.parentRow.timestamp
    }
    if(this.robotCode && this.timestamp && this.mapSrv.alertImageCache?.robotId == this.robotCode && this.mapSrv.alertImageCache?.timestamp == this.timestamp){
      this.data = this.data ? this.data : {}
      this.data.base64Image =  this.mapSrv.alertImageCache.base64Image
      this.data.detectionType =  this.mapSrv.alertImageCache.detectionType
    }else{
      await this.loadData()
    }
    this.setContent()
    this.uiSrv.loadAsyncDone(ticket)
  }

  setContent(){
    this.setTitle()
    this.setMessage()
  }

  setTitle(){
    this.title = FloorPlanAlertTypeDescMap[this.data?.detectionType]
  }

  async setMessage(){
    const robotConcatWords = this.uiSrv.translate(` - Reported By `)
    const floorPlanConcatWords = this.uiSrv.translate( ` at `)
    const floorPlanName = this.data?.floorPlanCode ? (<DropListFloorplan> (await this.dataSrv.getDropListData( 'floorplans', this.data?.floorPlanCode))[0])?.name :null
    const robotFloorPlanDesc = `${robotConcatWords} ${this.robotCode} ${floorPlanName? (floorPlanConcatWords + floorPlanName) : '' }`
    const timeStr = this.datePipe.transform(new Date(this.timestamp) , 'dd/MM/yyyy HH:mm:ss')
    this.message = `[${timeStr}] ${this.uiSrv.translate(this.title)} ${robotFloorPlanDesc}`
  }

  async loadData(){
    const resp =  await this.dataSrv.httpSrv.fmsRequest("GET" , `robotDetection/v1?robotCode=${this.robotCode}&detectionDateTime=${this.timestamp}` , undefined , false)
    if(resp){
      this.data.base64Image = resp.base64Image
      this.data.detectionType = resp.detectionType
      this.data.floorPlanCode = resp.floorPlanCode
    }
  }

}
