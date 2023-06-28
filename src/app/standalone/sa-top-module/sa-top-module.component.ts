//import standard library
import { NavigationStart, Router } from '@angular/router';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Component, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild, ViewEncapsulation  , OnDestroy } from '@angular/core';
import { IntlService } from '@progress/kendo-angular-intl';
import { MessageService } from '@progress/kendo-angular-l10n';
import { NotificationService } from '@progress/kendo-angular-notification';
// import { CustomMessagesService } from 'src/app/services/custom-messages.service';

import { DataBindingDirective } from '@progress/kendo-angular-grid';
import { process } from '@progress/kendo-data-query';

//import utils
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { UiService } from 'src/app/services/ui.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { BehaviorSubject, fromEventPattern, Observable, pipe, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { filter, map, skip, take, takeUntil } from 'rxjs/operators';
import { mixin } from 'pixi-viewport';
import { DataService } from 'src/app/services/data.service';
import { SaPagesLockCabinetComponent } from '../sa-pages/sa-pages-lock-cabinet/sa-pages-lock-cabinet.component';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { SaPagesUnlockCabinetComponent } from '../sa-pages/sa-pages-unlock-cabinet/sa-pages-unlock-cabinet.component';
import { MqService } from 'src/app/services/mq.service';
import { RobotService } from 'src/app/services/robot.service';

@Component({
  selector: 'app-sa-top-module',
  templateUrl: './sa-top-module.component.html',
  styleUrls: ['./sa-top-module.component.scss']
})
export class SaTopModuleComponent implements OnInit , OnDestroy {
  @Input() @HostBinding('class') customClass = 'module card-container';
  @Input() showDeliveryOrderInput = false
  @Input() isTaskLayout = false
  @Input() arcsRobotType = null
  @Input() arcsRobotSubType = null
  @Input() arcsRobotCode = null
  @Input() isPartOf3dTooltip = false

  @Output() onButtonClicked : EventEmitter<any> = new EventEmitter();
  patrolFlvSrc
  ds = {} //datasource
  ngModelObj = {}
  $onDestroy = new Subject()
  airQualitySubj = new BehaviorSubject<any>(null)
  topModule = {
    patrol: [
      [{
        id: 'air_1',
        row :  1,
        rowSpan: 5 ,
        colSpan:  3,
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
              // { id: 'pressure'},
              { id: 'tvoc_pid'},
              { id: 'co2'},
              { id: 'co' },
              { id: 'no2' },
            ]
          }
        ]
      }],
      [{
        id: 'air_2',
        row:  1,
        rowSpan:  5,
        col:  4,
        colSpan: 1 ,
        cells: [
          // { id: 'formaldehyde' },
          // { id: 'co' },
          { id: 'pm2_5' },
          { id: 'pm1' },
          { id: 'pm10' },
          // { id: 'no2' },
          // { id: 'o3' },
        ]
      }]
    ],
    delivery:[],
    tray:[]
  }
  dashboardLayout = []
  loadingTicket
  robotType
  robotSubType
  // mqSubscribedTopics = []
  // mqModuleTopic = {
  //   patrol: [ 'ieq' ],
  //   delivery : []
  // }
  // subTypeTopicMap = {
  //   delivery : {
  //     TRAY_DELIVERY : ['trayRack'],
  //     CABINET_DELIVERY : ['cabinet']
  //   }
  // }

  constructor( public robotSrv : RobotService , public util : GeneralUtil, public uiSrv : UiService ,  public authSrv : AuthService, public mqSrv : MqService,
               public router: Router , public dataSrv :  DataService ,  private configSrv : GeneralUtil) { }
               
  async ngOnInit(){

  }
  async ngAfterViewInit(){
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
      await this.dataSrv.getRobotProfile()
      this.robotType = this.dataSrv.robotProfile.robotType.toLowerCase()//data?.['robotTypeName']?.toLowerCase()//TO BE REVISED
    }
    this.robotSubType = this.util.arcsApp ? this.arcsRobotSubType : this.dataSrv.robotProfile.robotSubType
    this.customClass += ' ' + this.robotType
    // this.arcsRobotSubType == 'CABINET_DELIVERY' //TESTING
    // if(this.subTypeTopicMap[this.robotType]){
    //   this.mqModuleTopic[this.robotType] = this.subTypeTopicMap[this.robotType][this.robotSubType] ?  this.subTypeTopicMap[this.robotType][this.robotSubType] : []
    // }
    // this.mqSubscribedTopics = this.mqModuleTopic[this.robotType] ? this.mqModuleTopic[this.robotType]  : []
    // this.mqSrv.subscribeMQTTsUntil(this.mqSubscribedTopics , this.util.arcsApp ? this.arcsRobotCode : undefined , this.$onDestroy)

    // if(this.robotSubType == 'CABINET_DELIVERY' && this.arcsRobotType == 'DELIVERY'){ //TBR !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    //   this.mqSrv.subscribeMQTT('cabinet')
    // }

  
    this.initDataSource()
    await this.initByRobotType()
    this.dashboardLayout = this.topModule[this.robotType]
    this.uiSrv.loadAsyncDone(this.loadingTicket)
  }


  getPins(){

  }
 
  
  initDataSource(){
    const ieqSubj = this.robotSrv.robotState(this.arcsRobotCode).ieq
    this.ds = {
      status : {title: 'Status', suffix: '' , icon:'mdi-autorenew' ,  mq: this.robotSrv.data.status},
      battery : {title: 'Battery', suffix: '%' , icon : 'mdi-battery-70' , mq: this.robotSrv.data.batteryRounded},
      mode : { title: 'Mode',  suffix: '' , icon:'mdi-map-marker-path' , mq: this.robotSrv.data.state},
      pending_task : { title: 'Current Task',  suffix: '' , icon:'mdi-file-clock-outline', mq: this.robotSrv.data.currentTaskId},
      wifi_signal : { title: 'Wifi', suffix: '%' , icon : 'mdi-wifi'},
      cellular_bars: { title: 'Cellular', suffix: '/', icon: 'mdi-signal-cellular-3', mq: this.robotSrv.data.cellularNumerator, suffixmq: this.robotSrv.data.cellularDenominator },
      tvoc_pid: { title: 'TVOC', suffix: 'ppb', icon: 'mdi-spray', mq: ieqSubj, mqfld: 'tvoc_ppb' },
      pm2_5: { title: 'PM 2.5', suffix: 'µg/m3', icon: 'mdi-chart-bubble', mq: ieqSubj, mqfld: 'pm2_ugPerM3' },
      co2: { title: 'Carbon Dioxide', suffix: 'ppm', icon: 'mdi-molecule-co2', mq: ieqSubj, mqfld: 'co2_ppm' },
      air_quality: { title: 'Air Quality', suffix: '', icon: 'mdi-blur', mq: this.robotSrv.robotState(this.arcsRobotCode).topModule.patrol.airQualityOverall },
      co: { title: 'Carbon Monoxide', suffix: 'ppb', icon: 'mdi-molecule-co', mq: ieqSubj, mqfld: 'co_ppb' },
      pm1: { title: 'PM 1', suffix: 'µg/m3', icon: 'mdi-scatter-plot', mq: ieqSubj, mqfld: 'pm1_ugPerM3' },
      pm10: { title: 'PM 10', suffix: 'µg/m3', icon: 'mdi-scatter-plot-outline', mq: ieqSubj, mqfld: 'pm10_ugPerM3' },
      o3: { title: 'Ozone', suffix: 'ppb', icon: 'mdi-webhook', mq: ieqSubj, mqfld: 'o3_ppb' },
      no2: { title: 'Nitrogen Dioxide', suffix: 'ppb', icon: 'mdi-chemical-weapon', mq: ieqSubj, mqfld: 'no2_ppb' },
      temperature: { title: 'Temperature', suffix: '°C', icon: 'mdi-thermometer-lines', mq: ieqSubj, mqfld: 't_degreeC' },
      pressure: { title: 'Pressure', suffix: 'hPa', icon: 'mdi-gauge-low', mq: ieqSubj, mqfld: 'p_mb' },
      humidity: { title: 'Humidity', suffix: '%', icon: 'mdi-water-outline', mq: ieqSubj, mqfld: 'rh_percent' },
      formaldehyde: { title: 'Formaldehyde', suffix: 'ppb', icon: 'mdi-molecule', mq: ieqSubj, mqfld: 'hcho_ppb' },
      light: { title: 'Light', suffix: 'lux', icon: 'mdi-white-balance-sunny', mq: ieqSubj, mqfld: 'light_lux' },
      noise: { title: 'Noise', suffix: 'dB SPL', icon: 'mdi-volume-high', mq: ieqSubj, mqfld: 'noise_dB' },
    };
    Object.keys(this.ds).filter(k=>(this.util.config.IEQ_DISABLED ? this.util.config.IEQ_DISABLED : []).includes(k)).forEach(k=>{
      this.ds[k].disabled = true
    })
  }

  
  async initByRobotType(){
    let ticket = this.uiSrv.loadAsyncBegin()

    if(this.robotType == 'patrol'){

      this.airQualitySubj = this.robotSrv.robotState(this.arcsRobotCode).topModule.patrol.airQualityOverall
      let ieqResp = await this.dataSrv.httpSrv.fmsRequest('GET', this.mqSrv.mqMaster.ieq.api + (this.util.arcsApp ?  ('/' + this.arcsRobotCode) : '') , undefined , false)
      let ieqData = this.mqSrv.mqMaster.ieq.robotState.ieq(ieqResp)
      this.robotSrv.robotState(this.arcsRobotCode).topModule.patrol.airQualityDetail.pipe(skip(1),takeUntil(this.$onDestroy),filter(detailObj=>detailObj!=null)).subscribe(data =>{
        Object.keys(data).forEach(k=>{
          let dsKey = Object.keys(this.ds).filter(dsK=> this.ds[dsK].mqfld == k)[0]
          if(this.ds[dsKey]){
            this.ds[dsKey].class = data[k]
          }
        })
      })
      this.robotSrv.robotState(this.arcsRobotCode).ieq.next(ieqData)
      this.mqSrv.subscribeMQTTUntil('ieq', this.util.arcsApp ? this.arcsRobotCode : undefined  , this.$onDestroy)

    } else if(this.robotType == 'delivery' && this.robotSubType == 'CABINET_DELIVERY' || this.robotSubType == 'TRAY_DELIVERY'){ // tray API endpoint TBR 
      let hasDoors = this.robotSubType == 'CABINET_DELIVERY'      
      let containersResp   
      containersResp =  await this.dataSrv.httpSrv.fmsRequest("GET", (hasDoors ? "cabinet" : "trayRack" ) + `/v1${this.util.arcsApp? ('/' + this.arcsRobotCode) : ''}`)
      // containersResp = {status : 200 , body: `
      // {
      //   "robotId": "RV-ROBOT-102",
      //   "levelList": [
      //     {
      //       "id": 1,
      //       "status": "CLOSED",
      //       "trayFull": false,
      //       "lightOn": false
      //     },
      //     {
      //       "id": 2,
      //       "status": "CLOSED",
      //       "trayFull": false,
      //       "lightOn": false
      //     },
      //     {
      //       "id": 3,
      //       "status": "CLOSED",
      //       "trayFull": false,
      //       "lightOn": false
      //     }
      //   ]
      // }
      // `}
      if(containersResp.status == 200 && containersResp?.body){
        var containers = JSON.parse(containersResp.body)?.[ hasDoors ? 'doorList' : 'levelList']
        let doorIds = containers.map(d=>d['id'])
        this.robotSrv.robotState(this.arcsRobotCode).topModule.delivery.updateContainers(JSON.parse(containersResp.body))
 
        let containerData = {
          containerId: { title: 'Container ID', icon: 'mdi mdi-package-variant-closed', class: 'container' },
          availability: { title: 'Available / Occupied', icon: 'mdi mdi-tray-alert', class: 'availibility' },
          door: { title: 'Door', icon: 'mdi mdi-door', class: 'door'},
          openContainer: { title: 'Open', class: 'open' },
          closeContainer: { title: 'Close', class: 'close'  , disabled : true},
        }
        
        for(let i = 0 ; i< doorIds.length ; i++){
          let doorId = doorIds[i]
          let dataObj =  JSON.parse(JSON.stringify(containerData))
          dataObj.containerId['content'] = doorId.toString()
          dataObj.availability['mq'] = this.robotSrv.robotState(this.arcsRobotCode).containersAvail
          //dataObj.availability['mq'] = this.util.arcsApp ? this.robotSrv.ARCS.robotStore[this.arcsRobotCode].containersAvail :(hasDoors? this.robotSrv.data.cabinetAvail : this.robotSrv.data.trayRackAvail)
          dataObj.availability['mqfld'] = i
          if(hasDoors){
            dataObj.door['mq'] =  this.robotSrv.robotState(this.arcsRobotCode).containersDoorStatus//this.util.arcsApp ? this.robotSrv.ARCS.robotStore[this.arcsRobotCode].containersDoorStatus : this.robotSrv.data.cabinetDoorStatus
            dataObj.door['mqfld'] = i
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
        
        this.robotSrv.robotState(this.arcsRobotCode).topModule.delivery.containersDoorStatus.pipe(filter(v => v != null), takeUntil(this.$onDestroy)).subscribe(v => {
          for (let i = 0; i < v.length; i++) {
            this.ds['closeContainer_' + doorIds[i]].disabled = v[i] == 'CLOSED'
            this.ds['openContainer_' + doorIds[i]].disabled = v[i] == 'OPENED'
          }
        })
      this.mqSrv.subscribeMQTTUntil(<any>(hasDoors ? 'cabinet'  : 'trayRack' ), this.util.arcsApp ? this.arcsRobotCode : undefined  , this.$onDestroy)
      }else{
        console.log(`Warning : GET ${(hasDoors ? "cabinet" : "trayRack" ) + `/v1${this.util.arcsApp? ('/' + this.arcsRobotCode) : ''}`} failed / return emtpy content : ${containersResp.body}`)
      }
      this.updateCabinetAvailabilityIcon()
    }
    this.uiSrv.loadAsyncDone(ticket)
  }

  
  async buttonClicked(evt : cabinetToggleEvent){
    let resp   
    if(evt.id.startsWith('openContainer_')){
      let containerId = evt?.id?.replace('openContainer_', '')

      const callOpenContainerApi = async()=>{
        evt.action = "open"
        let ticket = this.uiSrv.loadAsyncBegin()
        resp = await this.robotSrv.openRobotCabinet(containerId, this.util.arcsApp ? this.arcsRobotCode : null)
        this.uiSrv.loadAsyncDone(ticket )
        this.updateCabinetAvailabilityIcon()
      }

      let pin = this.util.standaloneApp ? localStorage.getItem('pin_' + containerId ) : null

      if(pin){
        let onPinInput = (v , errmsg)=>{
          if(v == pin){ // TBR : validation move to fobo amr api
            dialog.close()
            localStorage.removeItem('pin_' + containerId)
            callOpenContainerApi()
          }else{
            this.uiSrv.showNotificationBar(errmsg , 'warning')
          }
        }
        const dialog: DialogRef = this.uiSrv.openKendoDialog({
          content: SaPagesUnlockCabinetComponent,
          height:'750px',
          width:'800px'
        });
        const content :SaPagesUnlockCabinetComponent  = dialog.content.instance;
        content.dialogRef = dialog
        content.title =  this.uiSrv.translate(`Unlock Cabinet`) + `[${containerId}]`,
          content.qrResult.pipe(filter(v => v != null), takeUntil(content.$onDestroy)).subscribe(v => {
            onPinInput(v, this.uiSrv.translate('QR code not matching'))
          })
        content.enterPin.pipe(filter(v => v != null), takeUntil(content.$onDestroy)).subscribe(v => {
          onPinInput(v, this.uiSrv.translate('PIN not matching'))
        })

      }else{
        callOpenContainerApi()
      }
    } else if (evt.id.startsWith('closeContainer_')) {
      let containerId = evt?.id?.replace('closeContainer_', '')
      let oldPin = this.util.standaloneApp ? localStorage.getItem('pin_' + containerId ) : null
      if(oldPin!=null){
        this.uiSrv.showNotificationBar('The cabinet is locked already' , 'warning')
        return
      }

      if (this.util.standaloneApp) {
        const dialog: DialogRef = this.uiSrv.openKendoDialog({
          content: SaPagesLockCabinetComponent,
          width: '800px'
        });

        const content: SaPagesLockCabinetComponent = dialog.content.instance;
        content.dialogRef = dialog
        content.title = this.uiSrv.translate(`Set Locker Password - Cabinet `) + `[${containerId}]`;
        let pin = await content.setPin.pipe(take(1)).toPromise()
        if (pin != null) { // TBR : send pin to fobo amr api
          localStorage.setItem('pin_' + containerId, pin)
        } else {
          localStorage.removeItem('pin_' + containerId)
        }
        dialog.close()
      }

      evt.action = "close"
      let ticket = this.uiSrv.loadAsyncBegin()
      resp = await this.robotSrv.closeRobotCabinet(containerId, this.util.arcsApp ? this.arcsRobotCode : null)
      this.uiSrv.loadAsyncDone(ticket)
      this.updateCabinetAvailabilityIcon()
    }
    evt['response'] = resp
    this.onButtonClicked.emit(evt)
  }

  updateCabinetAvailabilityIcon(){
     Object.keys(this.ds).filter(k=>k.startsWith('availability_')).forEach(k=>{
       let containerId = k.replace('availability_', '')
       let withPin = this.util.standaloneApp ? localStorage.getItem('pin_' + containerId) != null : null
      this.ds[k]['icon'] = withPin ?  'mdi mdi-lock' : 'mdi mdi-tray-alert' 
     })
  }

  ngOnDestroy(){
    this.$onDestroy.next()
    // if(this.arcsRobotSubType == 'CABINET_DELIVERY' && this.arcsRobotType == 'DELIVERY'){ //TBR !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
    //   this.mqSrv.unsubscribeMQTT('cabinet' , false , this.util.arcsApp ? this.arcsRobotCode : undefined)
    // }
    // this.mqSrv.unsubscribeMQTTs( this.mqSubscribedTopics , false , this.util.arcsApp ? this.arcsRobotCode : undefined)
  }

}


export class cabinetToggleEvent{
  id? : string
  action? : 'open' | 'close'
  response ? : any
}
