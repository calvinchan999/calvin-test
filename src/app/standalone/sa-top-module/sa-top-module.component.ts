//import standard library
import { NavigationStart, Router } from '@angular/router';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Component, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild, ViewEncapsulation  } from '@angular/core';
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
import { BehaviorSubject, fromEventPattern, Observable, pipe, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { filter, map, skip, take, takeUntil } from 'rxjs/operators';
import { mixin } from 'pixi-viewport';
import { DataService } from 'src/app/services/data.service';
import { SignalRService } from 'src/app/services/signal-r.service';

@Component({
  selector: 'app-sa-top-module',
  templateUrl: './sa-top-module.component.html',
  styleUrls: ['./sa-top-module.component.scss']
})
export class SaTopModuleComponent implements OnInit {
  @Input() @HostBinding('class') customClass = 'module card-container';
  @Input() showDeliveryOrderInput = false
  @Input() isTaskLayout = false
  @Input() arcsRobotType = null
  @Input() arcsRobotSubType = null
  @Input() arcsRobotCode = null
  @Output() onButtonClicked : EventEmitter<any> = new EventEmitter();
  patrolFlvSrc
  ds = {} //datasource
  ngModelObj = {}
  onDestroy = new Subject()
  airQualitySubj = new BehaviorSubject<any>(null)
  topModule = {
    patrol: [
      this.util.standaloneApp ? [{
        id: 'ieq1', col: 3, colSpan: 2,
        cells: [
          { id: 'wifi_signal' },
          { id: 'cellular_bars' },
        ]
      }, {
        id: 'ieq2', col: 3, colSpan: 2, row:2,
        cells: [
          { id: 'light' },
          { id: 'noise' },
        ]
      }] : [],
      [{
        id: 'air_1',
        row :  1,
        rowSpan: 5 ,
        colSpan:  2 ,
        cells: [
          {
            cells: [
              { id: 'air_quality' },
            ]
          },
          {
            cells: [
              { id: 'temperature' },
              { id: 'humidity' },
              { id: 'pressure'},
              { id: 'tvoc_pid'},
              { id: 'pm2_5' },
              { id: 'co2'},
            ]
          }
        ]
      }],
      [{
        id: 'air_2',
        row: this.util.standaloneApp ? 3 : 1,
        rowSpan: this.util.standaloneApp ? 3 : 5,
        col:  3,
        colSpan: 2 ,
        cells: [
          { id: 'formaldehyde' },
          { id: 'co' },
          { id: 'pm1' },
          { id: 'pm10' },
          { id: 'no2' },
          { id: 'o3' },
        ]
      }]
    ],
    delivery:[],
    tray:[]
  }
  dashboardLayout = []
  loadingTicket
  robotType
  signalRSubscribedTopics = []
  signalRModuleTopic = {
    patrol: [ 'ieq' ],
    delivery : ['trayRack' , 'cabinet']
  }

  constructor( public util : GeneralUtil, public uiSrv : UiService , private httpSrv : RvHttpService , public authSrv : AuthService,
               public router: Router , private dataSrv :  DataService , private signalRSrv : SignalRService , private configSrv : GeneralUtil) { }

  async ngOnInit(){
    this.patrolFlvSrc = this.configSrv.config.IP_CAMERA_URL
    // if(this.authSrv.isGuestMode){
    //   this.router.navigate(['/login'])
    // }
    if( !this.util.getCurrentUser()){
      return
    }
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
    // let resp = await this.httpSrv.get("api/robot/v1")
    // let data = resp.filter(r=>r['robotCode'] == this.utils.config.STANDALONE_ROBOT_ID)[0]
    if(this.util.arcsApp){
      this.robotType = this.arcsRobotType.toLowerCase()
    }else{
      await this.dataSrv.getRobotInfo()
      this.robotType = this.dataSrv.robotMaster.robotType.toLowerCase()//data?.['robotTypeName']?.toLowerCase()//TO BE REVISED
    }
    this.customClass += ' ' + this.robotType
    if(this.arcsRobotSubType == 'TRAY_DELIVERY'){
      this.signalRModuleTopic.delivery = ['trayRack']
    }
    this.signalRSubscribedTopics = this.signalRModuleTopic[this.robotType]
    this.dataSrv.subscribeSignalRs(this.signalRSubscribedTopics , this.util.arcsApp ? this.arcsRobotCode : undefined)
    this.initAirQualitySubscription()
    this.initDataSource()
    await this.initByRobotType()
    this.dashboardLayout = this.topModule[this.robotType]
    this.uiSrv.loadAsyncDone(this.loadingTicket)
  }

  initAirQualitySubscription() {
    if (this.robotType == 'patrol') {
      this.dataSrv.signalRSubj.ieq.pipe(skip(1),takeUntil(this.onDestroy),filter(ieq=>ieq!=null)).subscribe(ieq => {
        let ret = null
        let levels = ['Inadequate', 'Poor', 'Fair', 'Good', 'Excellent']
        let range = {
          p: [[15, 24], [16, 23], [17, 22], [18, 21]],
          rh: [[10, 90], [20, 80], [30, 70], [40, 60]],
          co2: [[null, 2500], [null, 2000], [null, 1500], [null, 650]],
          pm2_5: [[null, 150.5], [null, 55.4], [null, 35.4], [null, 12]],
          tvoc_pid: [[null, 75], [null, 51], [null, 26], [null, 16]]
        }
        for (let i = 0; i < levels.length - 1; i++) {
          Object.keys(range).forEach(k => {
            let limits = range[k][i]
            if (limits!=undefined && !isNaN(Number(ieq[k])) && ((limits[0] != null && Number(ieq[k]) < limits[0]) || (limits[1] != null && Number(ieq[k]) > limits[1]))) {
              ret = levels[i]
              return
            }
          })
          if (ret != null) {
            break
          }
        }
        this.airQualitySubj.next(ret == null ? levels[levels.length - 1] : ret)
      })
    }
  }

  initDataSource(){
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' ,  signalR: this.dataSrv.signalRSubj.status},
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , signalR: this.dataSrv.signalRSubj.batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , signalR: this.dataSrv.signalRSubj.state},
      pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', signalR: this.dataSrv.signalRSubj.currentTaskId},
      wifi_signal : { title: 'Wifi', suffix: '%' , icon : 'mdi-wifi'},
      cellular_bars : { title: 'Cellular', suffix: '/' , icon:'mdi-signal-cellular-3' , signalR : this.dataSrv.signalRSubj.cellularNumerator, suffixSignalR: this.dataSrv.signalRSubj.cellularDenominator},
      tvoc_pid: { title: 'TVOC', suffix: 'ppm' , icon :'mdi-spray', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'tvoc_pid'},
      pm2_5: { title: 'PM 2.5', suffix: 'µg/m3', icon: 'mdi-chart-bubble', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'pm2_5'},
      co2: { title: 'Carbon Dioxide', suffix: 'ppm', icon: 'mdi-molecule-co2', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'co2'},
      air_quality: { title: 'Air Quality',  suffix: '' , icon: 'mdi-blur' , signalR : this.airQualitySubj},
      co: { title: 'Carbon Monoxide',  suffix: 'ppb', icon: 'mdi-molecule-co', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'co'},
      pm1: { title: 'PM 1',  suffix: 'µg/m3' , icon:'mdi-scatter-plot' , signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'pm1'},
      pm10: { title: 'PM 10',  suffix: 'µg/m3' , icon :'mdi-scatter-plot-outline' , signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'pm10'},
      o3: { title: 'Ozone' , suffix: 'ppb' , icon:'mdi-webhook', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'o3'},
      no2: { title: 'Nitrogen Dioxide', suffix: 'ppb' , icon: 'mdi-chemical-weapon', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'no2'},
      temperature: { title: 'Temperature', suffix: '°C' , icon:'mdi-thermometer-lines', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 't'},
      pressure: { title: 'Pressure',  suffix: 'hPa' , icon: 'mdi-gauge-low' , signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'p'},
      humidity: { title: 'Humidity', suffix: '%' , icon : 'mdi-water-outline' , signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'rh'},
      formaldehyde: { title: 'Formaldehyde',  suffix: 'ppb', icon: 'mdi-molecule', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'hcho'},
      light: { title: 'Light', suffix: 'lux', icon: 'mdi-white-balance-sunny', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'light'},
      noise: { title: 'Noise', suffix: 'dB SPL', icon: 'mdi-volume-high', signalR: this.dataSrv.signalRSubj.ieq , signalRfld : 'noise_moy'},
    };
  }

  
  async initByRobotType(){
    let ticket = this.uiSrv.loadAsyncBegin()
    if(this.robotType == 'patrol'){
    
    } else if(this.robotType == 'delivery'){ // tray API endpoint TBR 
      let hasDoors = this.arcsRobotSubType != 'TRAY_DELIVERY'
      let containersResp = await this.httpSrv.rvRequest("GET", (hasDoors ? "cabinet" : "trayRack" ) + `/v1${this.util.arcsApp? ('/' + this.arcsRobotCode) : ''}`)
      // let containersResp = {status : 200 , body:`{
      //   "robotId": "RV-ROBOT-100",
      //   "levelList": [
      //     {
      //       "id": 1,
      //       "trayFull": false
      //     },
      //     {
      //       "id": 2,
      //       "trayFull": true
      //     },
      //     {
      //       "id": 3,
      //       "trayFull": false
      //     }
      //   ]
      // }`}
      if(containersResp.status == 200 && containersResp?.body){
        var containers = JSON.parse(containersResp.body)?.[ hasDoors ? 'doorList' : 'levelList']
        let doorIds = containers.map(d=>d['id'])
        this.dataSrv.signalRSubj.trayRackAvail.next(this.dataSrv.signalRMaster.trayRack.mapping.trayRackAvail(JSON.parse(containersResp.body))) 
        let containerData = {
          containerId: { title: 'Container ID', icon: 'mdi mdi-package-variant-closed', class: 'container' },
          availability: { title: 'Available / Occupied', icon: 'mdi mdi-tray-alert', class: 'availibility' },
          door: { title: 'Door', icon: 'mdi mdi-door', class: 'door' },
          openContainer: { title: 'Open', class: 'open' },
          closeContainer: { title: 'Close', class: 'close' },
        }
        
        for(let i = 0 ; i< doorIds.length ; i++){
          let doorId = doorIds[i]
          let dataObj =  JSON.parse(JSON.stringify(containerData))
          dataObj.containerId['content'] = doorId.toString()
          dataObj.availability['signalR'] =  hasDoors? this.dataSrv.signalRSubj.cabinetAvail : this.dataSrv.signalRSubj.trayRackAvail
          dataObj.availability['signalRfld'] = i
          if(hasDoors){
            dataObj.door['signalR'] = this.dataSrv.signalRSubj.cabinetDoorStatus
            dataObj.door['signalRfld'] = i
          }
          Object.keys(dataObj).forEach(k => {
            this.ds[k + '_' + doorId] = dataObj[k]
          })

          let buttonCells = hasDoors ? [
            { id: 'openContainer_' + doorId, type: 'button' },
            { id: 'closeContainer_' + doorId, type: 'button' },
          ] : []

          let totalHeight = doorIds.length
          this.ngModelObj['orderNo_' + doorId] = {containerId: doorId , value : ""}
          if(this.robotType == 'delivery'){
            this.topModule.delivery.push( [{
              id: 'container',
              rowSpan:  totalHeight / doorIds.length ,
              row:  1 + i ,
              colSpan: 4,
              cells: [
                {
                  cells: [
                    { id: 'containerId_' + doorId },
                    { id: 'availability_' +  doorId },
                  ].concat(hasDoors ? [{ id: 'door_' + doorId }]: [])
                },
                {
                  cells: this.showDeliveryOrderInput ?  
                          [{id:'orderNo_' + doorId , type : 'textbox' , label : 'Order No.' , data: this.ngModelObj['orderNo_' + doorId]}].concat(<any> buttonCells) :  
                          buttonCells
                }
              ]
            }])
          }else{
            this.topModule.tray.push( [{
              id: 'container',
              rowSpan:  totalHeight / doorIds.length ,
              row:  1 + i ,
              colSpan: 4,
              cells: [
                {
                  cells: [
                    { id: 'containerId_' + doorId },
                    { id: 'availability_' +  doorId },
                  ]
                }
              ]
            }]) 
          }
        }
      }else{
        this.uiSrv.showNotificationBar("Error : GET [cabinet/v1] failed")
      }
    }
    this.uiSrv.loadAsyncDone(ticket)
  }

  async buttonClicked(evt : cabinetToggleEvent){
    let resp    
    if(evt.id.startsWith('openContainer_')){
      evt.action = "open"
      evt.containerId = evt.id.replace('openContainer_' , '')
      resp = await this.dataSrv.openRobotCabinet( evt.containerId )
    }else if(evt.id.startsWith('closeContainer_')){
      evt.action = "close"
      evt.containerId = evt.id.replace('closeContainer_' , '')
      resp = this.dataSrv.closeRobotCabinet( evt.containerId)
    }
    evt['response'] = resp
    this.onButtonClicked.emit(evt)
  }

  ngOnDestroy(){
    this.onDestroy.next()
    this.dataSrv.unsubscribeSignalRs( this.signalRSubscribedTopics , false , this.util.arcsApp ? `?robotCode=${this.arcsRobotCode}` : undefined)
  }

}


export class cabinetToggleEvent{
  id? : string
  action? : 'open' | 'close'
  containerId? : string
  response ? : any
}
