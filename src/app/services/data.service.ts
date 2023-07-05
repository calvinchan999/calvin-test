import { Injectable, NgZone } from '@angular/core';
import { DataStateChangeEvent } from '@progress/kendo-angular-grid';
import { RvHttpService } from './rv-http.service';
import { IndexedDBService } from './indexed-db.service';
import { EnumNamePipe, UiService } from './ui.service';
import { GeneralUtil, getLocalStorage, getSessionStorage, setLocalStorage, setSessionStorage } from 'src/app/utils/general/general.util';
import { toDataSourceRequestString, toODataString } from '@progress/kendo-data-query';
import { SignalRService } from './signal-r.service';
import { BehaviorSubject , Observable, Subject , pipe, of, fromEvent} from 'rxjs';
import { filter, skip, takeUntil , map ,  take , catchError} from 'rxjs/operators';
import { ticker } from 'pixi.js';
import { Router } from '@angular/router';
import { AzurePubsubService } from './azure-pubsub.service';
import { DatePipe } from '@angular/common'
import { ConfigService } from './config.service';
import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { RobotStateTypes, DropListBuilding, DropListFloorplan, DropListMap, DropListPointIcon, DropListRobot, JFloorPlan, JTask, RobotProfile as RobotProfile, RobotStatusARCS, SaveRecordResp, TaskItem, JFloorPlan3DSettings, RobotProfileResp } from './data.models';

export const ObjectTypes = ['ROBOT','FLOOR_PLAN' , 'FLOOR_PLAN_POINT' , 'MAP' , 'MAP_POINT' , 'TASK' , 'OPERATION' , 'MISSION']
export type syncStatus = 'TRANSFERRED' | 'TRANSFERRING' | 'MALFUNCTION'
export type syncLog =  {dataSyncId? : string , dataSyncType? : string , objectType? : string , dataSyncStatus?: syncStatus , objectCode?: string , robotCode?: string , progress? : any , startDateTime? : Date , endDateTime : Date  }
export type dropListType =  'floorplans' | 'buildings' | 'sites' | 'maps' | 'actions' | 'types' | 'locations' | 'userGroups' | 'subTypes' | 'robots' | 'missions' | 'taskFailReason' | 'taskCancelReason' | 'lifts'
export type localStorageKey = 'floorPlanAlerts'| 'lang' | 'uitoggle' | 'lastLoadedFloorplanCode' | 'eventLog' | 'unreadMsgCnt' | 'unreadSyncMsgCount' | 'syncDoneLog' | 'dashboardMapType'
export type sessionStorageKey = 'arcsLocationTree' | 'dashboardFloorPlanCode'| 'isGuestMode' | 'userAccess' | 'arcsDefaultBuilding' | 'userId' | 'currentUser' 
export type eventLog = {datetime? : string , type? : string , message : string  , robotCode?: string }

@Injectable({
  providedIn: 'root'
})
export class DataService {
  _defaultSite 
  _defaultBuilding
  public mapSrvInitDone = new BehaviorSubject<boolean>(false)
  public unreadSyncMsgCount = new BehaviorSubject<number>(0)
  public codeRegex
  public codeRegexErrorMsg
  public enumPipe = new EnumNamePipe()
  public objectTypeDropDownOptions = ObjectTypes.map(t=> {return {value : t , text : this.enumPipe.transform(t)}})

  public get robotId (){
    return this.robotProfile?.robotCode
  }
  private _withDashboard = false
  public set withDashboard(v){
    this._withDashboard = v
    this.uiSrv.withDashboard = v
    this.uiSrv.refreshDrawerItems.next(v);
  }
  public get withDashboard(){
    return this._withDashboard
  }
  public robotProfile : RobotProfile
  private allDropListTypes = ['floorplans' , 'buildings' , 'sites' , 'maps' , 'actions', 'types' , 'subTypes' , 'userGroups' , 'missions']
  private dropListApiMap = {
    taskCancelReason: { url: 'task/v1/userCancelReason', valFld: 'enumName', descFld: 'enumName', fromRV: true , enumPipe : true},
    taskFailReason: { url: 'task/v1/failedReason', valFld: 'enumName', descFld: 'enumName', fromRV: true , enumPipe : true},
    locations: { url: 'api/map/plan/point/droplist/v1', valFld: 'pointCode', descFld: 'pointCode' , fromRV : false },
    subTypes:{ url: 'robot/v1/robotSubTypeList', descFld: 'description', valFld: 'enumName', fromRV : true },
    types: { url: 'robot/v1/robotTypeList', descFld: 'description', valFld: 'enumName' , fromRV : true},
    floorplans: { url: 'api/map/plan/droplist/v1', descFld: 'name' , valFld:'floorPlanCode'  , fromRV : false },
    buildings: { url: 'api/building/droplist/v1', valFld : 'buildingCode', descFld: 'name'  , fromRV : false },
    sites: { url: 'api/site/v1/droplist',valFld: 'siteId', descFld: 'siteName'  , fromRV : false },
    maps: { url: 'api/map/droplist/v1' , valFld : 'mapCode', descFld: 'name'  , fromRV : false },
    actions: { url: this.util.arcsApp ? 'operation/v1' : 'action/v1',  descFld: 'name', valFld: 'alias' ,  fromRV : true },
    userGroups : { url: 'api/user/userGroup/dropList/v1',  descFld: 'name', valFld: 'userGroupCode' , fromRV : false },
    robots : { url: 'robot/v1',  descFld: 'name', valFld: 'robotCode' , fromRV : true },
    missions : {url : 'api/task/mission/droplist/v1' , descFld : 'name' , valFld: 'missionId' , fromRV : false },
    lifts : {url : 'iot/v1/lift' , descFld : 'liftCode' , valFld : 'liftCode' , fromRV : true}
  }

  public dataStore = {//persist until dataService is destroyed
    arcsRobotList:[],
    map: {},
    floorPlan: {},
    action:null,
    pointTypeList : []
  }

  //WIP : Call rest API to get cuurent status (& subj.next(message)) on Connected
  //DONE : ticket system (~uiSrv.loadAsyncBegin() & loadAsyncDone()) to subscribe / unbscribe as singleton
  //DONE : concat robotCode / mapCode to the topic for ARCS
  // public mqGeneralConfig = {
  //   backgroundSubscribeTypes : this.util.arcsApp? ['exception' , 'estop' , 'tilt' , 'obstacleDetection' , 'arcsSyncLog' ]: ['estop' , 'tilt' , 'obstacleDetection' , 'exception', 'taskActive' , 'taskComplete' , 'destinationReached', 'moving']
  // }

  
  eventLog = new BehaviorSubject<eventLog[]>([])

  get _USE_AZURE_PUBSUB(){
    return this.util.arcsApp && !this.util.config.USE_SIGNALR
  }

  constructor(  public iDbSrv : IndexedDBService , public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil , private router : Router  , private datePipe : DatePipe , public configSrv : ConfigService , public ngZone : NgZone) {     
    this.uiSrv.dataSrv = this
    // this.loadDataFromLocalStorage()
    if(this.util.$initDone.value == true){
      this.init()
    }else {
      this.util.initDone.subscribe(async()=>this.init())
    }
    this.util.formConfigLoaded.subscribe(()=>{
      this.codeRegex = this.util.formConfig.codeRegex
      this.codeRegexErrorMsg = this.util.formConfig.codeRegexErrorMsg
    })
  }


  setLocalStorage(key : localStorageKey , value : string){ //Manage All LocalStorage Keys here!!!
    setLocalStorage(key, value)
  }

  getLocalStorage(key : localStorageKey ){ 
    return getLocalStorage(key)
  }

  setSessionStorage(key : sessionStorageKey , value : string){ //Manage All SessionStorage Keys here!!!
    setSessionStorage(key, value)
  }

  getSessionStorage(key : sessionStorageKey ){
    return  getSessionStorage(key)
  }


  async init(){
    this.configSrv.disabledModule_SA.pairing = this.configSrv.disabledModule_SA.followMe // binded
    if(this.util.config.LANGUAGES){
      let options = []
      Object.keys(this.util.config.LANGUAGES).forEach(k=> options.push({value : k , text : this.util.config.LANGUAGES[k]}))
      this.uiSrv.langOptions = options
    }
    if(this.getLocalStorage("lang")){
      this.uiSrv.changeLang(this.getLocalStorage("lang"))
    }
    if(!this.util.getCurrentUser()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()

    if (this.util.standaloneApp) {
      await this.getRobotProfile()
      // this.getRobotMaster(profile)
      // let lidarStatusResp = await this.httpSrv.fmsRequest('GET', this.mqMaster.lidarStatus.api, undefined, false)
      // if (lidarStatusResp?.SwitchOn) {
      //   this.uiSrv.showWarningDialog('Lidar Sensor Turned On.')
      // }
    } else {
      // await this.getSite()
      // // this.updateFloorPlansAlert_ARCS()
      // if (!this.getSessionStorage("arcsDefaultBuilding")) {
      //   await this.getArcsDefaultBuilding()
      // }
      // this.arcsDefaultBuilding = JSON.parse(this.getSessionStorage("arcsDefaultBuilding"))
    }

    // if(this._USE_AZURE_PUBSUB){
    //   this.pubsubSrv.makeWebSocketConnection()   
    // }
    // await this.subscribeMQTTs(<any>this.mqGeneralConfig.backgroundSubscribeTypes)
    this.uiSrv.loadAsyncDone(ticket)
   }

  public async getDropListData(type: dropListType, filterBy: string = null) {
    let data = (await this.getDropList(type)).data
    return data.filter(d => filterBy == null || d[this.dropListApiMap[type].valFld ? this.dropListApiMap[type].valFld : 'id'] == filterBy)
  }


  public getDropListOptions(type: dropListType, dropListData: any[], filterBy: object = null) {
    let apiMap = this.dropListApiMap
    return dropListData.filter(r => filterBy == null || Object.keys(filterBy).every(k => r[k] == filterBy[k])).map(d => {
      let value =  d[apiMap[type].valFld ? apiMap[type].valFld : 'id']
      let desc =  (d[apiMap[type].descFld? apiMap[type].descFld : 'displayName'] )
      return {
        value: value,
        text: apiMap[type]['enumPipe'] ? this.enumPipe.transform(desc) : desc
      }
    }).sort((a, b) => a.text < b.text ? -1 : 1)
  }

  public getDropListDesc(list : object[] , value ,  type : dropListType = null ){
    if(type){
      return list.filter(itm=>itm[this.dropListApiMap[type]?.valFld ? this.dropListApiMap[type]?.valFld : 'id'] == value)[0]?.[this.dropListApiMap[type].descFld]
    }else{
      return list.filter(itm=>itm['value'] == value)[0]?.['text']
    }
  }

  public async getDropList(type : dropListType) : Promise<{data:object[] , options:object[]}>{
    let ret= {data: null ,options: null}
    let apiMap = this.dropListApiMap
    var resp = apiMap[type].fromRV? await this.httpSrv.fmsRequest("GET", apiMap[type].url , undefined, false) :  await this.httpSrv.get(apiMap[type].url)
    // if(this.util.arcsApp && type == 'floorplans'){
    //   await this.getSite()
    // }
    if(this.util.arcsApp && type == 'floorplans'){
      if(this.mapSrvInitDone.value != true){
        await this.mapSrvInitDone.pipe(filter(v=>v == true) , take(1)).toPromise()
        console.log(this._defaultBuilding)
      }else{
        console.log(this._defaultBuilding)
      }
      if( !this._defaultSite && this._defaultBuilding){
        resp = resp.filter((fp : DropListFloorplan)=>fp.buildingCode == this._defaultBuilding)
      }else if( this._defaultSite){
        resp = resp.filter((fp : DropListFloorplan)=>fp.buildingCode != null)
      }
    }

    ret = {
      data: resp.filter(itm => !apiMap[type]['filter'] || apiMap[type]['filter'](itm)),
      options: null
    }
  
    // if(this.util.standaloneApp && type == 'actions'){ //TBR
    //   let robotInfo = await this.getRobotInfo()
    //   ret.data = ret.data.filter(a=> a['typeIds'].split(',').map(i=>Number(i)).includes(robotInfo.robotType));
    // }

    ret.options = this.getDropListOptions(type , ret.data)
    return ret
  }

  public async getDropLists(types : dropListType[] = <any>['floorplans' , 'maps', 'locations' ].concat(this.util.arcsApp ?  ['buildings' , 'sites'] : [])) {
    let ret = {data : {} , option : {}}
    await Promise.all(types.map(async(t)=>{
      let droplistObj = await this.getDropList(t)
      ret.data[t] = droplistObj.data.filter(itm=>! this.dropListApiMap[t]['filter'] ||  this.dropListApiMap[t]['filter'](itm))
      ret.option[t] = droplistObj.options
    }))
    return ret
    // return await this.httpSrv.get("api/map/plan/v1")
  }



  public async getRobotList() : Promise<DropListRobot[]>{
    if(!this.dataStore.arcsRobotList || this.dataStore.arcsRobotList?.length == 0){
      this.dataStore.arcsRobotList = (await this.getDropList('robots')).data
    }
    return this.dataStore.arcsRobotList
  }

  public async getPointIconList() : Promise<DropListPointIcon[]>{
    if(this.dataStore.pointTypeList?.length > 0){
      let updatedList :DropListPointIcon[] = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=false`);
      if(updatedList.some((newItm: DropListPointIcon ) => {
        let match : DropListPointIcon = this.dataStore.pointTypeList.filter((old : DropListPointIcon)=> old.code == newItm.code)[0];
        return !match || match.modifiedDateTime != newItm.modifiedDateTime
      })){
        this.dataStore.pointTypeList = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=true`)
      }
    }else{
      this.dataStore.pointTypeList = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=true`)
    }
    return this.dataStore.pointTypeList
  }

  public async getPointTypeList(blockUI = true){
    let ticket
    if(blockUI){
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let data = await this.httpSrv.fmsRequest('GET','floorPlan/v1/pointTypeList',undefined,false)
    if(blockUI){
      this.uiSrv.loadAsyncDone(ticket)
    }
    return data.map((d:{enumName:string , description : string}) => {return {text : d.description , value : d.enumName}})
  }

  
  public async saveRecord(endpoint : string, payload , errorMap = null , isCreate = true, header = undefined) : Promise<SaveRecordResp>{
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp : SaveRecordResp
    try{
      if(isCreate){
        resp = await this.httpSrv.post(endpoint, payload,undefined,header,undefined,true)
      }else{
        resp = await this.httpSrv.put(endpoint, payload,undefined,header,undefined,true)
      }
    }catch(err){
      this.uiSrv.showWarningDialog(this.uiSrv.translate("Save Failed") + (err?.error?.message ? ' : ' + err?.error?.message : (this.uiSrv.translate(' (Activate debug console for further details)'))))
      console.log('****** v SAVE RECORD ERROR LOG v *****')
      console.log(err)
      console.log('****** ^ SAVE RECORD ERROR LOG ^ *****')
      this.uiSrv.loadAsyncDone(ticket)
      return {result : false , validationResults : []}
    }
    resp = resp ? resp : {result : false}
    this.uiSrv.loadAsyncDone(ticket)
    if (resp?.result == true) {
      this.uiSrv.showNotificationBar("Save Successful" , 'success' , undefined , undefined, true)
    } else {
      if (resp?.validationResults) {
        this.util.showErrors(resp.validationResults, errorMap, resp)
      }
      resp.msg = resp.msg ? resp.msg : this.uiSrv.translate('Save Failed')
      if (resp.exceptionDetail) {
        console.log(resp.exceptionDetail)
      }
      // this.uiSrv.showWarningDialog("Save Failed" + (resp?.msg ? (' : ' + resp.msg) : ''))
    } 
    if(resp?.msg){
      this.uiSrv.showMsgDialog(resp?.msg)
    }
    resp.result = resp?.result == true ? true : false
    return resp
    // this.uiSrv.showMsgDialog(resp == true ? "Save Successful" : "Save Failed" + (resp.message ? ' : ' : '') + resp.message, undefined, undefined,
    //                          resp == true ? undefined: 'warning', resp == true ? undefined: 'orange')
  }

  public async deleteRecords(endPoint, rows){    
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp 
    try{
      resp  = await this.httpSrv.delete(endPoint,rows)
    }catch(err){
      this.uiSrv.showWarningDialog(this.uiSrv.translate("Save Failed") + (err?.error?.message ? ' : ' + err?.error?.message : (this.uiSrv.translate(' (Activate debug console for further details)'))))
      console.log('****** v DELETE RECORD ERROR LOG v *****')
      console.log(err)
      console.log('****** ^ DELETE RECORD ERROR LOG ^ *****')
      this.uiSrv.loadAsyncDone(ticket)
      return
    }
    this.uiSrv.loadAsyncDone(ticket)
    let msg = resp?.msg
    msg = msg ? msg : (this.uiSrv.translate(resp?.result == true ?"Record(s) deleted successfully" : "Fail to delete record(s)"))
    this.uiSrv.showMsgDialog(msg)
    return resp?.result
  }

  public getUrlQueryParam(criteria : DataStateChangeEvent) : string{
   return criteria? '?' + toDataSourceRequestString(criteria) : ''
  }

  public async getRobotProfile() : Promise<RobotProfile>{
    if(!this.robotProfile?.robotCode){
      let profile : RobotProfileResp = await this.httpSrv.fmsRequest('GET', 'baseControl/v1/profile' , undefined, false)
      this.robotProfile = {
        robotCode: profile.robotId,
        robotBase: profile.robotBase,
        robotType: profile.robotType, 
        robotSubType : profile.robotSubtype,
        ip : profile.networkList.filter(n=>n.name.toLowerCase().startsWith('w')).length == 1 ? profile.networkList.filter(n=>n.name.toLowerCase().startsWith('w'))[0].ipAddress : profile.networkList.map(n=>n.ipAddress).join('; ')
      }
      // profile.serviceList.forEach(s=> this.configSrv.disabledModule_SA[s.name] = !s.enabled) 
      // let ret = (await this.httpSrv.get("api/robot/v1"))
      // let ret : RobotProfileResp = ( await this.httpSrv.fmsRequest('GET', 'baseControl/v1/profile' , undefined, false))
      // this.robotMaster = {robotCode : ret.robotId , robotBase : ret.robotBase , robotType : ret.robotType , robotSubType : ret.robotSubtype}
    }
    this.withDashboard = this.robotProfile.robotType == 'PATROL' || (this.robotProfile.robotType == 'DELIVERY' && ['TRAY_DELIVERY','CABINET_DELIVERY'].includes(this.robotProfile.robotSubType))
    return  this.robotProfile 
  }

  public async getFloorPlanCode(mapCode : string){
    return (<DropListMap[]>(await this.getDropList('maps')).data).filter((d)=>d.mapCode == mapCode)[0]?.floorPlanCode
  }

  public async getAssets(url: string): Promise<any> {
    try{      
      return await this.httpSrv.http.get(url).toPromise()
    }catch{
      return null
    }
  }

  public convertObject(source : object , target : object , keyValuePair : object = {}){
    Object.keys(target).forEach(k=>{
      target[k] = source[k]
    })
    Object.keys(keyValuePair).forEach(k=>{
      target[k] = keyValuePair[k]
    })
    return target
  }

  public appendKeyValue( target : object , keyValuePair : object = {}){
    Object.keys(keyValuePair).forEach(k=>{
      target[k] = keyValuePair[k]
    })
    return target
  }



  // // * * * v RV STANDALONE ACTIONS v * * * 
  // public async openRobotCabinet(id , robotCode = null){
  //   this.httpSrv.fmsRequest("POST" , `cabinet/v1/open/${robotCode? robotCode + '/' : ''}` + id , undefined , true , this.uiSrv.translate(`Open Cabiniet [${id}]`))
  // }

  // public async closeRobotCabinet(id, robotCode = null){
  //   this.httpSrv.fmsRequest("POST" , `cabinet/v1/close/${robotCode? robotCode + '/' : ''}` + id, undefined ,  true , this.uiSrv.translate(`Close Cabiniet [${id}]`))
  // }

  // public async connectWifi(ssid , pw){
  //   this.httpSrv.fmsRequest('POST', 'wifi/v1/connection', {ssid :ssid , password : pw},  true , this.uiSrv.translate('Connected to [SSID] Successfully').replace('[SSID]' , ('[' + ssid + ']')))
  // }
  // public async stopManualMode(){
  //   return this.httpSrv.fmsRequest('PUT', 'baseControl/v1/manual/OFF'  ,  null , true, 'Manual OFF')  
  // }

  //   // return <any> ret.pipe(filter(v => ![null,undefined].includes(v)), take(1)).toPromise()
  // }
  // // * * * ^ RV STANDALONE ACTIONS ^ * * * 
  
}

