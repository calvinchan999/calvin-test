import { EventEmitter, Injectable, NgZone } from '@angular/core';
import { DataStateChangeEvent } from '@progress/kendo-angular-grid';
import { RvHttpService } from './rv-http.service';
import { EnumNamePipe, UiService } from './ui.service';
import { GeneralUtil, base64ToBlob, blobToBase64, getLocalStorage, getSessionStorage, setLocalStorage, setSessionStorage } from '../utils/general/general.util';
import { toDataSourceRequestString, toODataString } from '@progress/kendo-data-query';
import { SignalRService } from './signal-r.service';
import { BehaviorSubject , Observable, Subject , pipe, of} from 'rxjs';
import { filter, skip, takeUntil , map ,  take , catchError, retry} from 'rxjs/operators';
import { ticker } from 'pixi.js';
import { Router } from '@angular/router';
import { AzurePubsubService } from './azure-pubsub.service';
import { DatePipe } from '@angular/common'
import { ConfigService } from './config.service';
import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { RobotStateTypes, DropListBuilding, DropListFloorplan, DropListMap, DropListPointIcon, DropListRobot, JFloorPlan, JTask, RobotProfile, RobotStatusARCS, SaveRecordResp, TaskItem, LiftState, TurnstileState, JFloorPlan3DSettings, WaypointState } from './data.models';
import { DataService } from './data.service';
import { timeStamp } from 'console';
import { stat } from 'fs';


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
  set defaultSite(v){
    this._defaultSite = v
    this.dataSrv._defaultSite = v
  }
  set defaultBuilding(v){
    this._defaultBuilding = v
    this.dataSrv._defaultBuilding = v
  }

  get defaultSite() {
    return this._defaultSite
  }
  get defaultBuilding() {
    return this._defaultBuilding
  }

  _defaultSite
  _defaultBuilding
  
  outSyncFloorPlans = []
  floorPlanStore : {[key : string] : FloorPlanState} = {}
  alertImageCache : {
    robotId : string ,
    timestamp : string ,
    base64Image : string,
    detectionType : string,
    metadata? : string,
    count? : number,
    confidence? : number
  }
  floorPlanStateChanged : EventEmitter<FloorPlanState> = new EventEmitter<FloorPlanState>()

  async init(){
    if(!this.util.getCurrentUser()){
      return
    }
    // await this.updateFloorPlanStoreWithIdb()
    if(this.util.arcsApp){
      await this.getSite()
      // this.updateFloorPlansAlert_ARCS()
      if (!this.dataSrv.getSessionStorage("arcsDefaultBuilding")) {
        await this.getDefaultBuilding()
      }
      this.defaultBuilding = this.dataSrv.getSessionStorage("arcsDefaultBuilding")
      setTimeout(()=> this.dataSrv.mapSrvInitDone.next(true))
    }  
  }

  // async updateFloorPlanStoreWithIdb(){

  // }
  public async getStandaloneActiveFloorPlan(): Promise<{ floorPlanCode: string, name: string }> {
    let currentMap = (<{ id: string }>await this.httpSrv.fmsRequest('GET', "map/v1/activeMap", undefined, false))?.id
    let currentFloorPlan = (<DropListMap[]>(await this.dataSrv.getDropList('maps')).data).filter(m => m.mapCode == currentMap)[0]?.floorPlanCode
    let currentFloorPlanName = (<DropListFloorplan[]>(await this.dataSrv.getDropList('floorplans')).data).filter(f => f.floorPlanCode == currentFloorPlan)[0]?.name
    return { floorPlanCode: currentFloorPlan, name: currentFloorPlanName }
  }

  public async getWayPointState(floorPlanCode: string, waypointCode: string): Promise<WaypointState> {
    let states: WaypointState[] = await this.dataSrv.httpSrv.fmsRequest('GET', `resource/v1?floorPlanCode=${floorPlanCode}`, undefined, false)
    return states.filter(s => s.floorPlanCode == floorPlanCode && s.pointCode == waypointCode)[0]
  }

  public async getFloorPlanStateByMapCode(mapCode) : Promise<FloorPlanState>{
    let floorPlanState = Object.values(this.floorPlanStore).filter(v=>v.dataWithoutImage.mapList.some(m=>m.mapCode == mapCode))[0]
    if(!floorPlanState){
      floorPlanState = await this.floorPlanState(await this.dataSrv.getFloorPlanCode(mapCode))
    }
    return floorPlanState
  }

  public async floorPlanState(fpCode: string) : Promise<FloorPlanState>{
    if (!this.floorPlanStore[fpCode]) {
      let fp =  await this.getFloorPlan(fpCode , false)
      const newState = new FloorPlanState(this, fpCode) 
      fp.base64Image = null // avoid memory leak
      fp.mapList.forEach(m=>m.base64Image = null) // avoid memory leak
      newState.modifiedDateTime =  fp.modifiedDateTime
      newState.dataWithoutImage = fp
      this.floorPlanStore[fpCode] = newState
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

  public async get3DFloorPlanSettings(code : string) : Promise<JFloorPlan3DSettings>{
    return await this.httpSrv.get("api/map/floorPlan3DSettings/v1/"+ code) 
  }

  
  public async getFloorPlan(code : string | null = null, blockUI = true): Promise<JFloorPlan>{
    let ticket
    // code = code ? code : Object.keys(this.floorPlanStore).filter(k=>this.floorPlanStore[k]?.dataWithoutImage?.defaultPerBuilding)[0]
    if(blockUI){
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let cache : FloorPlanCache = code ?  await this.dataSrv.iDbSrv.floorPlans.get(code) : null

    if (cache) {
      let noImgFp: JFloorPlan = await this.httpSrv.get('api/map/plan/v1/' + code + '?mapImage=false&floorPlanImage=false');
      if (noImgFp?.modifiedDateTime == cache.floorPlan?.modifiedDateTime && noImgFp.mapList.every(m => cache.floorPlan?.mapList && cache.floorPlan?.mapList.filter(m2 => m2.mapCode == m.mapCode && m2.robotBase == m.robotBase)[0]?.modifiedDateTime == m.modifiedDateTime)) {
        if (blockUI) {
          this.uiSrv.loadAsyncDone(ticket) 
        }
        return cache.floorPlan
      }
    }
    console.log(`Get Floor Plan Image - ${code}`)
    let ret : JFloorPlan = await this.httpSrv.get('api/map/plan/v1/' +  code);
    if (ret) {
      let newCache = await this.dataSrv.iDbSrv.floorPlans.get(code)
      newCache = newCache ? newCache : new FloorPlanCache()
      newCache.floorPlan = JSON.parse(JSON.stringify(ret))
      await this.dataSrv.iDbSrv.floorPlans.set(code, newCache)
    } else if (code) {
      delete this.floorPlanStore[code]
      await this.dataSrv.iDbSrv.floorPlans.del(code)
      sessionStorage.removeItem('dashboardFloorPlanCode')
    }

    if(blockUI){
      this.uiSrv.loadAsyncDone(ticket)
    }
    return ret
  }

  public async getDefaultBuilding(){
    let builidngDDL : DropListBuilding[] = <any>(await this.dataSrv.getDropList('buildings')).data
    if(builidngDDL.length > 0){
      var code = builidngDDL.filter(b=>b.defaultPerSite)[0]?.buildingCode
      code = code ? code : builidngDDL[0].buildingCode
      this.dataSrv.setSessionStorage('arcsDefaultBuilding',code)
    }
  }

  public async get3DFloorPlanBlob(code : string) : Promise<Blob>{
    let ret : any = null
    let awaiter = new Subject()
    let ticket = this.uiSrv.loadAsyncBegin()
    let state : FloorPlanState = await this.floorPlanState(code)
    let cachedModel = (await state.getIDBCache())?.model
    state.settings3D =  await this.get3DFloorPlanSettings(code)
    if(state.settings3D?.floorPlan == null){
      this.uiSrv.loadAsyncDone(ticket)
      return null
    }else if (cachedModel && state.settings3D.floorPlan.modifiedDateTime == cachedModel?.modifiedDatetime) {
      this.uiSrv.loadAsyncDone(ticket)
      return cachedModel.blob
    }
    console.log(`GET BLOB FROM AZURE FOR - ${code}`)
    this.httpSrv.http.get(this.util.getRvApiUrl() + `/api/map/3dModel/v1/${code}.glb`, { reportProgress: true, observe: 'events', responseType: "blob" }).subscribe(async (resp) => {
      if (resp.type === HttpEventType.Response) {
        this.uiSrv.loadAsyncDone(ticket)
        if (resp.status == 200) {
          ret = resp.body
          let cache = await state.getIDBCache()
          cache = cache ? cache : new FloorPlanCache()
          cache.model.blob = ret
          cache.model.modifiedDatetime = state.settings3D.floorPlan.modifiedDateTime
          await state.setIDBCache(cache)
        } 
        awaiter.next(true)
      }
    },
      error => {
        awaiter.next(false)
        this.uiSrv.loadAsyncDone(ticket)
        console.log(error)
      }
    );
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

  async getDefaultFloorPlanCode(){
    if(this.dataSrv.getSessionStorage('dashboardFloorPlanCode')){
      return this.dataSrv.getSessionStorage('dashboardFloorPlanCode')
    }
    let defaultBuilding = this.defaultBuilding
    let floorPlans : DropListFloorplan[] = <any>((await this.dataSrv.getDropList('floorplans')).data)
    let floorPlanCode = floorPlans.filter(f=>(f.buildingCode == defaultBuilding || !defaultBuilding ) && f.defaultPerBuilding)[0]?.floorPlanCode
    floorPlanCode = floorPlanCode ? floorPlanCode : floorPlans.filter(f=> f.buildingCode == defaultBuilding || !defaultBuilding )[0]?.floorPlanCode
    return floorPlanCode
  }
}

export class FloorPlanCache{
  model : { blob : Blob, modifiedDatetime : string } = { blob : null , modifiedDatetime :null}

  floorPlan : JFloorPlan
}
  
export class FloorPlanState {
  private _floorPlanCode
  dataWithoutImage : JFloorPlan //No base64Images for this variable to avoid memory leak
  get floorPlanCode (){
    return this.dataWithoutImage?.floorPlanCode ? this.dataWithoutImage?.floorPlanCode : this._floorPlanCode
  }
  mapSrv : MapService
  modifiedDateTime
  settings3D : JFloorPlan3DSettings
  iot : {
    lift : LiftState[] , 
    turnstile : TurnstileState[]
  }

  points : WaypointState[]

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
  
  // async getWaypointState(){
  //   this.resource = await this.mapSrv.dataSrv.httpSrv.fmsRequest('GET' , 'resource/v1?floorPlanCode=' + this.floorPlanCode, undefined , false)
  //   return this.resource 
  // }

  async setIDBCache(cache : FloorPlanCache){
    if(cache?.model?.blob){
      cache.model.blob = <any>await blobToBase64(<any>cache.model.blob)
    }
    await  this.mapSrv.dataSrv.iDbSrv.floorPlans.set(this.floorPlanCode , cache)
  }

  async getIDBCache() : Promise <FloorPlanCache>{
    let cache : FloorPlanCache =  await this.mapSrv.dataSrv.iDbSrv.floorPlans.get(this.floorPlanCode)
    if(cache?.model?.blob){
      cache.model.blob = await base64ToBlob(<any>cache.model.blob)
    }
    return cache
  }

  async getData() : Promise<JFloorPlan>{
    return (await this.getIDBCache()).floorPlan
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

  addAlert(d: {robotId : string , detectionType : string, base64Image : string ,  pose : {mapName : string , x : number , y : number , angle : number} ,  timestamp : number , confidence? : number , metadata? : string , count? : number }) {
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
      noted : false,
      metadata : d.metadata,
      count : d.count
    }
    this.alerts.push(newAlert);
    this.mapSrv.alertImageCache = {
      robotId : d.robotId,
      timestamp : d.timestamp.toString(),
      base64Image : d.base64Image,
      detectionType : d.detectionType,
      metadata : d.metadata,
      count : d.count,
      confidence:d.confidence      
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
