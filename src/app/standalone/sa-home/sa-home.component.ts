//import standard library
import { NavigationStart, Router } from '@angular/router';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Component, OnInit, ViewChild, ViewEncapsulation  } from '@angular/core';
import { IntlService } from '@progress/kendo-angular-intl';
import { MessageService } from '@progress/kendo-angular-l10n';
import { NotificationService } from '@progress/kendo-angular-notification';
// import { CustomMessagesService } from 'src/app/services/custom-messages.service';

import { DataBindingDirective } from '@progress/kendo-angular-grid';
import { process } from '@progress/kendo-data-query';

//import utils
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DrawingBoardComponent, PixiLocPoint } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { UiService } from 'src/app/services/ui.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { Observable, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { filter, map, take } from 'rxjs/operators';
import { mixin } from 'pixi-viewport';
import { DataService } from 'src/app/services/data.service';
import { SignalRService } from 'src/app/services/signal-r.service';

@Component({
  selector: 'app-sa-home',
  templateUrl: './sa-home.component.html',
  styleUrls: ['./sa-home.component.scss']
})
export class SaHomeComponent implements OnInit {
  ngModel = {selectedPlan : null , selectedLocation : null}
  dropdownData
  dropdownOptions
  robotType
  
  taskTableColDefs = [
    { title: "Task ID", id: "taskId", width: 100 },
    { title: "Robot ID", id: "robotId", width: 70 },
    { title: "Start Time", id: "startTime", type: 'date', pipeArg: 'medium', width: 100 },
    { title: "End Time", id: "endTime", type: 'date', pipeArg: 'medium', width: 100 },
    { title: "State", id: "state", width: 50 },
  ]


  dashboardLayout = [
    // [{ id: 'pending_task' }, { id: 'battery' }, { id: 'mode' }],
    [{ id: 'status' } , { id: 'battery' }], [{ id: 'mode' } , {id:'speed'}],
    // [{ id: 'pending_task' }, { id: 'wifi_signal' }, { id: 'cellular_bars'}],
  ]//this.topModule[this.utils.config.STANDALONE_ROBOT_TYPE.toLowerCase()]

  tabletHomeLayout = [
    [{ id: 'status' }], [{ id: 'battery' }], [{ id: 'mode' }], [{ id: 'speed' }] , [{ id: 'pending_task' }]
  ]

  ds = {} //datasource

  @ViewChild("mapContainer") pixiElRef : DrawingBoardComponent

  taskList = []
  onDestroy = new Subject()
  status$ : Observable<any> = null
  loadingTicket 
  get locationPixiGraphics(){
    return this.pixiElRef?.allPixiPoints
  }
  mouseoverLocationOption = null
  locationAlwaysVisible = true
  subscriptions = []

  signalRSubscribedTopics = ['battery', 'state', 'speed']
  constructor( public utils : GeneralUtil, public uiSrv : UiService , private httpSrv : RvHttpService , public authSrv : AuthService,
               public router: Router , private dataSrv :  DataService , private signalRSrv : SignalRService) { 
    
  }

  async ngOnInit() {
    if(this.authSrv.isGuestMode){
      this.router.navigate(['/login'])
    }
    if( !this.utils.getCurrentUser()){
      return
    }
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
    await this.dataSrv.getRobotMaster()
    this.robotType = this.dataSrv.robotMaster.robotType  //TO BE REVISED
    this.dataSrv.subscribeSignalRs(<any>this.signalRSubscribedTopics)
    this.initDataSource()
    // this.dashboardLayout = this.dashboardLayout.concat(this.topModule[this.robotType]) 

    this.uiSrv.loadAsyncDone(this.loadingTicket)

  }

  ngOnDestroy(){
    this.dataSrv.unsubscribeSignalRs(<any>this.signalRSubscribedTopics)
    this.subscriptions.forEach(s=>s.unsubscribe())
    this.onDestroy.next()
  }
  
  async ngAfterViewInit() {
    await this.initDropDown()
    if (!this.uiSrv.isTablet || this.router.url == '/login') {
      if(!this.pixiElRef){
        console.log('PIXI viewport not found.')
      }
    }
  }

  onInitDone(){
    if(this.loadingTicket){
      this.uiSrv.loadAsyncDone(this.loadingTicket)
      this.loadingTicket = null
    }
  }

  initDataSource(){
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' ,  signalR: this.dataSrv.signalRSubj.status},
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , signalR: this.dataSrv.signalRSubj.batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , signalR: this.dataSrv.signalRSubj.state},
      pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', signalR: this.dataSrv.signalRSubj.currentTaskId},
      speed:{title: 'Speed',  suffix: 'm/s' , icon:'mdi-speedometer', signalR: this.dataSrv.signalRSubj.speed}
    };
  }


  //* * * v LOCATIONS HANDLING v * * *

  async initDropDown(){
    let dropdownResp = await this.dataSrv.getDropLists(['maps','locations','floorplans'])
    this.dropdownData = dropdownResp.data// (await this.httpSrv.get("api/map/v1/plan")).filter(m=>m['planId'])
    this.dropdownOptions = dropdownResp.option
    this.refreshDropDownOptions()
    // this.ngModel.selectedLocation = this.pixiElRef.standaloneLatestActiveMapId //pending : change this when robot pose polling get a different mapId
  }  

  refreshDropDownOptions(){
    this.dropdownOptions.locations =  this.dataSrv.getDropListOptions('locations',this.dropdownData.locations , {floorPlanCode : this.ngModel.selectedPlan})
    //this.dropdownData.locations.filter(l=>l['planId'] == this.ngModel.selectedPlan).map(l=>{return {text: l['shapeCode'] , value: l['shapeId']}})
  }

    //* * * ^ LOCATIONS HANDLING ^ * * *
}


