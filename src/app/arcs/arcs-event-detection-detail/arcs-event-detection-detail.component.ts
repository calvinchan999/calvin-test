import { DatePipe } from '@angular/common';
import { HttpParams } from '@angular/common/http';
import { Component, OnInit, ViewChild } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { DropListFloorplan } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { MapService } from 'src/app/services/map.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { PixiEventMarker } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';

@Component({
  selector: 'app-arcs-event-detection-detail',
  templateUrl: './arcs-event-detection-detail.component.html',
  styleUrls: ['./arcs-event-detection-detail.component.scss']
})
export class ArcsEventDetectionDetailComponent implements OnInit {
  robotCode : string
  timestamp : any
  eventType : string
  dialogRef : DialogRef
  data : {
    // detectionDateTime? : Date,
    eventType? : string,
    floorPlanCode? : string,
    base64Image? : string,
    rosX? : number, 
    rosY? : number,
    mapCode? : string,
    metadata?: string,
    count? : number,
    confidence? : number

  } = {
    eventType : null,
    floorPlanCode : null,
    base64Image : null,
    rosX : null, 
    rosY : null,
    mapCode : null,
    metadata : null,
    count : null,
    confidence : null
  }
  title
  message
  parentRow : {robotCode : string ,  timestamp : string , eventType : string}
  eventTypesDDL 
  @ViewChild('pixi') pixiElRef : Map2DViewportComponent
  constructor(public dataSrv : DataService, public uiSrv : UiService , public mapSrv : MapService , public datePipe : DatePipe) { 
    
  }

  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.eventTypesDDL = await this.dataSrv.getDropList('robotEventTypes')
    if(this.parentRow){
      this.robotCode = this.parentRow.robotCode
      this.timestamp = this.parentRow.timestamp
      this.eventType = this.parentRow.eventType
    }
    //db may not finish record insert if user open this page immediately, so use cached data
    if(this.robotCode && this.timestamp && this.mapSrv.alertImageCache?.robotId == this.robotCode && this.mapSrv.alertImageCache?.timestamp == this.timestamp){
      this.data = this.data ? this.data : {}
      this.data.base64Image =  this.mapSrv.alertImageCache.base64Image
      this.data.eventType =  this.mapSrv.alertImageCache.detectionType
      this.data.metadata =  this.mapSrv.alertImageCache.metadata
      this.data.count =  this.mapSrv.alertImageCache.count
      this.data.confidence =this.mapSrv.alertImageCache.confidence
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
    this.title =  this.eventTypesDDL.options.filter(o=>o.value == this.eventType)[0]?.text
  }

  async setMessage(){
    const showCount = ['PEOPLE_PPC'].includes(this.data.eventType) && this.data.count != null
    const robotConcatWords = this.uiSrv.translate(` - Reported By `)
    const floorPlanConcatWords = this.uiSrv.translate( ` at `)
    const floorPlanName = this.data?.floorPlanCode ? (<DropListFloorplan> (await this.dataSrv.getDropListData( 'floorplans', this.data?.floorPlanCode))[0])?.name :null
    const robotFloorPlanDesc = `${robotConcatWords} ${this.robotCode} ${floorPlanName? (floorPlanConcatWords + floorPlanName) : '' }`
    const timeStr = this.datePipe.transform(new Date(this.timestamp) , 'dd/MM/yyyy HH:mm:ss')
    this.message = `[${timeStr}] ${this.uiSrv.translate(this.title)} ${showCount?  `(${this.uiSrv.translate('Count')} : ${this.data.count})`  : ''} ${robotFloorPlanDesc}`
  }

  async loadData(){
    const resp = await this.dataSrv.httpSrv.fmsRequest("GET", `robotEvent/v1?${new HttpParams().set("robotCode" , this.robotCode).set("eventDateTime",this.timestamp).set("eventType" , this.eventType ).toString()}`, undefined, false)
    if (resp) {
      this.data.base64Image = resp.base64Image
      this.data.eventType = resp.eventType
      this.data.floorPlanCode = resp.floorPlanCode
      this.data.rosX = resp.positionX
      this.data.rosY = resp.positionY
      this.data.mapCode = resp.mapCode
      this.data.metadata = resp.metadata
      this.data.count = resp.count
      this.data.confidence = resp.confidence
    }
    if(this.data.floorPlanCode != null){
      let floorPlan = await this.mapSrv.getFloorPlan(this.data.floorPlanCode)
      if(!floorPlan || new Date(this.timestamp) < new Date(floorPlan.modifiedDateTime)){
        console.log(!floorPlan ? 
                      `Floor plan no longer found : ${this.data.floorPlanCode}`: 
                      `Floor Plan [ ${this.data.floorPlanCode}] updated at ${this.datePipe.transform(new Date(floorPlan.modifiedDateTime) , 'dd/MM/yyyy HH:mm:ss') }. Location of event will not be shown`)
        this.data.floorPlanCode = null
      }
    }
  }

  
  tabChanged() {
    setTimeout(async () => {
      if (this.pixiElRef && this.data.floorPlanCode ) {        
        this.pixiElRef.initDone$.subscribe(async () => {
          let ticket = this.uiSrv.loadAsyncBegin()
          await this.pixiElRef.loadDataset( await this.mapSrv.getFloorPlan(this.data.floorPlanCode) , true, true , undefined, undefined, false)
          this.uiSrv.loadAsyncDone(ticket)
          // this.pixiElRef.module.ui.toggleDarkMode(this.pixiElRef.module.ui.toggle)
          if(this.data?.mapCode && this.data?.rosX!=null && this.data?.rosY!=null){
            const marker = this.pixiElRef.module.data.setPixiEventMarker(
              {
                robotId: this.robotCode,
                timestamp: this.timestamp,
                rosX: this.data.rosX,
                rosY: this.data.rosY,
                mapCode: this.data.mapCode,
                alertType: this.data.eventType,
              },
              undefined,
              this.message
            )
            if(marker){
              marker.visible = true
              const position = this.pixiElRef.viewport.toLocal(marker.getGlobalPosition())
              this.pixiElRef.setViewportCamera(position.x , position.y , undefined , true )
            }
          }
        })
      }
    })
  }

}
