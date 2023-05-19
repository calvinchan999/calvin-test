import { EventEmitter, Injectable, NgZone } from '@angular/core';
import { DataStateChangeEvent } from '@progress/kendo-angular-grid';
import { RvHttpService } from './rv-http.service';
import { EnumNamePipe, UiService } from './ui.service';
import { GeneralUtil, getLocalStorage, getSessionStorage, setLocalStorage, setSessionStorage } from '../utils/general/general.util';
import { toDataSourceRequestString, toODataString } from '@progress/kendo-data-query';
import { SignalRService } from './signal-r.service';
import { BehaviorSubject , Observable, Subject , pipe, of} from 'rxjs';
import { filter, skip, takeUntil , map ,  take , catchError} from 'rxjs/operators';
import { ticker } from 'pixi.js';
import { Router } from '@angular/router';
import { AzurePubsubService } from './azure-pubsub.service';
import { DatePipe } from '@angular/common'
import { ConfigService } from './config.service';
import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { RobotStateTypes, DropListBuilding, DropListFloorplan, DropListMap, DropListPointIcon, DropListRobot, JFloorPlan, JTask, RobotMaster, RobotStatusARCS, RobotTaskInfoARCS, SaveRecordResp, TaskItem, floorPlan3DSettings, LiftState, TurnstileState } from './data.models';
import { DataService } from './data.service';
import { timeStamp } from 'console';


// @ts-ignore
@Injectable({
  providedIn: 'root'
})
export class MapService {
  constructor(public dataSrv : DataService , public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil , private router : Router  , private datePipe : DatePipe , public configSrv : ConfigService , public ngZone : NgZone)  {
    if(this.util.$initDone.value == true){
      this.init()
    }else {
      this.util.initDone.subscribe(async()=>this.init())
    }
  }
  set _defaultSite(v){
    this.defaultSite = v
    this.dataSrv._defaultSite = v
  }
  set _defaultBuilding(v){
    this.defaultBuilding = v
    this.dataSrv._defaultBuilding = v
  }
  defaultSite
  defaultBuilding
  outSyncFloorPlans = []
  floorPlanStore : {[key : string] : FloorPlanState} = {}
  alertImageCache : {
    robotId : string ,
    timestamp : string ,
    base64Image : string,
    detectionType : string
  }
  floorPlanStateChanged : EventEmitter<FloorPlanState> = new EventEmitter<FloorPlanState>()

  async init(){
    if(!this.util.getCurrentUser()){
      return
    }
    await this.getSite()
    // this.updateFloorPlansAlert_ARCS()
    if (!this.dataSrv.getSessionStorage("arcsDefaultBuilding")) {
      await this.getDefaultBuilding()
    }
    this.defaultBuilding = JSON.parse(this.dataSrv.getSessionStorage("arcsDefaultBuilding"))
  }

  public async getFloorPlanStateByMapCode(mapCode) : Promise<FloorPlanState>{
    let floorPlanState = Object.values(this.floorPlanStore).filter(v=>v.data.mapList.some(m=>m.mapCode == mapCode))[0]
    if(!floorPlanState){
      floorPlanState = await this.floorPlanState(await this.dataSrv.getFloorPlanCode(mapCode))
    }
    return floorPlanState
  }

  public async floorPlanState(fpCode: string) : Promise<FloorPlanState>{
    if (!this.floorPlanStore[fpCode]) {
      await this.getFloorPlan(fpCode , false)
    }
    return this.floorPlanStore[fpCode]
  }

  public async getSite(forceRefresh = false){ 
    if(this.defaultSite === undefined || forceRefresh){
      this.defaultSite = await this.httpSrv.get('api/site/v1')
      this.defaultSite  = this.defaultSite === undefined ? null : this.defaultSite 
    }
    return this.defaultSite
  }

  public async get3DFloorPlanSettings(code : string) : Promise<floorPlan3DSettings>{
    return await this.httpSrv.get("api/map/floorPlan3DSettings/v1/"+ code) 
  }

  
  public async getFloorPlan(code : string | null = null, blockUI = true): Promise<JFloorPlan>{
    let ticket
    code = code ? code : Object.keys(this.floorPlanStore).filter(k=>this.floorPlanStore[k]?.data?.defaultPerBuilding)[0]
    if(blockUI){
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let cachedFp : JFloorPlan = this.floorPlanStore[code]?.data
    if (code && cachedFp) {
      let noImgFp: JFloorPlan = await this.httpSrv.get('api/map/plan/v1/' + code + '?mapImage=false&floorPlanImage=false');
      if (noImgFp.modifiedDateTime == cachedFp.modifiedDateTime && noImgFp.mapList.every(m => cachedFp.mapList && cachedFp.mapList.filter(m2 => m2.mapCode == m.mapCode && m2.robotBase == m.robotBase)[0]?.modifiedDateTime == m.modifiedDateTime)) {
        if (blockUI) {
          this.uiSrv.loadAsyncDone(ticket) 
        }
        return this.floorPlanStore[code].data
      }
    }
    let ret : JFloorPlan = await this.httpSrv.get(code ? ('api/map/plan/v1/' +  code): 'api/map/plan/default/v1');
    if(blockUI){
      this.uiSrv.loadAsyncDone(ticket)
    }
    code = ret.floorPlanCode
    const newFp = new FloorPlanState(this, ret.floorPlanCode) 
    newFp.data =  JSON.parse(JSON.stringify(ret))
    newFp.modifiedDateTime =  ret.modifiedDateTime
    this.floorPlanStore[code] = newFp
    return ret
  }

  public async getDefaultBuilding(){
    let builidngDDL : DropListBuilding[] = <any>(await this.dataSrv.getDropList('buildings')).data
    if(builidngDDL.length > 0){
      var code = builidngDDL.filter(b=>b.defaultPerSite)[0]?.buildingCode
      code = code ? code : builidngDDL[0].buildingCode
      this.dataSrv.setSessionStorage('arcsDefaultBuilding',JSON.stringify(code))
    }
  }

  public async get3DFloorPlanBlob(code : string) : Promise<Blob>{
    let ret : any = null
    let awaiter = new Subject()
    let ticket = this.uiSrv.loadAsyncBegin()
    this.httpSrv.http.get(this.util.getRvApiUrl() + `/api/map/3dModel/v1/${code}.glb`, { reportProgress: true, observe: 'events', responseType: "blob" }).subscribe(resp => {
      if (resp.type === HttpEventType.Response) {
        this.uiSrv.loadAsyncDone(ticket)
        if (resp.status == 200) {
          ret = resp.body
        } 
        awaiter.next(true)
      }
    },
      error => {
        awaiter.next(false)
        this.uiSrv.loadAsyncDone(ticket)
        console.log(error)
      });
    await <any>awaiter.pipe(filter(v => ![null, undefined].includes(v)), take(1)).toPromise()
    return ret
  }

    
  async updateOutSyncFloorPlanList(){
    let maps : DropListMap[] = (<any>(await this.dataSrv.getDropList('maps')).data)
    let alertMaps = maps.filter(m=> !m.floorPlanCode && maps.filter(m2=> m2.mapCode == m.mapCode && m2.floorPlanCode != m.floorPlanCode).length > 0)
    this.outSyncFloorPlans = []
    alertMaps.forEach(m=>{
      let floorPlanCode = maps.filter(m2=> m2.mapCode == m.mapCode && m2.floorPlanCode != m.floorPlanCode).map(m2=>m2.floorPlanCode)[0]
      let alertFloorPlanObj : {type : string ,floorPlanCode : string , mapCode : string , robotBases : string[] } = this.outSyncFloorPlans.filter(f=>f.floorPlanCode == floorPlanCode)[0]
      if (!alertFloorPlanObj) {
        alertFloorPlanObj = {type : 'SyncAlert' , floorPlanCode: floorPlanCode, mapCode: m.mapCode, robotBases: []  }
        this.outSyncFloorPlans.push(alertFloorPlanObj)
      }
      if(!alertFloorPlanObj.robotBases.includes(m.robotBase)){
        alertFloorPlanObj.robotBases.push(m.robotBase)
      }
    })
    this.dataSrv.setLocalStorage('unreadSyncMsgCount', this.dataSrv.unreadSyncMsgCount.value.toString())
  }


}


  
export class FloorPlanState {
  _floorPlanCode
  get floorPlanCode (){
    return this.data?.floorPlanCode ? this.data?.floorPlanCode : this._floorPlanCode
  }
  mapSrv : MapService
  modifiedDateTime
  data : JFloorPlan
  iot : {
    lift : LiftState[] , 
    turnstile : TurnstileState[]
  }

  alerts : {
    robotId : string ,
    timestamp : number ,
    floorPlanCode : string,
    alertType : string , 
    mapCode : string , 
    rosX : number , 
    rosY : number , 
    mapAngle : number ,
    noted : boolean
  }[] = []


  constructor(_mapSrv : MapService , floorPlanCode = null){
    this.mapSrv = _mapSrv
    this._floorPlanCode = floorPlanCode
    this.getOldAlertsFromLocalStorage()
  }

  getOldAlertsFromLocalStorage(){
    this.alertslocalStorageHouseKeep()
    let alerts = this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')? JSON.parse(this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')) : []
    alerts = alerts.filter((a : {floorPlanCode : string}) => a.floorPlanCode == this.floorPlanCode)
    this.alerts = this.alerts.concat(alerts.filter((a : {robotId : string , timestamp : any})=>!this.alerts.some(a2=>a2.robotId == a.robotId && a2.timestamp == a.timestamp)))
  }

  updateAlertsInLocalStorage(){
    let alerts = this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')? JSON.parse(this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')) : []
    alerts = alerts.filter((a:{floorPlanCode : string})=> a.floorPlanCode != this.floorPlanCode ).concat(this.alerts.slice())
    this.mapSrv.dataSrv.setLocalStorage('floorPlanAlerts' , JSON.stringify(alerts))
    this.alertslocalStorageHouseKeep()
  }

  alertslocalStorageHouseKeep(){
    let alerts = this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')? JSON.parse(this.mapSrv.dataSrv.getLocalStorage('floorPlanAlerts')) : []
    alerts = alerts.filter((a:{timestamp : number}) =>  a.timestamp !=null && new Date(a.timestamp * 1000).toDateString() == new Date().toDateString())
    this.mapSrv.dataSrv.setLocalStorage('floorPlanAlerts' , JSON.stringify(alerts))
  }

  addAlert(d: {robotId : string , detectionType : string, base64Image : string ,  pose : {mapName : string , x : number , y : number , angle : number} ,  timestamp : number , confidence : number}) {
    const newAlert = {
      floorPlanCode : this.floorPlanCode,
      robotId : d.robotId , 
      timestamp : d.timestamp,
      alertType : d.detectionType , 
      mapCode : d.pose?.mapName , 
      rosX : d.pose?.x , 
      rosY : d.pose?.y , 
      mapAngle : d.pose?.angle , 
      confidence : d.confidence,
      noted : false
    }
    this.alerts.push(newAlert);
    this.mapSrv.alertImageCache = {
      robotId : d.robotId,
      timestamp : d.timestamp.toString(),
      base64Image : d.base64Image,
      detectionType : d.detectionType
    }
    this.mapSrv.floorPlanStateChanged.emit(this)
    this.updateAlertsInLocalStorage()
  }

  markAlertAsNoted(robotId: string , id : any){
    const alert =  this.alerts.filter(a=>a.robotId == robotId && a.timestamp == id)[0]
    if(alert){
      alert.noted = true
      this.updateAlertsInLocalStorage()
    }
  }
}
