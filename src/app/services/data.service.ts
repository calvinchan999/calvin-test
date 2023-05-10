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
export type syncStatus = 'TRANSFERRED' | 'TRANSFERRING' | 'MALFUNCTION'
export type syncLog =  {dataSyncId? : string , dataSyncType? : string , objectType? : string , dataSyncStatus?: syncStatus , objectCode?: string , robotCode?: string , progress? : any , startDateTime? : Date , endDateTime : Date  }
export type dropListType =  'floorplans' | 'buildings' | 'sites' | 'maps' | 'actions' | 'types' | 'locations' | 'userGroups' | 'subTypes' | 'robots' | 'missions' | 'taskFailReason' | 'taskCancelReason'
export type localStorageKey = 'lang' | 'uitoggle' | 'lastLoadedFloorplanCode' | 'eventLog' | 'unreadNotificationCount' | 'unreadSyncMsgCount' | 'syncDoneLog' | 'dashboardMapType'
export type sessionStorageKey = 'arcsLocationTree' | 'dashboardFloorPlanCode'| 'isGuestMode' | 'userAccess' | 'arcsDefaultBuilding' | 'userId' | 'currentUser' 
export type eventLog = {datetime? : string , type? : string , message : string  , robotCode?: string }
export type signalRType = 'activeMap' | 'occupancyGridMap' | 'navigationMove' | 'chargingResult' | 'chargingFeedback' | 'state' | 'battery' | 'pose' | 'speed'| 'poseDeviation' |
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
  public unreadNotificationCount = new BehaviorSubject<number>(0)
  public unreadSyncMsgCount = new BehaviorSubject<number>(0)
  public arcsDefaultSite 
  public arcsDefaultBuilding = null
  public codeRegex
  public codeRegexErrorMsg
  public enumPipe = new EnumNamePipe()
  public objectTypeDropDownOptions = ObjectTypes.map(t=> {return {value : t , text : this.enumPipe.transform(t)}})
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
  public signalRGeneralConfig = {
    backgroundSubscribeTypes : this.util.arcsApp? ['exception' , 'estop' , 'tilt' , 'obstacleDetection' , 'arcsSyncLog' ]: ['estop' , 'tilt' , 'obstacleDetection' , 'exception', 'taskActive' , 'taskComplete' , 'destinationReached', 'moving']
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
    // taskActionIndex:new BehaviorSubject<any>(0),
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
    arcsRobotStatusChange : new BehaviorSubject<RobotStatusARCS[]>(null),
    arcsTaskInfoChange : new BehaviorSubject<RobotTaskInfoARCS[]>(null),
    arcsWarningChangedRobotCode : new BehaviorSubject<string>(null),
    nextTaskAction : new BehaviorSubject<string>(null),
    arcsSyncLog : new BehaviorSubject<syncLog[]>([]),
    arcsRobotDestination: new BehaviorSubject<string>(null),
    arcsLift: new BehaviorSubject<{ [key: string]: { floor: string, opened: boolean, robotCode: string } }>({}),
    arcsTurnstile: new BehaviorSubject<{ [key: string]: { opened: boolean } }>({}),
    poseDeviation : new BehaviorSubject<{poseValid : boolean , translationDeviation : boolean , angleDeviation : boolean}>(null),
    // taskActionActiveAlias : new BehaviorSubject<any>(null)
  }

  public arcsRobotDataMap : { [key: string] : ArcsRobotDetailBehaviorSubjMap} = {}
  //api pending : tilt , pose , obstacle detection , arcsPoses
  
  public signalRMaster : { [key: string] : {topic? : string , mapping ? : any , api ? :any , subscribedCount ? : any}}= {
    trayRack : { topic : "rvautotech/fobo/trayRack" ,   
                 mapping:{ trayRackAvail: (d : { robotId : string , levelList? : {trayFull? : boolean}[]})=> {
                             this.updateArcsRobotDataMap(d.robotId , 'totalContainersCount' , d.levelList.length)
                             this.updateArcsRobotDataMap(d.robotId , 'availContainersCount' , d.levelList.filter(l=>!l.trayFull).length)
                             return d.levelList.map(lv=> lv.trayFull ? 'Occupied' : 'Available')
                           }
                         }
               },
    taskPopups:{ topic: "rvautotech/fobo/topModule/request", mapping: { taskPopupRequest: (d)=> d }},
    activeMap: { topic: "rvautotech/fobo/map/active", mapping: { activeMap: 'id' } },
    occupancyGridMap: { topic: "rvautotech/fobo/map/occupancyGrid", mapping: { occupancyGridMap: null } }, //NO need to call API to get latest value for this
    navigationMove: { topic: "rvautotech/fobo/navigation/move/result" },
    chargingResult: { topic: "rvautotech/fobo/docking/charging/result" }, 
    chargingFeedback: { topic: "rvautotech/fobo/docking/charging/feedback"},
    led:{topic: "rvautotech/fobo/led" , mapping :{led: (d)=> d['lightOn']} , api:'led/v1'},
    arrival: { topic: "rvautotech/fobo/arrival" },
    completion: { topic: "rvautotech/fobo/completion" },
    timeout: { topic: "rvautotech/fobo/timeout" },
    followMePair: { topic: "rvautotech/fobo/followme/pairing", mapping: { followMePaired: (d)=> d['pairingState'] == 'PAIRED' } , api: 'followMe/v1/pairing'},//pending: confirm with RV what would pairingState return , except 'unpaired'
    followMeAoa: { topic: "rvautotech/fobo/followme/aoa", mapping: { followMeAoaState: 'aoaState' } , api: 'followMe/v1/pairing/aoa' },
    digitalOutput: { topic: "rvautotech/fobo/digital/output" },
    fan : {topic: "rvautotech/fobo/fan" ,  mapping :{fan: (d : {fanOn : any })=> d.fanOn}, api:'fan/v1' },
    ieq: { topic: "rvautotech/fobo/ieq" , mapping: { ieq : (d : {robotId : string , ieq : any})=> {                                                      
                                                      Object.keys(d.ieq).forEach(k=>d.ieq[k] = this.util.trimNum(d.ieq[k], 0)); 
                                                      this.updateArcsRobotDataMap(d.robotId , 'ieq' , d.ieq)
                                                      return d.ieq;
                                                     } 
                                                  } , 
                                          api:'ieqSensor/v1/read' 
    },
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
    lidar:{topic : 'rvautotech/fobo/lidar' , mapping: { lidar:(d)=> <any>(d)}},
    speed: { topic: 'rvautotech/fobo/speed', mapping: { speed: (d : {robotId: string , speed : number}) => {
                                                          let ret = !isNaN(Number(d.speed))? (Number(d.speed).toFixed(2) == '-0.00' ? '0.00' : Number(d.speed).toFixed(2)) : ' - ' 
                                                          this.updateArcsRobotDataMap(d.robotId , 'speed' , ret)
                                                          return ret
                                                        }
                                                      } ,
                                             api:'baseControl/v1/speed' 
    },
    brake: { topic: "rvautotech/fobo/brake", mapping: { brakeActive: (d : {switchedOn : any}) => d.switchedOn } , api:'baseControl/v1/brake' },
    estop: { topic: "rvautotech/fobo/estop", mapping: { estop: (d : { robotId : string , stopped : any})=>{
                                                                      if(d.stopped ){
                                                                        this.onLoggedNotificationReceived('Emergency Stop Switched On', d['robotId'] , 'warning' , true)
                                                                      }; 
                                                                      this.updateArcsRobotDataMap(d.robotId , 'estop' , d.stopped)
                                                                      return d.stopped
                                                                    },
                                                        arcsWarningChangedRobotCode:(d)=>{
                                                          return d['robotId']
                                                        }
                                                      } , api:'baseControl/v1/estop' 
           },
    tilt: { topic: "rvautotech/fobo/tilt", mapping: { tiltActive: (d : {robotId : any , detected : any})=> {  
                                                        if(d.detected ){
                                                           this.onLoggedNotificationReceived('Excess tilt detected', d.robotId , 'warning' , true)                                                                             
                                                        }; 
                                                        this.updateArcsRobotDataMap(d.robotId , 'tiltActive' , d.detected)
                                                        return d.detected;
                                                      },
                                                      arcsWarningChangedRobotCode:(d)=>{
                                                       return d['robotId']
                                                      }
                                                    } , api:'baseControl/v1/obstacle/detection' 
           },
    obstacleDetection: { topic: "rvautotech/fobo/obstacle/detection", 
                         mapping: { obstacleDetected: (d : {robotId : string , detected : any})=> {
                                      if(d.detected ){
                                        this.onLoggedNotificationReceived( 'Obstacle detected' , d['robotId'] , 'warning' , true)
                                      } 
                                      this.updateArcsRobotDataMap(d.robotId , 'obstacleDetected' , d.detected)
                                      return d.detected;
                                    },
                                    arcsWarningChangedRobotCode:(d : {robotId : string , detected : any})=>{
                                      return d.robotId
                                    }
                                  }
                        },
    exception: { topic: "rvautotech/fobo/exception", mapping: { exception: (d)=>{let msg = `FOBO Error : ${d['message']}`;
                                                                                 this.uiSrv.showNotificationBar(msg ,'error') ; 
                                                                                 this.addEventLogToLocalStorage(msg , d['robotId'] , 'error'); 
                                                                                 console.log(d) ;
                                                                                 return d} }  },
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
      isMovingInTask : ()=> true,
      taskItemIndex: ()=> 0 , 
      nextTaskAction : (d : {moveTask : JTask})=> d.moveTask.taskItemList.filter(t=>t.actionList?.length > 0)[0]?.actionList[0].alias ,     
      currentTaskId :  (d :  {taskId : string})=> d.taskId,
        taskActive: (d :  {taskId : string , moveTask : JTask}) => {
          let ret =  d.taskId!= null ? d : d.moveTask
          this.signalRSubj.taskProgress.next(0)
          if (this.uiSrv.isTablet && ret ) {
            this.router.navigate(['taskProgress'])
          }
          return ret
        }
      } 
    },
    taskProgress : {topic: 'rvautotech/fobo/action/completion' ,
                    mapping : {taskItemIndex : (d )=>d['taskItemIndex'] , taskProgress : (d)=>{
                      let taskItemList : TaskItem[] = (<JTask>this.signalRSubj.taskActive.value)?.taskItemList                  
                      if(taskItemList){
                        let taskItemIndex = d['taskItemIndex']
                        let actionIndex = d['actionIndex'] 
                        let ttlActionsCnt = taskItemList.map(itm => itm.actionList?.length ? itm.actionList?.length : 0).reduce((acc, inc) => inc + acc, 0)
                        let currCnt = taskItemList.filter(itm=>taskItemList.indexOf(itm) < taskItemIndex).map(itm => itm.actionList?.length ? itm.actionList?.length : 0).reduce((acc, inc) => inc + acc, 0) + actionIndex + 1
                        // this.signalRSubj.taskActionIndex.next( d['actionIndex'])
                        let lastActionOfTaskItem =  taskItemList[taskItemIndex].actionList?.length - 1 == actionIndex
                        let nextTaskItem = lastActionOfTaskItem? taskItemList[taskItemIndex + 1] : taskItemList[taskItemIndex]
                        let nextActionIdx = lastActionOfTaskItem ? 0 : actionIndex  + 1
                        this.signalRSubj.nextTaskAction.next(nextTaskItem?.actionList?.[nextActionIdx].alias)
                        return this.util.trimNum(currCnt/ttlActionsCnt * 100 , 2)
                      }else{
                        return 0
                      }      
                    }}
                   },
   taskComplete:{topic:'rvautotech/fobo/completion', 
                   mapping:{ currentTaskId : ()=> ' - ' ,
                             taskActive : (d)=>{         
                                               this.signalRSubj.isMovingInTask.next(false)
                                               this.signalRSubj.taskProgress.next(0)
                                               this.signalRSubj.taskItemIndex.next(0)    
                                               this.signalRSubj.nextTaskAction.next(null)
                                              //  this.signalRSubj.taskActionIndex.next(0)     
                                               let msgType = d['exception']?.['message']? 'error': (d['completed']? 'success' : undefined);                                
                                               let msg = d['exception']?.['message']? 
                                                            this.uiSrv.translate('Task terminated with error : ') +  `${d['exception']['message']}` :  
                                                           (d['cancelled']? 'Task Cancelled' : (d['completed']? 'Task Completed' : 'Task ended with unknown status'))
                                               if(!this.util.arcsApp){
                                                this.onLoggedNotificationReceived(msg , d['robotId']  , <any>msgType);
                                               }
                                               if (this.uiSrv.isTablet) {                                        
                                                 this.router.navigate(['login'])
                                               }
                                               return null;
                                              }
                           }
                  },
    pauseResume:{topic:'rvautotech/fobo/baseController/pauseResume' , mapping:{isPaused:(d)=>d['pauseResumeState'] == 'PAUSE'} , api:'baseControl/v1/pauseResume'},
    destinationReached:{topic:'rvautotech/fobo/navigation/move/result',
                        mapping: { destinationReached:(d)=>{ let ok = d['goalStatus']?.['status'] == 'SUCCEEDED';
                                                             let msg = ok? 'Destination Reached' : 'Navigation Failed'
                                                             if(!this.util.arcsApp){
                                                              this.onLoggedNotificationReceived(msg , d['robotId']  , (ok ? 'success' : 'error'));
                                                             }
                                                             return d['goalStatus']?.['status'] 
                                                           }
                                 }
                       },
    taskArrive: {topic:'rvautotech/fobo/arrival', mapping:{isMovingInTask:()=> false ,  taskItemIndex : (d)=> d['taskItemIndex']}},
    taskDepart: {topic:'rvautotech/fobo/departure', mapping:{
                                                               isMovingInTask : ()=> true, //COMMENTED　20230311 (d)=> d['taskItemIndex'] > 0
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
             mapping:{  
                        state : (d : {robotId : string , state : any ,  manual : any})=>{
                          const stateMap = {
                            UNDEFINED : ' - ' , 
                            NAVIGATION : 'Navigation', 
                            FOLLOW_ME : 'Follow Me', 
                            MAPPING : 'Map Scan', 
                            PATH_FOLLOWING : 'Path Follow'
                          } ; 
                          let ret = d.manual ? "Manual" : stateMap[d.state]
                          this.updateArcsRobotDataMap(d.robotId , 'state' , ret)
                          return ret                   
                        },
                        isFollowMeMode:(d : {state : any })=>{return d.state == 'FOLLOW_ME'},
                        isFollowMeWithoutMap:(d : {followMeStandalone : any})=>{return d.followMeStandalone},
                        isAutoMode:(d : { state : any})=>{return d.state == 'NAVIGATION'},
                        isMappingMode:(d : {state : any})=>{return d.state == 'MAPPING'},
                        isManualMode:(d : { manual : any})=>{return d.manual == true},
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

                          batteryRounded: (d : {robotId : string , percentage : number})=>{ 
                            let ret = (d.percentage * 100).toFixed(0)
                            this.updateArcsRobotDataMap(d.robotId , 'batteryRounded', ret)
                            return ret
                          } , 
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
               mapping:{ cabinetAvail: (d : { robotId : string , doorList? : {trayFull? : boolean, status? : string}[]})=> {
                          let ret = d.doorList.map(door=> door.trayFull ? 'Occupied' : 'Available')
                          this.updateArcsRobotDataMap(d.robotId , 'totalContainersCount' , d.doorList.length)
                          this.updateArcsRobotDataMap(d.robotId , 'availContainersCount' , d.doorList.filter(l=>!l.trayFull).length)
                          this.updateArcsRobotDataMap(d.robotId , 'containersAvail' , ret)
                          this.updateArcsRobotDataMap(d.robotId , 'containersDoorStatus' , d.doorList.map(door=> door.status))
                          console.log(ret)
                          return ret
                        },
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
                              // if(poseObj[p.mapName]?.[p.robotId]?.timeStamp == new Date().getTime()){
                              //   console.log('redundant')
                              // }
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
    arcsTaskInfoChange :{ topic : 'rvautotech/fobo/ARCS/task/info' ,mapping: { arcsTaskInfoChange : null} , api : 'task/v1/taskInfo'},
    arcsSyncLog : { topic: "rvautotech/fobo/ARCS/data/sync/log" , mapping : {arcsSyncLog : (d:syncLog)=>{
                        var ret :syncLog[] = this.signalRSubj.arcsSyncLog.value ? JSON.parse(JSON.stringify(this.signalRSubj.arcsSyncLog.value))  : [] 
                        if(ret.filter(l=>l.dataSyncId != d.dataSyncId || l.dataSyncStatus != d.dataSyncStatus).length > 0 ){
                          this.unreadSyncMsgCount.next(this.unreadSyncMsgCount.value + 1)
                          this.setLocalStorage('unreadSyncMsgCount', JSON.stringify( this.unreadSyncMsgCount.value))
                        }
                        ret = [JSON.parse(JSON.stringify(d))].concat(ret.filter(l=>l.dataSyncId != d.dataSyncId)) 
                        this.setLocalStorage('syncDoneLog', JSON.stringify(ret.filter(l=>l.dataSyncStatus != 'TRANSFERRING')))    
                        if(d.dataSyncStatus == "TRANSFERRED"){
                          this.updateFloorPlansAlert_ARCS()
                        }
                        return ret
                      }
                    },
                    api:'api/sync/log/processing/v1'
                  },
    arcsRobotDestination: {
      topic: "rvautotech/fobo/ARCS/task/bo",
      mapping: {
        arcsRobotDestination: (d: { robotCode: string, movementDTOList: TaskItem[], currentTaskItemIndex: number }) => {
          let ret = d.movementDTOList?.[d.currentTaskItemIndex]?.movement?.pointCode
          this.updateArcsRobotDataMap(d.robotCode, 'destination', ret)
          return ret
        }
      },
      api: 'task/v1/executing/bo'
    },
    arcsLift: {
      topic: "rvautotech/fobo/lift",
      mapping: {
        arcsLift: (d : { liftList? : any [] , liftId?: string, floor?: string , status?: string  , robotId? : string} )=>{
          let ret = this.signalRSubj.arcsLift.value ? JSON.parse(JSON.stringify(this.signalRSubj.arcsLift.value) ): {}
          let main = (l: { liftId: string, floor: string , status: string  , robotId : string}) => {
            ret[l.liftId] = {floor : l.floor , opened : l.status == 'OPENED' , robotCode : l.robotId} ; 
          }
          if(d.liftList){
            d.liftList.forEach(l=>main(l))
          }else{
            main(<any>d)
          }
          return ret
        }
      },
      api:'lift/v1/null' //TBR
    },
    arcsTurnstile: {
      topic: "rvautotech/fobo/turnstile",
      mapping: {
        arcsTurnstile: (d : { turnstileList ? : any [] , turnstileId?: string, status?: string })=>{
          let ret = this.signalRSubj.arcsTurnstile.value ? JSON.parse(JSON.stringify(this.signalRSubj.arcsTurnstile.value) ): {}
          let main = (d: { turnstileId: string, status: string }) => {         
            ret[d.turnstileId] = {opened : d.status != 'CLOSED'}
          }
          if(d.turnstileList){
            d.turnstileList.forEach(t=>main(t))
          }else{
            main(<any>d)
          }
          return ret
        }
      },
      api:'turnstile/v1/null'  //TBR
    },
    poseDeviation:{
      topic : "rvautotech/fobo/poseDeviation",
      mapping:{poseDeviation : null}
    }
  }

  eventLog = new BehaviorSubject<eventLog[]>([])

  get _USE_AZURE_PUBSUB(){
    return this.util.arcsApp && !this.util.config.USE_SIGNALR
  }

  constructor(public httpSrv : RvHttpService , private uiSrv : UiService, private util: GeneralUtil , public signalRSrv : SignalRService, private router : Router , public pubsubSrv : AzurePubsubService , private datePipe : DatePipe , public configSrv : ConfigService , public ngZone : NgZone) {     
    this.uiSrv.dataSrv = this
    this.unreadNotificationCount.pipe(skip(1)).subscribe(v=>{
      this.setLocalStorage('unreadNotificationCount' , v.toString())
    })
    this.loadDataFromLocalStorage()
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

  async updateFloorPlansAlert_ARCS(){
    let maps : DropListMap[] = (<any>(await this.getDropList('maps')).data)
    let alertMaps = maps.filter(m=> !m.floorPlanCode && maps.filter(m2=> m2.mapCode == m.mapCode && m2.floorPlanCode != m.floorPlanCode).length > 0)
    this.alertFloorPlans = []
    alertMaps.forEach(m=>{
      let floorPlanCode = maps.filter(m2=> m2.mapCode == m.mapCode && m2.floorPlanCode != m.floorPlanCode).map(m2=>m2.floorPlanCode)[0]
      let alertFloorPlanObj : {type : string ,floorPlanCode : string , mapCode : string , robotBases : string[] } = this.alertFloorPlans.filter(f=>f.floorPlanCode == floorPlanCode)[0]
      if (!alertFloorPlanObj) {
        alertFloorPlanObj = {type : 'SyncAlert' , floorPlanCode: floorPlanCode, mapCode: m.mapCode, robotBases: []  }
        this.alertFloorPlans.push(alertFloorPlanObj)
      }
      if(!alertFloorPlanObj.robotBases.includes(m.robotBase)){
        alertFloorPlanObj.robotBases.push(m.robotBase)
      }
    })
    this.setLocalStorage('unreadSyncMsgCount', this.unreadSyncMsgCount.value.toString())
  }

  loadDataFromLocalStorage(){
    let notiCount = this.getLocalStorage('unreadNotificationCount')
    let syncCount = this.getLocalStorage('unreadSyncMsgCount')
    let syncDoneLog = this.getLocalStorage('syncDoneLog')
    let log = this.getLocalStorage('eventLog')
    if(notiCount != null){
      this.unreadNotificationCount.next(Number(notiCount))
    }
    if(syncCount != null){
      this.unreadSyncMsgCount.next(Number(syncCount))
    }
    if(syncDoneLog != null){
      let oldLogs = this.signalRSubj.arcsSyncLog.value ? this.signalRSubj.arcsSyncLog.value : []
      let unreadLogs : syncLog[] = JSON.parse(syncDoneLog)
      this.signalRSubj.arcsSyncLog.next(unreadLogs.concat(oldLogs.filter(l=>l.dataSyncStatus!='TRANSFERRING')))
    }
    if(log!=null){
      this.eventLog.next(JSON.parse(log))
    }
  }

  loghouseKeep(data : [] , maxSizeMb = 3){
    if( new Blob([JSON.stringify(data)]).size > maxSizeMb * 1000){  // 1000000
      data = data.pop();
    }
    if( new Blob([JSON.stringify(data)]).size > maxSizeMb * 1000){ // pop recursively until size < threshold
      this.loghouseKeep(data)
    }
  }


  onLoggedNotificationReceived(msg : string , robotCode : string = undefined , msgType : 'success' | 'none' | 'warning' | 'info' | 'error' = 'info' , onlyShowNotiBarForArcs = false ){
    this.unreadNotificationCount.next( this.unreadNotificationCount.value + 1)
    if(!onlyShowNotiBarForArcs || this.util.arcsApp){
      this.uiSrv.showNotificationBar( robotCode? `[${robotCode}] ${msg}` : msg  , msgType)
    }
    this.addEventLogToLocalStorage(msg, robotCode, msgType) //TBR
    this.uiSrv.showBrowserPopupNotification(robotCode ? `[${robotCode}] ${msg}` : msg)
  }

  addEventLogToLocalStorage(message : string , robotCode : string  = undefined , type : 'success' | 'none' | 'warning' | 'info' | 'error' = 'info' ){
    //TBR : EVENT LOG TO BE RETRIEVED FROM DB INSTEAD OF LOCALSTORAGE
    let data =  this.getLocalStorage('eventLog') ? JSON.parse(this.getLocalStorage('eventLog')) : []
    let evtlog : eventLog = {message : message  , robotCode: robotCode, type : `${type.toUpperCase()} MESSAGE` , datetime : this.datePipe.transform(new Date() , 'dd/MM/yyyy hh:mm:ss aa')}
    data = [evtlog].concat(data)
    this.loghouseKeep(data)
    this.eventLog.next(data)
    this.setLocalStorage('eventLog', JSON.stringify(data))
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
      let lidarStatusResp = await this.httpSrv.fmsRequest('GET', this.signalRMaster.lidarStatus.api, undefined, false)
      if (lidarStatusResp?.SwitchOn) {
        this.uiSrv.showWarningDialog('Lidar Sensor Turned On.')
      }
    } else {
      await this.getSite()
      this.updateFloorPlansAlert_ARCS()
      if (!this.getSessionStorage("arcsDefaultBuilding")) {
        await this.getArcsDefaultBuilding()
      }
      this.arcsDefaultBuilding = JSON.parse(this.getSessionStorage("arcsDefaultBuilding"))
    }

    if(this._USE_AZURE_PUBSUB){
      this.pubsubSrv.makeWebSocketConnection()   
    }
    await this.subscribeSignalRs(<any>this.signalRGeneralConfig.backgroundSubscribeTypes)
    this.uiSrv.loadAsyncDone(ticket)
   }

  // v =========================== SIGNALR =========================== v
  
  signalRTopic(type: signalRType) {
    return this.signalRMaster[type].topic
  }

  private setSubscribedCount(type , count , key = ''){
    if(key == '' || this._USE_AZURE_PUBSUB){
      this.signalRMaster[type].subscribedCount = count
    }else{
      this.signalRMaster[type].subscribedCount =  this.signalRMaster[type].subscribedCount ?  this.signalRMaster[type].subscribedCount : {}
      this.signalRMaster[type].subscribedCount[key] = count
    }
  }

  private getSubscribedCount(type , key = ''){
    let value = (key == '' || this._USE_AZURE_PUBSUB) ? this.signalRMaster[type].subscribedCount : this.signalRMaster[type]?.subscribedCount?.[key]
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
    this.unsubscribeSignalRs(<any>Object.keys(this.signalRMaster).filter(t=>!this.signalRMaster[t].subscribedCount) , true)
  }

  public async unsubscribeSignalR(type: signalRType , forced = false , paramString = '') {
    //Commented 20220422 - - - Aviod duplicate subscription

    this.setSubscribedCount(type, (forced ? 0 : Math.max(0, this.getSubscribedCount(type, paramString) - 1)), paramString)
    if( this.getSubscribedCount(type , paramString) == 0 && !this.signalRGeneralConfig.backgroundSubscribeTypes.includes(type) ){
      let mapping = this.signalRMaster[type].mapping
      Object.keys(mapping).forEach(k => this.signalRSubj[k].next(null))
      let topicSfx =  paramString == '' ? '' : '/' + paramString 
      if(this._USE_AZURE_PUBSUB){
        this.pubsubSrv.unsubscribeTopic(this.signalRMaster[type].topic)
      }else{
        this.signalRSrv.unsubscribeTopic(this.signalRMaster[type].topic + topicSfx)
      }
    }
  }
  
  public async refreshTaskStatus(){
    let resp = await this.httpSrv.fmsRequest('GET' ,'task/v1/status')
    this.updateTaskStatus(JSON.parse(resp.body))
  }

  public async subscribeSignalR(type: signalRType, paramString = '' , getLatestFromApi = false ) {//paramString : get concated topic (ARCS implementing query param in signalR topic)
    if(!this.util.getCurrentUser()){
      return
    }
    const PUB_SUB_IGNORE_SFX_LIST = ['arcsPoses' , 'battery' , 'speed'];
    let mapping = this.signalRMaster[type].mapping
    let subscribedCount = this.getSubscribedCount(type, paramString) 
    let topicSfx = paramString == '' ? '' : '/' + paramString 
    let newSubscription =  !(this._USE_AZURE_PUBSUB ? this.pubsubSrv.getCreatedTopics() : this.signalRSrv.subscribedTopics).includes(this.signalRMaster[type].topic + topicSfx)
    let ret = this._USE_AZURE_PUBSUB ? (await this.pubsubSrv.subscribeTopic(this.signalRMaster[type].topic + (PUB_SUB_IGNORE_SFX_LIST.includes(type) ? '' : topicSfx))) : (await this.signalRSrv.subscribeTopic(this.signalRMaster[type].topic + topicSfx, subscribedCount == 0))
    let $unsubscribed = this.signalRSrv.getUnsubscribedSubject(this.signalRMaster[type].topic + topicSfx)
    if (subscribedCount == 0 || getLatestFromApi ) {           
      if (mapping != undefined && mapping != null) {
        if (this.util.standaloneApp && this.signalRMaster[type].api) {
          if(this.getSubscribedCount(type, paramString) == 0){    
              let resp = await this.httpSrv.fmsRequest('GET' , this.signalRMaster[type].api)      
              if(resp && resp.status == 200){
                this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body) , paramString)
              }
          }
        } else if(this.util.arcsApp){       
            if(this.getSubscribedCount(type, paramString) == 0){      
              const signalRTypesRequiredApiByRobot : signalRType[] = ['ieq' , 'arcsRobotDestination' ];
              const signalRTypesQueryParamMap : {[key: string] : string}  = {
                arcsTaskInfoChange : 'floorPlanCode'
              }
              if(signalRTypesRequiredApiByRobot.includes(type)){
                let resp = await this.httpSrv.fmsRequest('GET' , this.signalRMaster[type].api + '/' + paramString)
                if(resp && resp.status == 200 && resp.body?.length > 0){
                  this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body), paramString)
                }
              }else if(signalRTypesQueryParamMap[type]){
                let resp = await this.httpSrv.fmsRequest('GET' , this.signalRMaster[type].api + `?${signalRTypesQueryParamMap[type]}=` + paramString)
                if(resp && resp.status == 200 && resp.body?.length > 0){
                  this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body), paramString)
                }
              }else if( ['arcsSyncLog'].includes(type)){
                let ticket = this.uiSrv.loadAsyncBegin()
                let resp = await this.httpSrv.get(this.signalRMaster[type].api);
                this.signalRSubj.arcsSyncLog.next((this.getLocalStorage('syncDoneLog') ? JSON.parse(this.getLocalStorage('syncDoneLog')) : []).concat(resp))
                this.uiSrv.loadAsyncDone(ticket)
              } else if(['arcsLift' , 'arcsTurnstile'].includes(type)){
                let resp = await this.httpSrv.fmsRequest('GET' , this.signalRMaster[type].api)      
                if(resp && resp.status == 200){
                  this.updateSignalRBehaviorSubject(type, JSON.parse(resp.body) , paramString)
                }
              }
            } 
        } 
      }

      if (newSubscription) {
        //20220804 added take until
        ret.pipe(takeUntil($unsubscribed ? $unsubscribed  : new Subject<any>())).subscribe(
          (data) =>  this.updateSignalRBehaviorSubject(type, JSON.parse(data), paramString)
        )
      }
    }
    this.setSubscribedCount(type, this.getSubscribedCount(type, paramString) + 1, paramString)
    return ret
  }

  updateSignalRBehaviorSubject(type , data , param = '') {
    let mapping = this.signalRMaster[type].mapping
    if (this.util.config.DEBUG_SIGNALR && (!this.util.config.DEBUG_SIGNALR_TYPE || this.util.config.DEBUG_SIGNALR_TYPE?.length == 0 || type == this.util.config.DEBUG_SIGNALR_TYPE)) {
      console.log(`[${new Date().toDateString()}] SignalR Received [${type.toUpperCase()}] : ${JSON.stringify(data)}`)
    }
    // data = JSON.parse(data)
    // if (this.util.arcsApp && this._USE_AZURE_PUBSUB && param != '') {
    //   if ((type == 'arcsPoses' && data['mapName'] != param) || (type != 'arcsPoses' && data['robotId'] != param)) {
    //     return
    //   }
    // }

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

  initArcsRobotDataMap(robotCode : string){
    let obj = this.arcsRobotDataMap[robotCode]
    if(!obj && robotCode){
      obj = new ArcsRobotDetailBehaviorSubjMap()
      this.arcsRobotDataMap[robotCode] = obj
    }
  } 

  updateArcsRobotDataMap(robotCode : string , objKey : ArcsRobotDetailSubjTypes , value : any){
    if(!robotCode){
      return
    }
    this.initArcsRobotDataMap(robotCode)
    this.arcsRobotDataMap[robotCode][objKey].next(value) 
  }



  // ^ =========================== SIGNALR =========================== ^ 


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
      resp.msg = resp.msg ? resp.msg : this.uiSrv.translate('Save Failed')
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

  // * * * v RV STANDALONE ACTIONS v * * * 
  public async openRobotCabinet(id , robotCode = null){
    this.httpSrv.fmsRequest("POST" , `cabinet/v1/open/${robotCode? robotCode + '/' : ''}` + id , undefined , true , this.uiSrv.translate(`Open Cabiniet [${id}]`))
  }

  public async closeRobotCabinet(id, robotCode = null){
    this.httpSrv.fmsRequest("POST" , `cabinet/v1/close/${robotCode? robotCode + '/' : ''}` + id, undefined ,  true , this.uiSrv.translate(`Close Cabiniet [${id}]`))
  }

  public async connectWifi(ssid , pw){
    this.httpSrv.fmsRequest('POST', 'wifi/v1/connection', {ssid :ssid , password : pw},  true , this.uiSrv.translate('Connected to [SSID] Successfully').replace('[SSID]' , ('[' + ssid + ']')))
  }
  public async stopManualMode(){
    return this.httpSrv.fmsRequest('PUT', 'baseControl/v1/manual/OFF'  ,  null , true, 'Manual OFF')  
  }
  public async getAssets(url: string): Promise<any> {
    try{      
      return await this.httpSrv.http.get(url).toPromise()
    }catch{
      return null
    }
    // return <any> ret.pipe(filter(v => ![null,undefined].includes(v)), take(1)).toPromise()
  }
  // * * * ^ RV STANDALONE ACTIONS ^ * * * 
  
}

export class floorPlan3DSettings {
  floorPlanCode
  fileName
  scale
  positionX
  positionY
  positionZ
  rotationX
  rotationY
  rotationZ
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
    result : boolean
    msg ? : string
    exceptionDetail? : string
    validationResults?:[]
}

export class RobotMaster{
  robotCode
  name?
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
  pointType
  // shapeCode
  // shapeType
}

export class DropListAction {
  alias: string
  name: string
  allowedRobotTypes: string[]
  allowedPointTypes : string[]
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

export class DropListPointIcon{
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
  taskItemList : TaskItem[]
  reasonCode ? : string
  reasonMessage ? : string
  state? : string
}

export class TaskItem{
    index? : string
    actionListTimeout : number
    movement : {
      floorPlanCode : string,
      pointCode: string,
      navigationMode : string,
      orientationIgnored : boolean,
      fineTuneIgnored : boolean,
    }
    actionList: { 
      alias: string,
      properties: { }
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
  pointType: string
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
  modifiedDateTime?: Date
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
  obstacleDetected : boolean
  tiltDetected : boolean
  estopped : boolean
}

export class RobotDetailARCS{
  robotCode : string
  robotStatus: string
  modeState: string
  batteryPercentage: number
  speed : number
  obstacleDetected : boolean
  tiltDetected : boolean
  estopped : boolean
}


export const ARCS_STATUS_MAP = {
  IDLE : "Idle",
  CHARGING : "Charging",
  EXECUTING : "Working",
  UNKNOWN : "Offline",
  HOLD : "Reserved"
} 

export class loginResponse{
  result?: boolean
  msgCode?: string
  msg?: string
  auth2FASegment ? :string
  validationResults? :{
    accessFunctionList? : {functionCode : string}[]
    access_token? : string
    refresh_token? : string
    password_expires_in ? : number
    tenant_id ? : string
    user_id ? : string
    user_name ? : string
    configurations: { configKey: string, configValue: string }[]
  }
}

export type ArcsRobotDetailSubjTypes = 'speed'| 'batteryRounded' | 'state' | 'ieq' |  'estop' | 'obstacleDetected' | 'tiltActive' | 'status' | 'destination' | 'availContainersCount' | 'totalContainersCount' | 'containersAvail' | 'containersDoorStatus'
export class ArcsRobotDetailBehaviorSubjMap {
  speed: BehaviorSubject<any>
  batteryRounded: BehaviorSubject<any>
  state: BehaviorSubject<any>
  estop: BehaviorSubject<boolean>
  obstacleDetected: BehaviorSubject<boolean>
  tiltActive: BehaviorSubject<boolean>
  status :  BehaviorSubject<any>
  destination :  BehaviorSubject<any>

  // topModules

  //PATROL
  ieq: BehaviorSubject<any>
  //DELIVERY
  availContainersCount: BehaviorSubject<any>
  totalContainersCount: BehaviorSubject<any>
  containersAvail : BehaviorSubject<string[]>
  containersDoorStatus : BehaviorSubject<string[]>

  constructor() {
    this.speed = new BehaviorSubject<any>(null)
    this.batteryRounded = new BehaviorSubject<any>(null)
    this.state = new BehaviorSubject<any>(null)
    this.ieq = new BehaviorSubject<any>(null)
    this.estop = new BehaviorSubject<boolean>(null)
    this.obstacleDetected = new BehaviorSubject<boolean>(null)
    this.tiltActive = new BehaviorSubject<boolean>(null)
    this.status = new BehaviorSubject<any>(null)
    this.destination = new BehaviorSubject<any>(null)
    this.availContainersCount =  new BehaviorSubject<any>(null)
    this.totalContainersCount =  new BehaviorSubject<any>(null)
    this.containersAvail = new BehaviorSubject<string[]>([])
    this.containersDoorStatus = new BehaviorSubject<string[]>([])
  }
}

export const ObjectTypes = ['ROBOT','FLOOR_PLAN' , 'FLOOR_PLAN_POINT' , 'MAP' , 'MAP_POINT' , 'TASK' , 'OPERATION' , 'MISSION']
export const TaskStateOptions = [{text : "Pending" , value : "WAITING"} , {text : "Executing" , value : "EXECUTING"},{text : "Completed" , value : "SUCCEEDED"} , {text : "Canceled" , value : "CANCELED"} , {text : "Failed" , value : "FAILED"}, {text : "Busy" , value : "BUSY"}]





