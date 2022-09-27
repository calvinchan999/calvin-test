import { Injectable } from '@angular/core';
import { DataStateChangeEvent } from '@progress/kendo-angular-grid';
import { RvHttpService } from './rv-http.service';
import { UiService } from './ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { toDataSourceRequestString, toODataString } from '@progress/kendo-data-query';
import { SignalRService } from './signal-r.service';
import { BehaviorSubject , Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { ticker } from 'pixi.js';
import { PixiCommon } from '../ui-components/drawing-board/drawing-board.component';
import { Router } from '@angular/router';
import { AzurePubsubService } from './azure-pubsub.service';

type dropListType =  'floorplans' | 'buildings' | 'sites' | 'maps' | 'actions' | 'types' | 'locations' | 'userGroups' | 'subTypes' | 'robots' | 'missions'

export type signalRType = 'activeMap' | 'occupancyGridMap' | 'navigationMove' | 'chargingResult' | 'chargingFeedback' | 'state' | 'battery' | 'pose' | 'speed'|
                    'obstacleDetection' | 'estop' | 'brake' | 'tilt' | 'departure' | 'arrival' | 'completion' | 'timeout' | 'exception' | 'followMePair' |
                    'followMeAoa' | 'digitalOutput' | 'wifi' | 'cellular' | 'ieq' | 'rfid' | 'cabinet' | 'rotaryHead' | 'nirCamera' | 'nirCameraDetection' |
                    'thermalCamera' | 'thermalCameraDetection' | 'webcam' | 'heartbeatServer' | 'heartbeatClient' | 'arcsPoses' | 'taskActive' | 'lidarStatus' |
                    'led' | 'fan' | 'pauseResume' | 'taskComplete' | 'taskDepart' | 'taskArrive' | 'destinationReached' | 'taskProgress' | 'moving' | 'lidar'| 'taskPopups'|
                    'arcsRobotStatusChange' | 'arcsTaskInfoChange' 

@Injectable({
  providedIn: 'root'
})
export class DataService {
  public arcsDefaultSite = null
  public arcsDefaultBuilding = null
  public codeRegex
  public codeRegexErrorMsg
  public get locationPrefixDelimiter(){
    return "%"
  }
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
    locations: { url: 'api/map/plan/point/droplist/v1', valFld: 'pointCode', descFld: 'pointCode' , fromRV : false },
    subTypes:{ url: 'robot/v1/robotSubTypeList', descFld: 'description', valFld: 'enumName', fromRV : true },
    types: { url: 'robot/v1/robotTypeList', descFld: 'description', valFld: 'enumName' , fromRV : true},
    floorplans: { url: 'api/map/plan/droplist/v1', descFld: 'name' , valFld:'floorPlanCode'  , fromRV : false },
    buildings: { url: 'api/building/droplist/v1', valFld : 'buildingCode', descFld: 'name'  , fromRV : false },
    sites: { url: 'api/site/v1/droplist',valFld: 'siteId', descFld: 'siteName'  , fromRV : false },
    maps: { url: 'api/map/droplist/v1' , valFld : 'mapCode', descFld: 'name'  , fromRV : false },
    actions: { url: this.util.arcsApp ? 'operation/v1' : 'action/v1',  descFld: 'name', valFld: 'alias' ,  fromRV : true },
    userGroups : { url: 'api/user/userGroup/dropList/v1',  descFld: 'name', valFld: 'userGroupCode' , fromRV : false },
    robots : { url: 'robot/v1',  descFld: 'name', valFld: 'robotCode' , fromRV : true , descShowCode : true },
    missions : {url : 'api/task/mission/droplist/v1' , descFld : 'name' , valFld: 'missionId' , fromRV : false , descShowCode : true },
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
  public signalRGeneralConfig = {
    backgroundSubscribeTypes : this.util.arcsApp? ['exception']: ['estop' , 'tilt' , 'obstacleDetection' , 'exception', 'taskActive' , 'taskComplete' , 'destinationReached', 'moving']
  }


  
  public signalRSubj = { //each signalR type must have a corresponding key, latest result received from signalR , start subscribing / unsubscribe using function 
    brakeActive : new BehaviorSubject<any>(null),
    tiltActive: new BehaviorSubject<any>(null),
    activeMap: new BehaviorSubject<any>(null),
    occupancyGridMap: new BehaviorSubject<any>(null),
    battery : new BehaviorSubject<any>(null),
    batteryRounded : new BehaviorSubject<any>(null),
    pose : new BehaviorSubject<any>(null),
    arcsPoses : new BehaviorSubject<any>(null),
    ieq :  new BehaviorSubject<any>(null),
    obstacleDetected: new BehaviorSubject<any>(null),
    estop : new BehaviorSubject<any>(null),
    cellularBars : new BehaviorSubject<any>(null),
    cellularNumerator : new BehaviorSubject<any>(null),
    cellularDenominator : new BehaviorSubject<any>(null),
    charging : new BehaviorSubject<any>(null),
    wifiList: new BehaviorSubject<any>(null),
    fan: new BehaviorSubject<any>(null),//pending : ask RV to provide
    led: new BehaviorSubject<any>(null), //pending : ask RV to provide
    cabinetAvail: new BehaviorSubject<any>(null),
    cabinetDoorStatus: new BehaviorSubject<any>(null),
    trayRackAvail: new BehaviorSubject<any>(null),
    followMePaired:new BehaviorSubject<any>(null),
    followMeAoaState:new BehaviorSubject<any>(null),
    status:new BehaviorSubject<any>('Idle'),
    state:new BehaviorSubject<any>(null),
    isFollowMeMode:new BehaviorSubject<any>(false),
    isFollowMeWithoutMap:new BehaviorSubject<any>(false),
    isAutoMode:new BehaviorSubject<any>(false),
    isMappingMode:new BehaviorSubject<any>(false),
    isManualMode:new BehaviorSubject<any>(false),
    taskActive:new BehaviorSubject<any>(null),
    taskActionIndex:new BehaviorSubject<any>(0),
    taskItemIndex:new BehaviorSubject<any>(0),
    taskDepart:new BehaviorSubject<any>(0),
    isPaused:new BehaviorSubject<any>(false),
    isMovingInTask:new BehaviorSubject<any>(false),
    navigationDisabled:new BehaviorSubject<any>(false),
    taskProgress:new BehaviorSubject<any>(null),
    destinationReached:new BehaviorSubject<any>(null),
    exception : new BehaviorSubject<any>(null),
    currentTaskId : new BehaviorSubject<any>(' - '),
    lidar : new BehaviorSubject<{mapName:string , pointList: {x:number , y : number}[] , robotId: string}>(null),
    speed: new BehaviorSubject<any>(' - '),
    lidarSwitchedOn : new BehaviorSubject<any>(null),
    taskPopupRequest: new BehaviorSubject<{guiId : string , invisible : boolean}>(null),
    arcsRobotStatusChange : new BehaviorSubject<{robotType : string , floorPlanCode : string}>(null),
    arcsTaskInfoChange : new BehaviorSubject<{robotType : string , floorPlanCode : string}>(null),
    // taskActionActiveAlias : new BehaviorSubject<any>(null)
  }

  //api pending : tilt , pose , obstacle detection , arcsPoses
  
  public signalRMaster = {
    trayRack : {topic : "rvautotech/fobo/trayRack" ,   mapping:{ trayRackAvail: (d)=> {return d['levelList'].map(lv=> lv['trayFull'] ? 'Occupied' : 'Available')}}},
    taskPopups:{ topic: "rvautotech/fobo/topModule/request", mapping: { taskPopupRequest: (d)=> d }},
    activeMap: { topic: "rvautotech/fobo/map/active", mapping: { activeMap: 'id' } },
    occupancyGridMap: { topic: "rvautotech/fobo/map/occupancyGrid", mapping: { occupancyGridMap: null } }, //NO need to call API to get latest value for this
    navigationMove: { topic: "rvautotech/fobo/navigation/move/result" },
    chargingResult: { topic: "rvautotech/fobo/docking/charging/result" }, 
    chargingFeedback: { topic: "rvautotech/fobo/docking/charging/feedback"},
    obstacleDetection: { topic: "rvautotech/fobo/obstacle/detection", mapping: { obstacleDetected: 'detected' } },
    estop: { topic: "rvautotech/fobo/estop", mapping: { estop: 'stopped' } , api:'baseControl/v1/estop' },
    brake: { topic: "rvautotech/fobo/brake", mapping: { brakeActive: (d) => d['switchedOn'] } , api:'baseControl/v1/brake' },
    tilt: { topic: "rvautotech/fobo/tilt", mapping: { tiltActive: 'detected' } },
    led:{topic: "rvautotech/fobo/led" , mapping :{led: (d)=> d['lightOn']} , api:'led/v1'},
    arrival: { topic: "rvautotech/fobo/arrival" },
    completion: { topic: "rvautotech/fobo/completion" },
    timeout: { topic: "rvautotech/fobo/timeout" },
    exception: { topic: "rvautotech/fobo/exception", mapping: { exception: (d)=>{ this.uiSrv.showNotificationBar(`FOBO Error : ${d['message']} \n (Activate debug console for details)}` ,'error') ; console.log(d) ; return d} }  },
    followMePair: { topic: "rvautotech/fobo/followme/pairing", mapping: { followMePaired: (d)=> d['pairingState'] == 'PAIRED' } , api: 'followMe/v1/pairing'},//pending: confirm with RV what would pairingState return , except 'unpaired'
    followMeAoa: { topic: "rvautotech/fobo/followme/aoa", mapping: { followMeAoaState: 'aoaState' } , api: 'followMe/v1/pairing/aoa' },
    digitalOutput: { topic: "rvautotech/fobo/digital/output" },
    fan : {topic: "rvautotech/fobo/fan" ,  mapping :{fan: (d)=> d['fanOn']}, api:'fan/v1' },
    ieq: { topic: "rvautotech/fobo/ieq" , mapping: { ieq : (d)=> {Object.keys(d['ieq']).forEach(k=>d['ieq'][k] = this.util.trimNum(d['ieq'][k], 0)); return d['ieq'] ;} } , api:'ieqSensor/v1/read' },
    rfid: { topic: "rvautotech/fobo/rfid" },
    rotaryHead: { topic: "rvautotech/fobo/rotaryHead" },
    nirCamera: { topic: "rvautotech/fobo/nirCamera" },
    nirCameraDetection: { topic: "rvautotech/fobo/nirCamera/detection" },
    thermalCamera: { topic: "rvautotech/fobo/thermalCamera" },
    thermalCameraDetection: { topic: "rvautotech/fobo/thermalCamera/detection" },
    webcam: { topic: "rvautotech/fobo/webcam" },
    heartbeatServer: { topic: "rvautotech/fobo/heartbeat/server" },
    heartbeatClient: { topic: "rvautotech/fobo/heartbeat/client" },
    lidarStatus: { topic: "rvautotech/fobo/lidar/status", mapping: { lidarSwitchedOn: (d) => d['SwitchOn']}, api: 'lidar/v1/status' },
    lidar:{topic : 'rvautotech/fobo/lidar' , mapping :{lidar:(d)=> <any>(d)}},
    speed: { topic: 'rvautotech/fobo/speed', mapping: { speed: (d) => !isNaN(Number(d['speed']))? (Number(d['speed']).toFixed(2) == '-0.00' ? '0.00' : Number(d['speed']).toFixed(2)) : ' - ' } , api:'baseControl/v1/speed' },
    moving:{topic:'rvautotech/fobo/baseController/move' , mapping:{navigationDisabled : (d)=>d['moving'] , 
                                                                   status:(d)=> {
                                                                     if(['Idle', 'Moving'].includes(this.signalRSubj.status.value)){
                                                                       return d['moving'] ? 'Moving' : 'Idle';
                                                                     }else{
                                                                      return  this.signalRSubj.status.value
                                                                     }
                                                                   }        
                                                                  },
                                                          api:"baseControl/v1/move",
            },
    taskActive:{topic:'rvautotech/fobo/execution',   mapping:{
      currentTaskId :  (d) => d['taskId'],
        taskActive: (d) => {
          let ret =  d['taskId']!= null ? d : d['moveTask'] 
          this.signalRSubj.taskProgress.next(0)
          if (this.uiSrv.isTablet && ret) {
            this.router.navigate(['taskProgress'])
          }
          return ret
        }
      } 
    },
    taskProgress : {topic: 'rvautotech/fobo/action/completion' ,
                    mapping : {taskItemIndex : (d)=>d['taskItemIndex'] , taskProgress : (d)=>{
                      let taskItemList = this.signalRSubj.taskActive.value?.['taskItemList']                     
                      if(taskItemList){
                        let ttlActionsCnt = taskItemList.map(itm => itm['actionList'].length).reduce((acc, inc) => inc + acc, 0)
                        let currCnt = taskItemList.filter(itm=>taskItemList.indexOf(itm) < d['taskItemIndex']).map(itm => itm['actionList'].length).reduce((acc, inc) => inc + acc, 0) + d['actionIndex']
                        this.signalRSubj.taskActionIndex.next( d['actionIndex'])
                        return this.util.trimNum(currCnt/ttlActionsCnt * 100 , 2)
                      }else{
                        return 0
                      }           
                    }}
                   },
   taskComplete:{topic:'rvautotech/fobo/completion', 
                   mapping:{ currentTaskId : ()=> ' - ' ,
                             taskActive : (d)=>{         
                                               this.signalRSubj.taskProgress.next(0)
                                               this.signalRSubj.taskItemIndex.next(0)    
                                               this.signalRSubj.taskActionIndex.next(0)                                     
                                               let msg = d['exception']?.['message']? 
                                                            this.uiSrv.translate('Task terminated with error : ') +  `${d['exception']['message']}` :  
                                                           (d['cancelled']? 'Task Cancelled' : (d['completed']? 'Task Completed' : 'Task ended with unknown status'))
                                               this.uiSrv.showNotificationBar(msg , d['exception']?.['message']? 'error': (d['completed']? 'success' : undefined)); 
                                               if (this.uiSrv.isTablet) {                                        
                                                 this.router.navigate(['login'])
                                               }
                                               return null;
                                              }
                           }
                  },
    pauseResume:{topic:'rvautotech/fobo/baseController/pauseResume' , mapping:{isPaused:(d)=>d['pauseResumeState'] == 'PAUSE'} , api:'baseControl/v1/pauseResume'},
    destinationReached:{topic:'rvautotech/fobo/navigation/move/result',
                        mapping: { destinationReached:(d)=>{ let ok = d['goalStatus']?.['status'] == 'SUCCEEDED'
                                                             this.uiSrv.showNotificationBar(ok? 'Destination Reached' : 'Navigation Failed' , ok? 'success': 'error');
                                                             return d['goalStatus']?.['status'] 
                                                           }
                                 }
                       },
    taskArrive: {topic:'rvautotech/fobo/arrival', mapping:{isMovingInTask:()=> false ,  taskItemIndex : (d)=>d['taskItemIndex']}},
    taskDepart: {topic:'rvautotech/fobo/departure', mapping:{
                                                               isMovingInTask : (d)=> d['taskItemIndex'] > 0,
                                                               taskItemIndex : (d)=>{
                                                                if(d['taskItemIndex']){
                                                                  return Math.min(this.signalRSubj.taskActive.value?.['taskItemList']?.length - 1 ,  d['taskItemIndex'])
                                                                }else{
                                                                  return this.signalRSubj.taskItemIndex.value
                                                                }                                                                
                                                               }
                                                              //  taskActionActiveAlias: (d)=>this.signalRSubj.taskActive.value?.['taskItemList']?.[d['taskItemIndex']]?.['actionList']?.[0]?.['alias']
                                                              }
                  },
    state: { topic: "rvautotech/fobo/state", 
             mapping:{  state : (d)=>{
                          if(d['manual']){
                            return "Manual"
                          }else{
                            let stateMap = {UNDEFINED : ' - ' ,  NAVIGATION : 'Navigation', FOLLOW_ME : 'Follow Me', MAPPING : 'Map Scan', PATH_FOLLOWING : 'Path Follow'} ; 
                            return stateMap[d['state']]
                          }                        
                        },
                        isFollowMeMode:(d)=>{return d['state'] == 'FOLLOW_ME'},
                        isFollowMeWithoutMap:(d)=>{return d['followMeStandalone']},
                        isAutoMode:(d)=>{return d['state'] == 'NAVIGATION'},
                        isMappingMode:(d)=>{return d['state'] == 'MAPPING'},
                        isManualMode:(d)=>{return d['manual'] == true},
                      },
             api:'mode/v1' 
            }, 
    wifi: { topic: "rvautotech/fobo/wifi", 
            mapping: { wifiList: (wifis)=>{return wifis.filter(w=>w['preSharedKey'] == true)} 
                      } ,
             api:'wifi/v1'
          },
    battery: { topic: "rvautotech/fobo/battery",
               mapping: { battery: 'percentage' ,
                          batteryRounded: (d)=>{ return (d['percentage'] * 100).toFixed(0)} , 
                          charging: (d) => { return d['powerSupplyStatus'] == 'CHARGING' || d['powerSupplyStatus'] == 'FULL' } ,
                          status : (d) => {return d['powerSupplyStatus'] == 'CHARGING' ? 'Charging' : 
                                                    (this.signalRSubj.taskActive.value ? 'Working' : 
                                                      this.signalRSubj.navigationDisabled.value? 'Moving' : 
                                                        (d['powerSupplyStatus'] == 'FULL' ? 'Fully Charged' : 'Idle'))
                                          } //TBD : Also check charging when update status on executingTask valueChange  
                        } ,
               api: 'battery/v1/state'
              },
    cellular: { topic: "rvautotech/fobo/cellular", 
                mapping: { cellularBars: 'signal' , 
                           cellularNumerator:(d)=> {return Math.ceil(d['signal'] * 5/100) },//{return d['bars']?.split("/")[0]} , 
                           cellularDenominator:(d)=> "5"//{return '/' + d['bars']?.split("/")[1]} 
                         },
                api:'cellular/v1/signal'
              },
    cabinet: { topic: "rvautotech/fobo/cabinet" , 
               mapping:{ cabinetAvail: (d)=> {return d['doorList'].map(door=> door['trayFull'] ? 'Occupied' : 'Available')}, 
                         cabinetDoorStatus:  (d)=> { return d['doorList'].map(door=> door['status']) }
                       },
               api:'cabinet/v1'
             }, 
    pose: { topic: "rvautotech/fobo/pose", 
            mapping: { pose: (p) => { return {
                       robotId:p.robotId,
                       x:p.x , y:p.y , angle:p.angle , 
                       mapName:p.mapName ,
                       timeStamp :  new Date().getTime() , 
                       interval : (this.signalRSubj.pose.value?  new Date().getTime() - this.signalRSubj.pose.value?.timeStamp : 0)}}
                      }
          },
    arcsPoses: { topic: "rvautotech/fobo/pose", //how to get robot type && status (Proccess / Charging / Idle / Offline) ??
                 mapping: { arcsPoses: (p) => {
                              let poseObj = this.signalRSubj.arcsPoses.value ? this.signalRSubj.arcsPoses.value : {}
                              Object.keys(poseObj).filter(k=>k!=p.mapName && Object.keys(poseObj[k]).includes(p.robotId)).forEach(k=>delete poseObj[k][p.robotId])
                              poseObj[p.mapName] = poseObj[p.mapName]? poseObj[p.mapName] : {}
                              let oldTimeStamp = poseObj[p.mapName]?.[p.robotId]?.timeStamp
                              poseObj[p.mapName][p.robotId] = {
                                x: p.x, y: p.y, angle: p.angle,
                                mapName: p.mapName,
                                timeStamp: new Date().getTime(),
                                interval: (oldTimeStamp? new Date().getTime() - oldTimeStamp : 0)
                              }
                            return poseObj
                          }
                  }
               },
    arcsRobotStatusChange :{ topic : 'rvautotech/fobo/ARCS/robot/info' ,mapping: { arcsRobotStatusChange : null}},
    arcsTaskInfoChange :{ topic : 'rvautotech/fobo/ARCS/task/info' ,mapping: { arcsTaskInfoChange : null}},
  }

  get _USE_AZURE_PUBSUB(){
    return this.util.arcsApp && !this.util.config.USE_SIGNALR
  }


  constructor(public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil , public signalRSrv : SignalRService, private router : Router , public pubsubSrv : AzurePubsubService) {     
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

  async init(){
    if(localStorage.getItem("lang")){
      this.uiSrv.changeLang(localStorage.getItem("lang"))
    }
    // this.codeRegex = this.util.config.
    if(!this.util.getCurrentUser()){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()

    if (this.util.standaloneApp) {
      this.getRobotInfo()
      let lidarStatusResp = await this.httpSrv.rvRequest('GET', this.signalRMaster.lidarStatus.api, undefined, false)
      if (lidarStatusResp?.SwitchOn) {
        this.uiSrv.showWarningDialog('Lidar Sensor Turned On.')
      }
    } else {
      if (!sessionStorage.getItem("arcsDefaultBuilding")) {
        await this.getArcsDefaultBuilding()
      }
      this.arcsDefaultBuilding = JSON.parse(sessionStorage.getItem("arcsDefaultBuilding"))
    }

    if(this._USE_AZURE_PUBSUB){
      this.pubsubSrv.makeWebSocketConnection()
      await this.subscribeSignalRs(<any>this.signalRGeneralConfig.backgroundSubscribeTypes)
    }else{
      await this.subscribeSignalRs(<any>this.signalRGeneralConfig.backgroundSubscribeTypes)
      this.signalRSrv.onConnected.subscribe(()=>{
        Object.keys(this.signalRSubj).forEach(k=>{
          let cnt = this.signalRMaster[k]?.['subscribedCount']
          if(cnt && typeof cnt === 'object' ){
            Object.keys(this.signalRMaster[k]['subscribedCount']).forEach(k2 => this.subscribeSignalR(<any>k, k2, true))    
          }else if(cnt){
            this.subscribeSignalR( <any>k , undefined , true)
          }
        })
      })
    }

    this.uiSrv.loadAsyncDone(ticket)
   }

  // v =========================== SIGNALR =========================== v
  
  signalRTopic(type: signalRType) {
    return this.signalRMaster[type].topic
  }

  private setSubscribedCount(type , count , key = ''){
    if(key == '' || this._USE_AZURE_PUBSUB){
      this.signalRMaster[type]['subscribedCount'] = count
    }else{
      this.signalRMaster[type]['subscribedCount'] =  this.signalRMaster[type]['subscribedCount'] ?  this.signalRMaster[type]['subscribedCount'] : {}
      this.signalRMaster[type]['subscribedCount'][key] = count
    }
  }

  private getSubscribedCount(type , key = ''){
    let value = (key == '' || this._USE_AZURE_PUBSUB) ? this.signalRMaster[type]['subscribedCount'] : this.signalRMaster[type]?.['subscribedCount']?.[key]
    return !value ? 0 : value
  }

  public async subscribeSignalRs(types : signalRType[] , paramString = '' ){
    let ret = {}
    await Promise.all(types.map(async(t)=> ret[t] = await this.subscribeSignalR(t , paramString)))
    return ret
  }

  public unsubscribeSignalRs(types : signalRType[] , forced = false , paramString = ''){
    types.forEach(t=> this.unsubscribeSignalR(t , forced , paramString))
  }

  public unsubscribeAllSignalR(){
    this.unsubscribeSignalRs(<any>Object.keys(this.signalRMaster).filter(t=>!this.signalRMaster[t]['subscribingCount']) , true)
  }

  public async unsubscribeSignalR(type: signalRType , forced = false , paramString = '') {
    //Commented 20220422 - - - Aviod duplicate subscription

    this.setSubscribedCount(type, (forced ? 0 : Math.max(0, this.getSubscribedCount(type, paramString) - 1)), paramString)
    if( this.getSubscribedCount(type , paramString) == 0 && !this.signalRGeneralConfig.backgroundSubscribeTypes.includes(type) ){
      let mapping = this.signalRMaster[type]['mapping']
      Object.keys(mapping).forEach(k => this.signalRSubj[k].next(null))
      let topicSfx =  paramString == '' ? '' : '/' + paramString 
      if(this._USE_AZURE_PUBSUB){
        this.pubsubSrv.unsubscribeTopic(this.signalRMaster[type].topic )
      }else{
        this.signalRSrv.unsubscribeTopic(this.signalRMaster[type].topic + topicSfx)
      }
    }
  }
  
  public async refreshTaskStatus(){
    let resp = await this.httpSrv.rvRequest('GET' ,'task/v1/status')
    this.updateTaskStatus(JSON.parse(resp.body))
  }

  public async subscribeSignalR(type: signalRType, paramString = '' , getLatestFromApi = false ) {//paramString : get concated topic (ARCS implementing query param in signalR topic)
    if(!this.util.getCurrentUser()){
      return
    }
    let mapping = this.signalRMaster[type]['mapping']
    let subscribedCount = this.getSubscribedCount(type, paramString) 
    let topicSfx = paramString == '' ? '' : '/' + paramString 
    let newSubscription =  !(this._USE_AZURE_PUBSUB ? this.pubsubSrv.getCreatedTopics() : this.signalRSrv.subscribedTopics).includes(this.signalRMaster[type].topic + topicSfx)
    let ret = this._USE_AZURE_PUBSUB ?(await this.pubsubSrv.subscribeTopic(this.signalRMaster[type].topic )): (await this.signalRSrv.subscribeTopic(this.signalRMaster[type].topic + topicSfx , subscribedCount == 0)) 
    let $unsubscribed = this.signalRSrv.getUnsubscribedSubject(this.signalRMaster[type].topic + topicSfx)
    if (subscribedCount == 0 || getLatestFromApi ) {           
      if (mapping != undefined && mapping != null) {
        if (this.util.standaloneApp && this.signalRMaster[type]['api']) {
          if(this.getSubscribedCount(type, paramString) == 0){    
              let resp = await this.httpSrv.rvRequest('GET' , this.signalRMaster[type]['api'])      
              if(resp && resp.status == 200){
                this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body) , paramString)
              }
          }
        } else if(this.util.arcsApp && ['ieq'].includes(type)){       
            if(this.getSubscribedCount(type, paramString) == 0){          
              let resp = await this.httpSrv.rvRequest('GET' , this.signalRMaster[type]['api'] + '/' + paramString)
              if(resp && resp.status == 200){
                this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body), paramString)
              }
            }
        }
      }

      if (newSubscription) {
        //20220804 added take until
        ret.pipe(takeUntil($unsubscribed ? $unsubscribed  : new Subject<any>())).subscribe(
          (data) => this.updateSignalRBehaviorSubject(type, JSON.parse(data), paramString)
        )
      }
    }
    this.setSubscribedCount(type, this.getSubscribedCount(type, paramString) + 1, paramString)
    return ret
  }

  updateSignalRBehaviorSubject(type , data , param = '') {
    let mapping = this.signalRMaster[type]['mapping']
    if (this.util.config.DEBUG_SIGNALR && (!this.util.config.DEBUG_SIGNALR_TYPE || this.util.config.DEBUG_SIGNALR_TYPE?.length == 0 || type == this.util.config.DEBUG_SIGNALR_TYPE)) {
      console.log(`[${new Date().toDateString()}] SignalR Received [${type.toUpperCase()}] : ${JSON.stringify(data)}`)
    }
    // data = JSON.parse(data)
    if (this.util.arcsApp && this._USE_AZURE_PUBSUB && param != '') {
      if ((type == 'arcsPoses' && data['mapName'] != param) || (type != 'arcsPoses' && data['robotId'] != param)) {
        return
      }
    }

    Object.keys(mapping).forEach(k => {
      if (mapping[k] == null) {
        this.signalRSubj[k].next(data)
      } else if (this.util.isString(mapping[k])) {
        this.signalRSubj[k].next(data?.[mapping[k]])
      } else if (this.util.isFunction(mapping[k])) {
        this.signalRSubj[k].next(mapping[k](data))
      }
    })
  }

  updateTaskStatus(taskWrapped){
    // taskWrapped = JSON.parse(`{"taskExecutionDTO":{"robotId":"J6-RV-FR-001","executionDateTime":"2022-04-22T18:35:18.574345","moveTask":{"taskId":"170","taskItemList":[{"actionListTimeout":0,"movement":{"waypointName":"map_20220406%123","navigationMode":null,"orientationIgnored":true,"fineTuneIgnored":true},"actionList":[{"alias":"NIL","properties":{}}]},{"actionListTimeout":0,"movement":{"waypointName":"map_20220406%789","navigationMode":"AUTONOMY","orientationIgnored":true,"fineTuneIgnored":true},"actionList":[{"alias":"NIL","properties":{}}]}]}},"taskDepartureDTO":{"robotId":"J6-RV-FR-001","taskId":"170","taskItemIndex":1,"movement":{"waypointName":"map_20220406%123","navigationMode":null,"orientationIgnored":true,"fineTuneIgnored":true}},"taskArrivalDTO":null,"moving":true,"actionExecutionDTO":null,"actionCompletionDTO":null,"actionExecuting":false,"taskCompletionDTO":null,"taskTimeoutDTO":null}`)
    // console.log(taskWrapped)
    if(taskWrapped.taskExecutionDTO && !taskWrapped.taskCompletionDTO?.completed && !taskWrapped.taskCompletionDTO?.cancelled){
      let tmpMap = {
        taskActive:taskWrapped.taskExecutionDTO,
        taskArrive:taskWrapped.taskArrivalDTO,        
        taskProgress:taskWrapped.actionCompletionDTO,
        taskDepart: taskWrapped.taskDepartureDTO,
      }
      Object.keys(tmpMap).forEach(k => {
        if ( tmpMap[k] && this.getSubscribedCount(k) > 0) {
          this.updateSignalRBehaviorSubject(k,tmpMap[k])
        }
      })
    }else if(taskWrapped.taskCompletionDTO && this.signalRSubj.taskActive.value && (!taskWrapped.taskCompletionDTO?.completed || !taskWrapped.taskCompletionDTO?.cancelled)){
      this.updateSignalRBehaviorSubject('taskComplete',taskWrapped.taskCompletionDTO)
    }
  }


  // ^ =========================== SIGNALR =========================== ^ 


  public getDropListOptions(type: dropListType, dropListData: any[], filterBy: object = null) {
    let apiMap = this.dropListApiMap
    return dropListData.filter(r => filterBy == null || Object.keys(filterBy).every(k => r[k] == filterBy[k])).map(d => {
      let value =  d[apiMap[type]['valFld'] ? apiMap[type]['valFld'] : 'id']
      return {
        value: value,
        text:  (apiMap[type]['descShowCode'] ? `[${value}] ` : '') +  (d[apiMap[type]['descFld']? apiMap[type]['descFld'] : 'displayName'] )
      }
    })
  }

  public getDropListDesc(list : object[] , value ,  type : dropListType = null ){
    if(type){
      return list.filter(itm=>itm[this.dropListApiMap[type]?.['valFld'] ? this.dropListApiMap[type]?.['valFld'] : 'id'] == value)[0]?.[this.dropListApiMap[type].descFld]
    }else{
      return list.filter(itm=>itm['value'] == value)[0]?.['text']
    }
  }

  public async getDropList(type : dropListType) : Promise<{data:object[] , options:object[]}>{
    let ret= {data: null ,options: null}
    let apiMap = this.dropListApiMap
    var resp = apiMap[type].fromRV? await this.httpSrv.rvRequest("GET", apiMap[type]['url'] , undefined, false) :  await this.httpSrv.get(apiMap[type]['url'])
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
    if(!this.arcsDefaultSite || forceRefresh){
      this.arcsDefaultSite = await this.httpSrv.get('api/site/v1')
    }
    return this.arcsDefaultSite
  }

  public async getRobotList() : Promise<DropListRobot[]>{
    if(!this.dataStore.arcsRobotList || this.dataStore.arcsRobotList?.length == 0){
      this.dataStore.arcsRobotList = (await this.getDropList('robots')).data
    }
    return this.dataStore.arcsRobotList
  }

  public async getPointTypeList() : Promise<DropListPointType[]>{
    if(this.dataStore.pointTypeList?.length > 0){
      let updatedList :DropListPointType[] = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=false`);
      if(updatedList.some((newItm: DropListPointType ) => {
        let match : DropListPointType = this.dataStore.pointTypeList.filter((old : DropListPointType)=> old.code == newItm.code)[0];
        return !match || match.modifiedDateTime != newItm.modifiedDateTime
      })){
        this.dataStore.pointTypeList = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=true`)
      }
    }else{
      this.dataStore.pointTypeList = await this.httpSrv.get(`api/customization/pointType/droplist/v1?image=true`)
    }
    return this.dataStore.pointTypeList
  }

  
  public async saveRecord(endpoint : string, payload , errorMap = null , isCreate = true) : Promise<SaveRecordResp>{
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp
    try{
      if(isCreate){
        resp = await this.httpSrv.post(endpoint, payload,undefined,undefined,undefined,true)
      }else{
        resp = await this.httpSrv.put(endpoint, payload,undefined,undefined,undefined,true)
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
      this.uiSrv.showNotificationBar("Save Successful" , 'success')
    } else{
      if(resp?.validationResults ){
        this.util.showErrors(resp.validationResults , errorMap, resp)
      }
      resp.msg = resp.msg ? resp.msg : this.uiSrv.translate('Save Failed')
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

  public async getRobotInfo() : Promise<RobotMaster>{
    if(!this.robotMaster?.robotCode){
      let ret = (await this.httpSrv.get("api/robot/v1"))
      this.robotMaster = JSON.parse(JSON.stringify(ret))
    }
    this.withDashboard = this.robotTypesWithDashboard.includes(this.robotMaster?.robotType?.toUpperCase())
    return  this.robotMaster 
  }


  public async getFloorPlanV2(code : string = null, blockUI = true): Promise<JFloorPlan>{
    let ticket
    code = code ? code : Object.keys(this.dataStore.floorPlan).filter(k=>this.dataStore.floorPlan[k]?.data?.isDefault)[0]
    if(blockUI){
      ticket = this.uiSrv.loadAsyncBegin()
    }
    if(code && this.dataStore.floorPlan[code] ){
      let noImgFp = await this.httpSrv.get('api/map/plan/v1/' +  code  + '?mapImage=false&floorPlanImage=false');
      if(noImgFp.modifiedDateTime == this.dataStore.floorPlan[code].modifiedDateTime){
        if(blockUI){
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
      sessionStorage.setItem('arcsDefaultBuilding',JSON.stringify(code))
    }
  }

  // * * * v RV STANDALONE ACTIONS v * * * 
  public async openRobotCabinet(id){
    this.httpSrv.rvRequest("POST" , "cabinet/v1/open/" + id , undefined , true , this.uiSrv.translate(`Open Cabiniet [${id}]`))
  }

  public async closeRobotCabinet(id){
    this.httpSrv.rvRequest("POST" , "cabinet/v1/close/" + id, undefined ,  true , this.uiSrv.translate(`Close Cabiniet [${id}]`))
  }

  public async connectWifi(ssid , pw){
    this.httpSrv.rvRequest('POST', 'wifi/v1/connection', {ssid :ssid , password : pw},  true , this.uiSrv.translate('Connected to [SSID] Successfully').replace('[SSID]' , ('[' + ssid + ']')))
  }
  public async stopManualMode(){
    return this.httpSrv.rvRequest('PUT', 'baseControl/v1/manual/OFF'  ,  null , true, 'Manual OFF')  
  }
  // * * * ^ RV STANDALONE ACTIONS ^ * * * 
}



export class robotPose{
  x
  y
  angle
  mapName
}

export class Site{
  locationId?
  locationCode?
  defaultZoom?
  defaultX?
  defaultY?
  imgSrc?
}

export class FloorPlanDataset {
  floorPlan?: {
    planId?
    planCode?
    planName?
    siteId?
    buildingId?
    mapIds?
    originalWidth?
    originalHeight?
    posX?
    posY?
    scale?
    rotation?
    originX?
    originY?
    zIndex?
    defaultZoom?
    defaultX?
    defaultY?
    fileId?
    documentType?
    documentName?
    displayName?
    imgSrc?
    remarks?
    updatedDate?
    shapes?:ShapeJData[]
  }
  maps: MapJData []
  shapes?: ShapeJData []  //Only in Superset
}

export class MapJData{
  mapId?
  mapCode?
  mapName?
  parentId?
  originalWidth?
  originalHeight?
  posX?
  posY?
  scale?
  rotation?
  originX?
  originY?
  zIndex?
  imgDisplayName?
  imgSrc?
  defaultZoom?
  defaultX?
  defaultY?
  createdDate?
  createdBy?
  updatedDate?
  updatedBy?
  shapes?:ShapeJData[]
  locationsLinks?
}


export class ShapeJData {
  shapeId?
  shapeCode?
  mapId?
  shapeType? : 'arrow' |'arrow_bi' | 'arrow_bi_curved' | 'arrow_curved' | 'arrow_bi_curved' | 'arrow_curved' | 'location' | 'waypoint' | 'polygon'
  posX?
  posY?
  rotation?
  imgSrc?
  fillColor?
  lineThickness?
  lineColor?
  opacity?
  zIndex?
  vertices?
  bezierPoints?
  fromId?
  toId?
  fromCode?
  toCode?
  brushId?
  lineType?
  originX?
  originY?
  createdDate?
  createdBy?
  updatedDate?
  updatedBy?

  pathVelocity?
  pathDirection?
}


export class MapDataset{
  maps: MapJData[]
  locations : [
    {
      mapLocationId?
      mapId?
      hapeId?
      linkMapId?
      linkShapeId?
      actionId?
      createdDate?
      createdBy?
      updatedDate?
      updatedBy?
    }
  ]
  shapes : ShapeJData[]
}

export class DataStorage {
  id : string
  data 
  updatedDate: string 
}

export class SaveRecordResp {
    result
    validationResults:[]
}

export class RobotMaster{
  robotCode
  name
  robotType
  robotSubType
}

export class DropListDataset {
  actions?: DropListAction[]
  buildings?: DropListBuilding[]
  floorplans? : DropListFloorplan[]
  maps?: DropListMap[]
  locations?:DropListLocation[]
  sites?: DropListSite[]
  types?: DropListType[]
  subTypes?:DropListSubType[]
  robots? : DropListRobot[]
}

export class DropListLocation {
  floorPlanCode
  pointCode
  shapeCode
  shapeType
}

export class DropListAction {
  alias: string
  name: string
  allowedRobotTypes: string[]
  parameterList: ActionParameter[]
}

export class ActionParameter {
  name: string
  parameterCode: string
  defaultValue: string
  parameterType: string
  regex?: string
  min: number
  max: number
  enumList:
    {
      code: string,
      label: string,
      value: string
    }[]
}


export class DropListBuilding{
  buildingCode
  name
  defaultPerSite
  polygonCoordinates
  labelX
  labelY
}

export class DropListSite{
  
}

export class DropListUserGroup{
  userGroupCode
  name
}


export class DropListMap{
  mapCode
  robotBase
  floorPlanCode
  name
}

export class DropListFloorplan{
  floorPlanCode
  name
  buildingCode
  defaultPerBuilding?
}

export class DropListType{
  enumName
  description
  // typeId
  // robotCode
  // typeCode
  // typeName
  // subTypeName
}

export class DropListSubType{
  enumName
  description
  // typeId
  // robotCode
  // typeCode
  // typeName
  // subTypeName
}

export class DropListRobot{
  robotCode : string
  name : string
  robotBase : string
  robotType : string
  robotSubType : string
}

export class DropListPointType{
  code : string
  name: string
  base64Image: string
  modifiedDateTime: number
}




// =========================================================================================================

export class JTask {
  taskId?:string
  missionId?:string
  cronExpress? : string
  executingFlag? :string
  expiration? : number
  remark?: string
  taskItemList : {
      index? : string,
      actionListTimeout : number,
      movement : {
        floorPlanCode : string,
        pointCode: string,
        navigationMode : string,
        orientationIgnored : boolean,
        fineTuneIgnored : boolean,
      },
      actionList: { 
        alias: string,
        properties: { }
      }[]
    }[]
}

export class JFloorPlan {
  floorPlanCode : string
  name? : string
  viewZoom : number
  viewX : number
  viewY : number
  fileName? : string
  pointList: JPoint[]
  pathList: JPath[]
  mapList?:JMap[]
  defaultPerBuilding? : boolean
  base64Image: string
  modifiedDateTime?: Date
}

export class JPoint {
  floorPlanCode?: string
  mapCode?: string
  robotBase?: string
  pointCode: string
  positionX?: number
  positionY?: number
  angle?: number
  guiX: number
  guiY: number
  guiAngle: number
  userDefinedPointType : string
  groupMemberPointList? : JPoint []
  groupPointCode? : string
  groupProperties? : string
}

export class JChildPoint{
  pointCode: string
  guiX: number
  guiY: number
  guiAngle: number
}

export class JPath{
  floorPlanCode? : string
  mapCode? : string
  robotBase? : string
  sourcePointCode : string
  destinationPointCode: string
  direction : string
  maximumVelocity : number
  controlPointList : {x : number , y : number}[]
  length? : number 
}

export class JMap {
  floorPlanCode : string
  mapCode: string
  robotBase : string
  name: string
  originX : number 
  originY : number
  resolution : number
  imageWidth : number
  imageHeight : number
  transformedPositionX : number
  transformedPositionY : number
  transformedScale : number
  transformedAngle : number
  pointList : JPoint[]
  pathList : JPath[]
  base64Image: string
}

export class JBuilding {
  buildingCode: string
  name: string
  labelX: number
  labelY: number
  siteCode: string
  polygonCoordinates: {x : number , y : number}[]
  defaultPerSite: boolean
  floorPlanCodeList: string[]
  defaultFloorPlanCode: string
}

export class JSite {
  siteCode: string
  name: string
  fileName: string
  base64Image: string
  viewZoom: number
  viewX: number
  viewY: number
  remark: string
}

export class RobotTaskInfoARCS{
  robotType: string
  floorPlanCode: string
  executingTaskCount: number
  completedTaskCount: number
  waitingTaskCount: number
  robotCode: string
}

export class RobotStatusARCS {
  robotType: string
  robotCode: string
  floorPlanCode: string
  robotStatus: string
}

export class RobotDetailARCS{
  robotCode : string
  robotStatus: string
  modeState: string
  batteryPercentage: number
  speed : number
}


export const ARCS_STATUS_MAP = {
  IDLE : "Idle",
  CHARGING : "Charging",
  EXECUTING : "Working",
  UNKNOWN : "Offline",
  HOLD : "Reserved"
} 



