import { Component, Input, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { DialogService } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { skip, takeUntil } from 'rxjs/operators';
import { ConfigService } from 'src/app/services/config.service';
import { DataService, DropListMap, signalRType } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-sa-control-buttons',
  templateUrl: './sa-control-buttons.component.html',
  styleUrls: ['./sa-control-buttons.component.scss']
})
export class SaControlButtonsComponent implements OnInit ,  OnDestroy {
  signalRTopics : signalRType[] = ['battery','state','brake','followMePair','led','fan', 'pauseResume']
  signalRsubscribed = false
  @ViewChild('mapContainer') pixiElRef : DrawingBoardComponent
  @Input() readonly = {
    controls : false,
    robot: false
  }
  showLocalizePopup = false
  showChangeMapPopup = false
  showManualModePopup = false
  optionObj = {
    type : null ,
    title: '',
    charge:{ upperLimit : 0 , duration : 0},
    stop: { finishMovement: false },
    followMe: {
      withMap : false,
      map : null
    }
  }
  dropdownData = {
    maps:[]
  }

  dropdownOptions = {
    maps:[]
  }

  onDestroy = new Subject()

  @Input() buttonIds : string[] = null

  constructor(public uiSrv : UiService, public windowSrv: DialogService, private util : GeneralUtil , private httpSrv : RvHttpService, public dataSrv:DataService , public configSrv : ConfigService) {
    Object.keys(this.configSrv.disabledModule_SA).filter(k=>this.configSrv.disabledModule_SA[k] == true).forEach(k=>{
      this.layout.forEach(l => l.buttons =(<any>l.buttons).filter(b => b.id != k))
    })
  }
  
  layout = [
    {
      title: 'Power',  icon : 'mdi mdi-power-plug', buttons: [
        { id: "shutdown", text: 'Shut Down', icon: 'mdi mdi-power' },
        { id: "restart", text: 'Restart', icon: 'mdi mdi-reload' },
        { id: "charge", text: 'Charge', textActive: 'Uncharge', icon: 'mdi mdi-battery-charging', active: this.dataSrv.signalRSubj.charging }
      ]
    },
    {
      title: 'Task', icon: 'mdi mdi-clipboard-file ', buttons: [
        { id: "stop", text: 'Stop', icon: 'mdi mdi-stop' },
        { id: "pause", text: 'Pause', textActive: 'Resume', icon: 'mdi mdi-pause', active : this.dataSrv.signalRSubj.isPaused}
      ]
    },
    {
      title: 'Mode', icon: 'mdi mdi-map-marker-path', buttons: [
        { id :"pairing", text : "Pair", textActive : 'Unpair' ,  icon: 'mdi mdi-account-arrow-left' , display: this.dataSrv.signalRSubj.isFollowMeMode , active: this.dataSrv.signalRSubj.followMePaired},
        { id: "followMe", text: 'Follow Me', icon: 'mdi mdi-account-arrow-left', disabled :  this.dataSrv.signalRSubj.isFollowMeMode, active: this.dataSrv.signalRSubj.isFollowMeMode },
        { id: "manual", text: 'Manual', icon: 'mdi mdi-gesture-double-tap', active: this.dataSrv.signalRSubj.isManualMode },
        { id: "auto", text: 'Automatic', icon: 'mdi mdi-autorenew', disabled : this.dataSrv.signalRSubj.isAutoMode , active: this.dataSrv.signalRSubj.isAutoMode }
      ]
    },
    {
      title: 'Locations', icon:'mdi mdi-map-marker-multiple' , buttons: [
        { id: "changeMap", text: 'Change', icon:'mdi mdi-map' , disabled:this.dataSrv.signalRSubj.isFollowMeWithoutMap },
        // { id: "reset", text: 'Reset', icon:'mdi mdi-home-map-marker'  },
        { id: "localize", text: 'Localise' , icon:'mdi mdi-map-marker-radius-outline' , disabled:this.dataSrv.signalRSubj.isFollowMeWithoutMap }
      ]
    },
    {
      title: 'Controls', icon:'mdi mdi-tune' , buttons: [
        { id: "fan", text: 'Fan',  icon:'mdi mdi-fan'  , active: this.dataSrv.signalRSubj.fan},
        { id: "brake", text: 'Brake' , icon:'mdi mdi-car-brake-alert' , active : this.dataSrv.signalRSubj.brakeActive },
        { id: "led", text: 'LED',  icon:'mdi mdi-lightbulb-on-outline' , active: this.dataSrv.signalRSubj.led },
      ]
    }
  ]

  ngOnDestroy(){
    this.onDestroy.next()
    if(this.signalRsubscribed){
      this.dataSrv.unsubscribeSignalRs(this.signalRTopics)
    }
  }

  ngOnInit(): void {
    this.dataSrv.signalRSubj.isManualMode.pipe(skip(1) , takeUntil(this.onDestroy)).subscribe(isManual=>{
      if(isManual === false && this.showManualModePopup){
        this.uiSrv.showMsgDialog('The navigation mode of the robot is no longer manual mode. Remote control is terminated.')
        this.showManualModePopup = false
      }
    })
    if(this.buttonIds!=null){
      this.layout.forEach(l=>l.buttons = (<any>l.buttons).filter(b=>this.buttonIds.includes(b.id)))
      this.layout = this.layout.filter(l=>l.buttons.length > 0)
    }
    this.dataSrv.subscribeSignalRs(this.signalRTopics)
    this.initDropdown()
  }

  async initDropdown() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let dropdownObj = await this.dataSrv.getDropLists(["maps"]);
    this.dropdownData = <any>dropdownObj.data
    this.dropdownOptions = <any>dropdownObj.option
    this.uiSrv.loadAsyncDone(ticket)
  }
  

  async triggerControl(id , label, activeSubject = null){
    let isActive = activeSubject?.value
    let requestMap = { //move this to dataSrv if need to further resuse 
      shutdown: { url: 'os/v1/shutdown', method: 'post' },
      restart: { url: 'os/v1/reboot', method: 'post' },
      pairing: {url:'followMe/v1/pairing/' + (isActive ? 'unpair' : 'pair') , method : 'post' },
      uncharge: { url: 'docking/v1/charging', method: 'delete', resultPath: ['status'] },
      // stop: { url: 'task/v1/move', method: 'delete' },
      pause: { url: 'baseControl/v1/pause', method: 'put' },
      resume: { url: 'baseControl/v1/resume', method: 'put' },
      manual: { url: 'baseControl/v1/manual/' + (isActive ? 'OFF' : 'ON'), method: 'put' },
      auto: { url: 'mode/v1/navigation' , method: 'post' },
      fan: { url: 'fan/v1/' + (isActive ? 'OFF' : 'ON'), method: 'put' },
      brake: { url: 'baseControl/v1/brake/' + (isActive ? 'OFF' : 'ON'), method: 'put' },
      led: { url: 'led/v1/' + (isActive ? 'OFF' : 'ON'), method: 'put' },
    }

    let getResultFromPath = (resp , paths)=>{
      return paths.length == 0 ? resp : getResultFromPath(resp[paths.shift()], paths)
    }

    id = id == 'charge' && isActive ? 'uncharge' : id
    id = id == 'pause' && isActive ? 'resume' : id
    if(requestMap[id]){
      if(activeSubject){ //id!='manual' : TBR
        this.uiSrv.awaitSignalRBegin(activeSubject , true)
      }
      let ticket = this.uiSrv.loadAsyncBegin()
      try{
        if(id == 'manual'){
          this.showManualModePopup = !isActive
          if(this.showManualModePopup){
            setTimeout(()=>{
              this.pixiElRef.subscribeLiveLidar_SA()
              this.pixiElRef.cameraTraceEnabled = true
            })
          }          
        }
        await this.httpSrv.rvRequest(requestMap[id]['method'].toUpperCase(), requestMap[id]['url'] , ( requestMap[id]['body'] ? requestMap[id]['body'] : null) , true, label)
      }
      catch(err){
        console.log(err)
      }
      this.uiSrv.loadAsyncDone(ticket)
    } else if (id == 'changeMap') {
      this.showChangeMapPopup = true
    }else if (id == 'localize') {
      this.showLocalizePopup = true
      setTimeout(()=>{
        this.pixiElRef.sendLidarRequestToRV(false)
      })
    } else if (['followMe' , 'charge' , 'stop'].includes(id)) {
      this.optionObj.type = id
      this.optionObj.title = this.uiSrv.translate(`${label} Options`)
      // followMe: { url: 'mode/v1/followMe', method: 'post' },
    }
  }

  async sendFollowMeRequestToRV(){
    this.uiSrv.awaitSignalRBegin(this.dataSrv.signalRSubj.isFollowMeMode)
    let ticket = this.uiSrv.loadAsyncBegin()
    let mapCode = (<DropListMap[]>this.dropdownData.maps).filter((d)=> d.mapCode == this.optionObj.followMe.map)[0]?.mapCode
    let resp = await this.httpSrv.rvRequest("POST", "mode/v1/followMe" + (this.optionObj.followMe.withMap ? `/${mapCode}` : ''), undefined, true, "Follow Me")
    if(resp.status == 200){
      this.optionObj.type  = null
      // let resp2 = await this.httpSrv.rvRequest("POST", "followMe/v1/pairing/pair" , undefined, true, "Follow Me")
      // if(resp2.status == 200){
      //   this.optionObj.type  = null
      // }
    }
    this.uiSrv.loadAsyncDone(ticket)
  }

  async sendStopRequestToRV(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp = await this.httpSrv.rvRequest("DELETE", "task/v1/move?finishMovement=" + this.optionObj.stop.finishMovement.toString())
    let resp2 = null
    if(!this.optionObj.stop.finishMovement){
        resp2 = await this.httpSrv.rvRequest("DELETE", "navigation/v1" ) 
    }
    this.uiSrv.loadAsyncDone(ticket)
    if(resp.status == 200 && (resp2 == null || resp2.status == 200)){
      this.optionObj.type  = null      
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Successs") + '- ' + this.uiSrv.translate('Stop') , 'success')
    }else{
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Failed") + '- ' + this.uiSrv.translate('Stop') , 'error')
    }
  }

  async sendChargingRequestToRV(){
    this.uiSrv.awaitSignalRBegin(this.dataSrv.signalRSubj.charging)
    let ticket = this.uiSrv.loadAsyncBegin()
    let body = {
      upperLimit: this.optionObj.charge.upperLimit / 100 , 
      duration: this.optionObj.charge.duration * 60000, 
    }
    let resp = await this.httpSrv.rvRequest("POST", "docking/v1/charging" , body )
    if (resp.status == 200 && resp.body && JSON.parse(resp.body)?.status == 'SUCCEEDED') {
      this.optionObj.type = null
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Successs") + '- ' + this.uiSrv.translate('Charge'), 'success')
    } else {
      this.uiSrv.showNotificationBar(this.uiSrv.translate("Operation Failed") + '- ' + 
      this.uiSrv.translate(JSON.parse(resp.body)?.text ? JSON.parse(resp.body)?.text : 'Charge'), 'error')
    }
    this.uiSrv.loadAsyncDone(ticket)
  }
}
