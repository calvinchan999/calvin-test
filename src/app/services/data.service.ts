import { Injectable, NgZone } from '@angular/core';
import { DataStateChangeEvent } from '@progress/kendo-angular-grid';
import { RvHttpService } from './rv-http.service';
import { EnumNamePipe, UiService } from './ui.service';
import { GeneralUtil, getLocalStorage, getSessionStorage, setLocalStorage, setSessionStorage } from 'src/app/utils/general/general.util';
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
import { RobotStateTypes, DropListBuilding, DropListFloorplan, DropListMap, DropListPointIcon, DropListRobot, JFloorPlan, JTask, RobotMaster, RobotStatusARCS, RobotTaskInfoARCS, SaveRecordResp, TaskItem, floorPlan3DSettings } from './data.models';

export const ObjectTypes = ['ROBOT','FLOOR_PLAN' , 'FLOOR_PLAN_POINT' , 'MAP' , 'MAP_POINT' , 'TASK' , 'OPERATION' , 'MISSION']
export type syncStatus = 'TRANSFERRED' | 'TRANSFERRING' | 'MALFUNCTION'
export type syncLog =  {dataSyncId? : string , dataSyncType? : string , objectType? : string , dataSyncStatus?: syncStatus , objectCode?: string , robotCode?: string , progress? : any , startDateTime? : Date , endDateTime : Date  }
export type dropListType =  'floorplans' | 'buildings' | 'sites' | 'maps' | 'actions' | 'types' | 'locations' | 'userGroups' | 'subTypes' | 'robots' | 'missions' | 'taskFailReason' | 'taskCancelReason'
export type localStorageKey = 'lang' | 'uitoggle' | 'lastLoadedFloorplanCode' | 'eventLog' | 'unreadMsgCnt' | 'unreadSyncMsgCount' | 'syncDoneLog' | 'dashboardMapType'
export type sessionStorageKey = 'arcsLocationTree' | 'dashboardFloorPlanCode'| 'isGuestMode' | 'userAccess' | 'arcsDefaultBuilding' | 'userId' | 'currentUser' 
export type eventLog = {datetime? : string , type? : string , message : string  , robotCode?: string }
export type mqType = 'activeMap' | 'occupancyGridMap' | 'navigationMove' | 'chargingResult' | 'chargingFeedback' | 'state' | 'battery' | 'pose' | 'speed'| 'poseDeviation' |
                    'obstacleDetection' | 'estop' | 'brake' | 'tilt' | 'departure' | 'arrival' | 'completion' | 'timeout' | 'exception' | 'followMePair' |
                    'followMeAoa' | 'digitalOutput' | 'wifi' | 'cellular' | 'ieq' | 'rfid' | 'cabinet' | 'rotaryHead' | 'nirCamera' | 'nirCameraDetection' |
                    'thermalCamera' | 'thermalCameraDetection' | 'webcam' | 'heartbeatServer' | 'heartbeatClient' | 'arcsPoses' | 'taskActive' | 'lidarStatus' |
                    'led' | 'fan' | 'pauseResume' | 'taskComplete' | 'taskDepart' | 'taskArrive' | 'destinationReached' | 'taskProgress' | 'moving' | 'lidar'| 'taskPopups'|
                    'arcsRobotStatusChange' | 'arcsTaskInfoChange' | 'arcsSyncLog' | 'arcsRobotDestination' | 'arcsLift' | 'arcsTurnstile'

@Injectable({
  providedIn: 'root'
})
export class DataService {
  public alertFloorPlans :{type : string ,floorPlanCode : string , mapCode : string , robotBases : string[]}[] = []
  public unreadSyncMsgCount = new BehaviorSubject<number>(0)
  public arcsDefaultSite 
  public arcsDefaultBuilding = null
  public codeRegex
  public codeRegexErrorMsg
  public enumPipe = new EnumNamePipe()
  public objectTypeDropDownOptions = ObjectTypes.map(t=> {return {value : t , text : this.enumPipe.transform(t)}})

  public get robotId (){
    return this.robotMaster?.robotCode
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
  public robotTypesWithDashboard = ['DELIVERY' , 'PATROL' ];
  public robotMaster : RobotMaster
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
    missions : {url : 'api/task/mission/droplist/v1' , descFld : 'name' , valFld: 'missionId' , fromRV : false }
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

  constructor(public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil , private router : Router  , private datePipe : DatePipe , public configSrv : ConfigService , public ngZone : NgZone) {     
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
      let profile : {robotId: string , robotType : string , robotSubtype:string, serviceList : { name : string , enabled : boolean}[]} = await this.httpSrv.fmsRequest('GET', 'baseControl/v1/profile' , undefined, false)
      this.robotMaster = { robotCode: profile.robotId, robotType: profile.robotType, robotSubType: profile.robotSubtype }

      profile.serviceList.forEach(s=> this.configSrv.disabledModule_SA[s.name] = !s.enabled) 
      // this.getRobotMaster(profile)
      // let lidarStatusResp = await this.httpSrv.fmsRequest('GET', this.mqMaster.lidarStatus.api, undefined, false)
      // if (lidarStatusResp?.SwitchOn) {
      //   this.uiSrv.showWarningDialog('Lidar Sensor Turned On.')
      // }
    } else {
      await this.getSite()
      // this.updateFloorPlansAlert_ARCS()
      if (!this.getSessionStorage("arcsDefaultBuilding")) {
        await this.getArcsDefaultBuilding()
      }
      this.arcsDefaultBuilding = JSON.parse(this.getSessionStorage("arcsDefaultBuilding"))
    }

    // if(this._USE_AZURE_PUBSUB){
    //   this.pubsubSrv.makeWebSocketConnection()   
    // }
    // await this.subscribeMQTTs(<any>this.mqGeneralConfig.backgroundSubscribeTypes)
    this.uiSrv.loadAsyncDone(ticket)
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
    if(this.util.arcsApp && type == 'floorplans'){
      await this.getSite()
    }
    if(this.util.arcsApp && type == 'floorplans' && !this.arcsDefaultSite && this.arcsDefaultBuilding){
      resp = resp.filter((fp : DropListFloorplan)=>fp.buildingCode == this.arcsDefaultBuilding)
    }else if(this.util.arcsApp && type == 'floorplans' && this.arcsDefaultSite){
      resp = resp.filter((fp : DropListFloorplan)=>fp.buildingCode != null)
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

  public async getSite(forceRefresh = false){ 
    if(this.arcsDefaultSite === undefined || forceRefresh){
      this.arcsDefaultSite = await this.httpSrv.get('api/site/v1')
      this.arcsDefaultSite  = this.arcsDefaultSite === undefined ? null : this.arcsDefaultSite 
    }
    return this.arcsDefaultSite
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
    } else{
      if(resp?.validationResults ){
        this.util.showErrors(resp.validationResults , errorMap, resp)
      }
      resp.msg = resp.msg                           ? resp.msg : this.uiSrv.translate('Save Failed')
      if(resp.exceptionDetail){
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

  public async deleteRecordsV2(endPoint, rows){    
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

  public async deleteRecords(endPoint, primaryKeys){    
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp 
    try{
      resp  = await this.httpSrv.delete(endPoint,{ids: primaryKeys})
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

  public async getRobotMaster() : Promise<RobotMaster>{
    if(!this.robotMaster?.robotCode){
      //let ret = (await this.httpSrv.get("api/robot/v1"))
      let ret : {robotId: string , robotType : string , robotSubtype:string} = ( await this.httpSrv.fmsRequest('GET', 'baseControl/v1/profile' , undefined, false))
      this.robotMaster = {robotCode : ret.robotId , robotType : ret.robotType , robotSubType : ret.robotSubtype}
    }
    this.withDashboard = this.robotTypesWithDashboard.includes(this.robotMaster?.robotType?.toUpperCase())
    return  this.robotMaster 
  }


  public async getFloorPlan(code : string = null, blockUI = true): Promise<JFloorPlan>{
    let ticket
    code = code ? code : Object.keys(this.dataStore.floorPlan).filter(k=>this.dataStore.floorPlan[k]?.data?.isDefault)[0]
    if(blockUI){
      ticket = this.uiSrv.loadAsyncBegin()
    }
    let cachedFp : JFloorPlan = this.dataStore.floorPlan[code]?.data
    if (code && cachedFp) {
      let noImgFp: JFloorPlan = await this.httpSrv.get('api/map/plan/v1/' + code + '?mapImage=false&floorPlanImage=false');
      if (noImgFp.modifiedDateTime == cachedFp.modifiedDateTime && noImgFp.mapList.every(m => cachedFp.mapList && cachedFp.mapList.filter(m2 => m2.mapCode == m.mapCode && m2.robotBase == m.robotBase)[0]?.modifiedDateTime == m.modifiedDateTime)) {
        if (blockUI) {
          this.uiSrv.loadAsyncDone(ticket) 
        }
        return this.dataStore.floorPlan[code].data
      }
    }
    let ret : JFloorPlan = await this.httpSrv.get(code ? ('api/map/plan/v1/' +  code): 'api/map/plan/default/v1');
    if(blockUI){
      this.uiSrv.loadAsyncDone(ticket)
    }
    code = ret.floorPlanCode
    this.dataStore.floorPlan[code] = { data : JSON.parse(JSON.stringify(ret)) , modifiedDateTime: ret.modifiedDateTime}
    return ret
  }

  public async getArcsDefaultBuilding(){
    let builidngDDL : DropListBuilding[] = <any>(await this.getDropList('buildings')).data
    if(builidngDDL.length > 0){
      var code = builidngDDL.filter(b=>b.defaultPerSite)[0]?.buildingCode
      code = code ? code : builidngDDL[0].buildingCode
      this.setSessionStorage('arcsDefaultBuilding',JSON.stringify(code))
    }
  }

  public async getArcs3DFloorPlanBlob(code : string) : Promise<Blob>{
    let ret = null
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

  public async getArcs3DFloorPlanSettings(code : string) : Promise<floorPlan3DSettings>{
    return await this.httpSrv.get("api/map/floorPlan3DSettings/v1/"+ code) 
  }

  public async getAssets(url: string): Promise<any> {
    try{      
      return await this.httpSrv.http.get(url).toPromise()
    }catch{
      return null
    }
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

