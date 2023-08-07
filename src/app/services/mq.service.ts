import { Injectable, NgZone } from '@angular/core';
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

import { RobotStateTypes, DropListMap, JTask, RobotStatusARCS, TaskItem, FloorPlanAlertTypeDescMap } from './data.models';
import { DataService } from './data.service';
import {RobotService, RobotState} from './robot.service'
import {MapService} from './map.service'
import { EditorUnderlineButtonDirective } from '@progress/kendo-angular-editor';

const PUB_SUB_IGNORE_SFX_LIST = ['arcsPoses' , 'battery' , 'speed'];
export type syncStatus = 'TRANSFERRED' | 'TRANSFERRING' | 'MALFUNCTION'
export type syncLog =  {dataSyncId? : string , dataSyncType? : string , objectType? : string , dataSyncStatus?: syncStatus , objectCode?: string , robotCode?: string , progress? : any , startDateTime? : Date , endDateTime : Date  }
export type dropListType =  'floorplans' | 'buildings' | 'sites' | 'maps' | 'actions' | 'types' | 'locations' | 'userGroups' | 'subTypes' | 'robots' | 'missions' | 'taskFailReason' | 'taskCancelReason'
export type localStorageKey = 'lang' | 'uitoggle' | 'lastLoadedFloorplanCode' | 'eventLog' | 'unreadMsgCnt' | 'unreadSyncMsgCount' | 'syncDoneLog' | 'dashboardMapType'
export type sessionStorageKey = 'arcsLocationTree' | 'dashboardFloorPlanCode'| 'isGuestMode' | 'userAccess' | 'arcsDefaultBuilding' | 'userId' | 'currentUser' 
export type eventLog = {datetime? : string | null , type? : string , message : string  , robotCode?: string }
export type MQType = 'activeMap' | 'occupancyGridMap' | 'navigationMove' | 'chargingResult' | 'chargingFeedback' | 'state' | 'battery' | 'pose' | 'speed'| 'poseDeviation' |
                    'obstacleDetection' | 'estop' | 'brake' | 'tilt' | 'departure' | 'arrival' | 'completion' | 'timeout' | 'exception' | 'followMePair' |
                    'followMeAoa' | 'digitalOutput' | 'wifi' | 'cellular' | 'ieq' | 'rfid' | 'cabinet' | 'rotaryHead' | 'nirCamera' | 'nirCameraDetection' |
                    'thermalCamera' | 'thermalCameraDetection' | 'webcam' | 'heartbeatServer' | 'heartbeatClient' | 'arcsPoses' | 'taskActive' | 'lidarStatus' |
                    'led' | 'fan' | 'pauseResume' | 'taskComplete' | 'taskDepart' | 'taskArrive' | 'destinationReached' | 'taskProgress' | 'moving' | 'lidar'| 'taskPopups'|
                    'arcsRobotStatusChange' | 'arcsSyncLog' | 'arcsRobotDestination' | 'arcsLift' | 'arcsTurnstile' | 'arcsAiDetectionAlert' | 'cpuTemp' | 'restrictedZone' |
                    'requestAssistance'

@Injectable({
  providedIn: 'root'
})
export class MqService {
  data: { [key: string]: BehaviorSubject<any> } = {
    execute : new BehaviorSubject<any>(null), //dummy 
    exception : new BehaviorSubject<any>(null),
    unreadMsgCnt: new BehaviorSubject<any>(0),
    arcsPoses : new BehaviorSubject<any>(null),   
    arcsRobotStatusChange : new BehaviorSubject<RobotStatusARCS[]>(null),
    // arcsTaskInfoChange : new BehaviorSubject<RobotTaskInfoARCS[]>([]),
    arcsWarningChangedRobotCode : new BehaviorSubject<string | null>(null),
    arcsSyncLog : new BehaviorSubject<syncLog[]>([]),
    arcsLift: new BehaviorSubject<{ [key: string]: { floor: string, opened: boolean, robotCode: string } }>({}),
    arcsTurnstile: new BehaviorSubject<{ [key: string]: { opened: boolean } }>({}),
  }

  dataSA: { [key: string]: BehaviorSubject<any> } = {}
  dataARCS: { [key: string]: BehaviorSubject<any> } = {}


  
  
  // public arcsRobotDataMap : { [key: string] : RobotState} = {}
  //api pending : tilt , pose , obstacle detection , arcsPoses
  
  public mqMaster: { [key: string]: { topic?: string, mapping?: any, robotState?: any, api?: any, subscribedCount?: any, apiQueryParam?: string, apiPathParam?: boolean } } = {
    cpuTemp: { topic: "rvautotech/fobo/systemSensor", 
               api:"systemSensor/v1/read",
               robotState: { cpuTemp : (d: { components: { cpus: { sensors: { temperatures: { name: string, value: string }[] } }[] } }) => d.components?.cpus[0]?.sensors?.temperatures[0]?.value } 
             },
    trayRack: {
      topic: "rvautotech/fobo/trayRack",   
                 robotState:{ execute: (d : {robotId : string})=> {
                             this.robotSrv.robotState(d.robotId).topModule.delivery.updateContainers(d)
                             return null
                           }
                         }
               },
    taskPopups:{ topic: "rvautotech/fobo/topModule/request", robotState: { taskPopupRequest: (d)=> d }},
    // activeMap: { topic: "rvautotech/fobo/map/active", mapping: { activeMap: 'id' } },
    occupancyGridMap: { topic: "rvautotech/fobo/map/occupancyGrid", robotState: { occupancyGridMap: null } }, //NO need to call API to get latest value for this
    navigationMove: { topic: "rvautotech/fobo/navigation/move/result" },
    chargingResult: { topic: "rvautotech/fobo/docking/charging/result" }, 
    chargingFeedback: { topic: "rvautotech/fobo/docking/charging/feedback"},
    led:{topic: "rvautotech/fobo/led" , robotState :{led: (d)=> d['lightOn']} , api:'led/v1'},
    arrival: { topic: "rvautotech/fobo/arrival" },
    completion: { topic: "rvautotech/fobo/completion" },
    timeout: { topic: "rvautotech/fobo/timeout" },
    followMePair: { topic: "rvautotech/fobo/followme/pairing", robotState: { followMePaired: (d)=> d['pairingState'] == 'PAIRED' } , api: 'followMe/v1/pairing'},//pending: confirm with RV what would pairingState return , except 'unpaired'
    followMeAoa: { topic: "rvautotech/fobo/followme/aoa", robotState: { followMeAoaState: 'aoaState' } , api: 'followMe/v1/pairing/aoa' },
    digitalOutput: { topic: "rvautotech/fobo/digital/output" },
    fan : {topic: "rvautotech/fobo/fan" ,  robotState :{fan: (d : {fanOn : any })=> d.fanOn}, api:'fan/v1' },
    ieq: { topic: "rvautotech/fobo/ieq" , robotState: { ieq : (d : {robotId : string , ieq : any})=> {     
                                                        Object.keys(d).filter(k=> k!= 'robotId').forEach(k=>d[k] = this.util.trimNum(d[k], 0)); 
                                                        this.robotSrv.robotState(d.robotId).topModule.patrol.updateAirQuality(d , this.util.config.IEQ_LEVELS  , this.util.config.IEQ_STANDARD)
                                                      // this.updateArcsRobotDataMap(d.robotId , 'ieq' , d.ieq)
                                                        return d;
                                                     } 
                                                  } , 
                                          api:'ieqSensor/v1/read' , apiPathParam : true
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
    lidarStatus: { topic: "rvautotech/fobo/lidar/status", robotState: { lidarSwitchedOn: (d : {SwitchOn : boolean}) => d.SwitchOn}, api: 'lidar/v1/status' },
    lidar:{topic : 'rvautotech/fobo/lidar' , robotState: { lidar:(d)=> <any>(d)}},
    speed: { topic: 'rvautotech/fobo/speed', robotState: { speed: (d : {robotId: string , speed : number}) => {
                                                          let ret = !isNaN(Number(d.speed))? (Number(d.speed).toFixed(2) == '-0.00' ? '0.00' : Number(d.speed).toFixed(2)) : ' - ' 
                                                          // this.updateArcsRobotDataMap(d.robotId , 'speed' , ret)
                                                          return ret
                                                        }
                                                      } ,
                                             api:'baseControl/v1/speed' 
    },
    brake: { topic: "rvautotech/fobo/brake", robotState: { brakeActive: (d : {switchedOn : any}) => d.switchedOn } , api:'baseControl/v1/brake' },
    estop: { topic: "rvautotech/fobo/estop", 
             robotState: { estop: (d : { robotId : string , stopped : any})=>{
                                                                      if(d.stopped ){
                                                                        this.onLoggedNotificationReceived('Emergency Stop Switched On', d['robotId'] , 'warning' , this.util.arcsApp)
                                                                      }; 
                                                                      // this.updateArcsRobotDataMap(d.robotId , 'estop' , d.stopped)
                                                                      return d.stopped
                                                                    },
                          } , 
             api:'baseControl/v1/estop',
             mapping:{
              arcsWarningChangedRobotCode:(d)=>{
                return d['robotId']
              } 
             }
           },
    tilt: { topic: "rvautotech/fobo/tilt", 
            mapping: { arcsWarningChangedRobotCode:(d)=>{
                                                       return d['robotId']
                                                    }
                      } , 
            api:'baseControl/v1/obstacle/detection' ,
            robotState : {
              tiltActive: (d : {robotId : any , detected : any})=> {  
                if(d.detected ){
                   this.onLoggedNotificationReceived('Excess tilt detected', d.robotId , 'warning' ,  this.util.arcsApp)                                                                             
                }; 
                return d.detected;
              },
            }
           },
    obstacleDetection: { topic: "rvautotech/fobo/obstacle/detection", 
                         robotState: { obstacleDetected: (d : {robotId : string , detected : any})=> {
                                      if(d.detected ){
                                        this.onLoggedNotificationReceived( 'Obstacle detected' , d['robotId'] , 'warning' , this.util.arcsApp)
                                      } 
                                      // this.updateArcsRobotDataMap(d.robotId , 'obstacleDetected' , d.detected)
                                      return d.detected;
                                    },
                                  },
                          mapping:{     
                            arcsWarningChangedRobotCode:(d : {robotId : string , detected : any})=>{
                             return d.robotId
                            }
                          }
                        },
    exception: { topic: "rvautotech/fobo/exception", mapping: { exception: (d)=>{ let msg = `FOBO Error : ${d['message']}`;
                                                                                  // this.uiSrv.showNotificationBar(msg ,'error') ; 
                                                                                  this.onLoggedNotificationReceived(msg , d['robotId'] , 'error' , false); 
                                                                                  console.log(d) ;
                                                                                  return d
                                                                                } 
                                                              }  
               },
    moving: { topic:'rvautotech/fobo/baseController/move' , robotState : {navigationDisabled : (d)=>d['moving'] , 
                                                                          status:(d : {robotId ? : string})=> {
                                                                            if(['Idle', 'Moving'].includes(this.robotSrv.robotState(d.robotId).status.value)){
                                                                              return d['moving'] ? 'Moving' : 'Idle';
                                                                            }else{
                                                                              return  this.robotSrv.robotState(d.robotId).status.value
                                                                            }
                                                                          }        
                                                                         },
                                                          api:"baseControl/v1/move",
            },
    taskActive:{topic:'rvautotech/fobo/execution',   robotState:{
      isMovingInTask : ()=> true,
      taskItemIndex: ()=> 0 , 
      nextTaskAction : (d : {moveTask : JTask})=> d.moveTask.taskItemList.filter(t=>t.actionList?.length > 0)[0]?.actionList[0]?.alias ,     
      currentTaskId :  (d :  {taskId : string})=> d.taskId,
      taskActive: (d :  { robotId ? : string, taskId : string , moveTask : JTask}) => {
          let ret =  d.taskId!= null ? d : d.moveTask
          this.robotSrv.robotState(d.robotId).taskProgress.next(0)
          if (this.uiSrv.isTablet && ret ) {
            this.router.navigate(['taskProgress'])
          }
          return ret
        }
      } 
    },
    taskProgress : {topic: 'rvautotech/fobo/action/completion' ,
                    robotState : {taskItemIndex : (d )=>d['taskItemIndex'] , taskProgress : (d)=>{
                      let taskItemList : TaskItem[] = (<JTask>this.robotSrv.robotState(d.robotId).taskActive.value)?.taskItemList                  
                      if(taskItemList){
                        let taskItemIndex = d['taskItemIndex']
                        let actionIndex = d['actionIndex'] 
                        let ttlActionsCnt = taskItemList.map(itm => itm.actionList?.length ? itm.actionList?.length : 0).reduce((acc, inc) => inc + acc, 0)
                        let currCnt = taskItemList.filter(itm=>taskItemList.indexOf(itm) < taskItemIndex).map(itm => itm.actionList?.length ? itm.actionList?.length : 0).reduce((acc, inc) => inc + acc, 0) + actionIndex + 1
                        // this.robotSrv.robotState(d.robotId).taskActionIndex.next( d['actionIndex'])
                        let lastActionOfTaskItem =  taskItemList[taskItemIndex].actionList?.length - 1 == actionIndex
                        let nextTaskItem = lastActionOfTaskItem? taskItemList[taskItemIndex + 1] : taskItemList[taskItemIndex]
                        let nextActionIdx = lastActionOfTaskItem ? 0 : actionIndex  + 1
                        this.robotSrv.robotState(d.robotId).nextTaskAction.next(nextTaskItem?.actionList?.[nextActionIdx]?.alias)
                        return this.util.trimNum(currCnt/ttlActionsCnt * 100 , 2)
                      }else{
                        return 0
                      }      
                    }}
                   },
   taskComplete:{topic:'rvautotech/fobo/completion', 
                   robotState:{ currentTaskId : ()=> ' - ' ,
                                taskActive : (d)=>{         
                                               this.robotSrv.robotState(d.robotId).isMovingInTask.next(false)
                                               this.robotSrv.robotState(d.robotId).taskProgress.next(0)
                                               this.robotSrv.robotState(d.robotId).taskItemIndex.next(0)    
                                               this.robotSrv.robotState(d.robotId).nextTaskAction.next(null)
                                              //  this.robotSrv.robotState(d.robotId).taskActionIndex.next(0)     
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
    pauseResume:{topic:'rvautotech/fobo/baseController/pauseResume' , robotState:{isPaused:(d)=>d['pauseResumeState'] == 'PAUSE'} , api:'baseControl/v1/pauseResume'},
    destinationReached:{topic:'rvautotech/fobo/navigation/move/result',
                        robotState: { destinationReached:(d)=>{ let ok = d['goalStatus']?.['status'] == 'SUCCEEDED';
                                                             let msg = ok? 'Destination Reached' : 'Navigation Failed'
                                                             if(!this.util.arcsApp){
                                                              this.onLoggedNotificationReceived(msg , d['robotId']  , (ok ? 'success' : 'error'));
                                                             }
                                                             return d['goalStatus']?.['status'] 
                                                           }
                                 }
                       },
    taskArrive: {topic:'rvautotech/fobo/arrival', robotState:{isMovingInTask:()=> false ,  taskItemIndex : (d)=> d['taskItemIndex']}},
    taskDepart: {topic:'rvautotech/fobo/departure', robotState:{
                                                               isMovingInTask : ()=> true, //COMMENTED　20230311 (d)=> d['taskItemIndex'] > 0
                                                               taskItemIndex : (d)=>{
                                                                if(d['taskItemIndex']){
                                                                  return Math.min(this.robotSrv.robotState(d.robotId).taskActive.value?.['taskItemList']?.length - 1 ,  d['taskItemIndex'])
                                                                }else{
                                                                  return this.robotSrv.robotState(d.robotId).taskItemIndex.value
                                                                }                                                                
                                                               }
                                                              //  taskActionActiveAlias: (d)=>this.robotSrv.robotState(d.robotId).taskActive.value?.['taskItemList']?.[d['taskItemIndex']]?.['actionList']?.[0]?.['alias']
                                                              }
                  },
    state: { topic: "rvautotech/fobo/state", 
             robotState:{  
                        state : (d : {robotId : string , state : any ,  manual : any})=>{
                          const stateMap = {
                            UNDEFINED : ' - ' , 
                            NAVIGATION : 'Navigation', 
                            FOLLOW_ME : 'Follow Me', 
                            MAPPING : 'Map Scan', 
                            PATH_FOLLOWING : 'Path Follow'
                          } ; 
                          let ret = d.manual ? "Manual" : stateMap[d.state]
                          // this.updateArcsRobotDataMap(d.robotId , 'state' , ret)
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
            robotState: { wifiList: (wifis)=>{return wifis.filter(w=>w['preSharedKey'] == true)} 
                      } ,
             api:'wifi/v1'
          },
    battery: { topic: "rvautotech/fobo/battery",
               robotState: {battery: 'percentage' ,
                            batteryRounded: (d : {robotId : string , percentage : number})=>{ 
                            let ret = (d.percentage * 100).toFixed(0)
                            // this.updateArcsRobotDataMap(d.robotId , 'batteryRounded', ret)
                            return ret
                          } , 
                          charging: (d) => { return d['powerSupplyStatus'] == 'CHARGING' || d['powerSupplyStatus'] == 'FULL' } ,
                          status : this.util.arcsApp ? undefined : (d) => {return d['powerSupplyStatus'] == 'CHARGING' ? 'Charging' : 
                                                    (this.robotSrv.robotState(d.robotId).taskActive.value ? 'Working' : 
                                                      this.robotSrv.robotState(d.robotId).navigationDisabled.value? 'Moving' : 
                                                        (d['powerSupplyStatus'] == 'FULL' ? 'Fully Charged' : 'Idle'))
                                          } //TBD : Also check charging when update status on executingTask valueChange  
                        } ,
               api: 'battery/v1/state'
              },
    cellular: { topic: "rvautotech/fobo/cellular", 
                robotState: { cellularBars: 'signal' , 
                           cellularNumerator:(d)=> {return Math.ceil(d['signal'] * 5/100) },//{return d['bars']?.split("/")[0]} , 
                           cellularDenominator:(d)=> "5"//{return '/' + d['bars']?.split("/")[1]} 
                         },
                api:'cellular/v1/signal'
              },
    cabinet: { topic: "rvautotech/fobo/cabinet" , 
               robotState:{ execute: (d : {robotId : string})=> {
                              this.robotSrv.robotState(d.robotId).topModule.delivery.updateContainers(d)
                              return null
                            }
                          },
               api:'cabinet/v1'
             }, 
    pose: { topic: "rvautotech/fobo/pose", 
             robotState: {
             pose: (p) => {
                  return {
                    robotId: p.robotId,
                    x: p.x, y: p.y, angle: p.angle,
                    mapName: p.mapName,
                    timeStamp: new Date().getTime(),
                    interval: (this.robotSrv.robotState(p.robotId).pose.value ? new Date().getTime() - this.robotSrv.robotState(p.robotId).pose.value?.timeStamp : 0)
                  }
              }
             }
          },
    arcsPoses: { topic: "rvautotech/fobo/pose", //how to get robot type && status (Proccess / Charging / Idle / Offline) ??
                 mapping: { arcsPoses: (p) => {
                              let poseObj = this.data.arcsPoses.value ? this.data.arcsPoses.value : {}
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
    arcsRobotStatusChange :{ topic : 'rvautotech/fobo/ARCS/robot/info' ,mapping: { arcsRobotStatusChange : null} , api : 'robot/v1/info' , apiQueryParam : 'floorPlanCode'},
    // arcsTaskInfoChange :{ topic : 'rvautotech/fobo/ARCS/task/info' ,mapping: { arcsTaskInfoChange : null} , api : 'task/v1/taskInfo'},
    arcsSyncLog : { topic: "rvautotech/fobo/ARCS/data/sync/log" , mapping : {arcsSyncLog : (d:syncLog)=>{
                        var ret :syncLog[] = this.data.arcsSyncLog.value ? JSON.parse(JSON.stringify(this.data.arcsSyncLog.value))  : [] 
                        if(ret.filter(l=>l.dataSyncId != d.dataSyncId || l.dataSyncStatus != d.dataSyncStatus).length > 0 ){
                          this.unreadSyncMsgCount.next(this.unreadSyncMsgCount.value + 1)
                          this.dataSrv.setLocalStorage('unreadSyncMsgCount', JSON.stringify( this.unreadSyncMsgCount.value))
                        }
                        ret = [JSON.parse(JSON.stringify(d))].concat(ret.filter(l=>l.dataSyncId != d.dataSyncId)) 
                        this.dataSrv.setLocalStorage('syncDoneLog', JSON.stringify(ret.filter(l=>l.dataSyncStatus != 'TRANSFERRING')))    
                        if(d.dataSyncStatus == "TRANSFERRED"){
                          this.mapSrv.updateOutSyncFloorPlanList()
                        }
                        return ret
                      }
                    },
                    api:'api/sync/log/processing/v1'
                  },
    arcsRobotDestination: {
      topic: "rvautotech/fobo/ARCS/robot/nextPoint",
      robotState: {
        destination: (d: { robotCode: string, pointCode : string }) => {
          //let ret = d.movementDTOList?.[d.currentTaskItemIndex]?.movement?.pointCode
          // this.updateArcsRobotDataMap(d.robotCode, 'destination', ret)
          return d.pointCode
        }
      },
      // api: 'robot/nextPoint',
      // apiPathParam : true
    },
    arcsLift: {
      topic: "rvautotech/fobo/lift",
      mapping: {
        arcsLift: (d : { liftId?: string, floor?: string , carStatus?: string  , doorStatus?: string  , robotId? : string} )=>{
          let ret = this.data.arcsLift.value ? JSON.parse(JSON.stringify(this.data.arcsLift.value) ): {}
          ret[d.liftId] = {floor : d.floor , doorStatus : d.doorStatus, robotCode : d.robotId}
          return ret
        }
      },
      // api:'lift/v1/null' //TBR
    },
    arcsTurnstile: {
      topic: "rvautotech/fobo/turnstile",
      mapping: {
        arcsTurnstile: (d : { turnstileList ? : any [] , turnstileId?: string, status?: string })=>{
          let ret = this.data.arcsTurnstile.value ? JSON.parse(JSON.stringify(this.data.arcsTurnstile.value) ): {}
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
      // api:'turnstile/v1/null'  //TBR
    },
    poseDeviation: {
      topic: "rvautotech/fobo/poseDeviation",
      robotState: { poseDeviation: null }
    },
    arcsAiDetectionAlert : {
      topic : "rvautotech/fobo/object/detection",
      mapping : {
        execute: async(d : {robotId : string , pose  : {mapName : string} , detectionType : string , metadata? : string , count? : number})=>{
          const floorPlanState = await this.mapSrv.getFloorPlanStateByMapCode(d.pose?.mapName)
          const msg = this.uiSrv.translate(`${FloorPlanAlertTypeDescMap[d.detectionType]}`) + `${floorPlanState ? (this.uiSrv.translate(' at ') + floorPlanState?.dataWithoutImage.name) : ''}`
          this.onLoggedNotificationReceived( msg , d.robotId , "info")
          this.uiSrv.playAudio()
          //TBD Play sound 'DING'
          if(floorPlanState){
            floorPlanState.addAlert(<any>d)
            console.log(`ARMITAGE DETECTED : ${d.detectionType} - Floor Plan : ` + floorPlanState.floorPlanCode)
          }else{
            console.log(`Floor Plan Not Found (rvautotech/fobo/armitage/vision/detection) for Map Code : ` + d.pose?.mapName)
          }
        }
      }
    },
    robotCurrentWaypoint : {
      topic: "rvautotech/fobo/waypoint/current",
      robotState: { currentWaypoint: (d: { robotId : string, id: number, name: string, mapName: string, x: number, y: number, angle: number }) => { d.name } }
    },
    restrictedZone :{
      topic: "rvautotech/fobo/restrictedZoneAlert",
      mapping : {
        execute: (d : {robotCode : string , floorPlanCode : string , alertZoneCodes : string[]})=>{
          let msg = this.uiSrv.translate('Trespassed on restricted zone(s) ') + d.alertZoneCodes?.join(', ')
          this.onLoggedNotificationReceived(msg , d.robotCode , 'warning')
        }
      }
    },
    requestAssistance :{
      topic: "rvautotech/fobo/assistance",
      mapping : {
        execute: async(d : {robotId : string , pose : {robotId : string , mapName : string , x : number , y : number , angle : number}})=>{     
          this.uiSrv.showMsgDialog( `[${this.uiSrv.datePipe.transform(new Date() , 'yyyy-MM-dd HH:mm:ss')}] ${d.robotId}` + this.uiSrv.translate(' Requested for assistance.') , undefined , undefined , undefined , false)
        }
      }
    }
  }

  constructor( public mapSrv : MapService, public robotSrv : RobotService, public util : GeneralUtil , public httpSrv : RvHttpService, public dataSrv : DataService ,private uiSrv : UiService,  public signalRSrv : SignalRService, private router : Router , public pubsubSrv : AzurePubsubService , private datePipe : DatePipe , public configSrv : ConfigService , public ngZone : NgZone) { 
    this.backgroundSubscribeTypes =  this.util.arcsApp? 
    ['exception' , 'arcsSyncLog' , 'requestAssistance']:  
    ['estop' , 'tilt' , 'obstacleDetection' , 'exception', 'taskActive' , 'taskComplete' , 'destinationReached', 'moving']

    // 'estop' , 'tilt' , 'obstacleDetection' ARCS
    if(this.util.$initDone.value == true){
      this.init()
    }else {
      this.util.initDone.pipe(take(1)).subscribe(async()=>this.init())
    }
  }

  backgroundSubscribeTypes = []

  async init(){
    if(!this.util.getCurrentUser()){
      return
    }
    this.data.unreadMsgCnt.pipe(skip(1)).subscribe(v=>{
      this.dataSrv.setLocalStorage('unreadMsgCnt' , v.toString())
    })
    this.loadDataFromLocalStorage()
    if (this.util.standaloneApp) {
      // this.getRobotMaster(profile)
      let lidarStatusResp = await this.httpSrv.fmsRequest('GET', this.mqMaster.lidarStatus.api, undefined, false)
      if (lidarStatusResp?.SwitchOn) {
        this.uiSrv.showWarningDialog('Lidar Sensor Turned On.')
      }
    } else {
      this.mapSrv.updateOutSyncFloorPlanList()
    }
    if(this._USE_AZURE_PUBSUB){
      this.pubsubSrv.makeWebSocketConnection()   
    }
    await this.subscribeMQTTs(
      this.backgroundSubscribeTypes
    )
  }

  public outSyncFloorPlans :{type : string ,floorPlanCode : string , mapCode : string , robotBases : string[]}[] = []
  public unreadSyncMsgCount = new BehaviorSubject<number>(0)

  get _USE_AZURE_PUBSUB(){
    return this.util.arcsApp && !this.util.config.USE_SIGNALR
  }

  
  mqTopic(type: MQType) {
    return this.mqMaster[type].topic
  }

  private setSubscribedCount(type , count , key = ''){
    if(key == '' || this._USE_AZURE_PUBSUB){
      this.mqMaster[type].subscribedCount = count
    }else{
      this.mqMaster[type].subscribedCount =  this.mqMaster[type].subscribedCount ?  this.mqMaster[type].subscribedCount : {}
      this.mqMaster[type].subscribedCount[key] = count
    }
  }

  private getSubscribedCount(type , key = ''){
    let value = (key == '' || this._USE_AZURE_PUBSUB) ? this.mqMaster[type].subscribedCount : this.mqMaster[type]?.subscribedCount?.[key]
    return !value ? 0 : value
  }


  public async subscribeMQTTsUntil(types: MQType[], paramString = '', takeUntil: Subject<any>) {
    takeUntil.pipe(take(1)).subscribe(() => {
      this.unsubscribeMQTTs(types, false, paramString)
    })
    this.subscribeMQTTs(types , paramString)
  }
  
  public async subscribeMQTTUntil(type: MQType, paramString = '' , takeUntil: Subject<any> , getLatestFromApi = false ){
    takeUntil.pipe(take(1)).subscribe(() => {
      this.unsubscribeMQTT(type, false, paramString)
    })
    this.subscribeMQTT(type, paramString , getLatestFromApi)
  }


  public async subscribeMQTTs(types : MQType[] , paramString = '' ){
    let ret = {}
    await Promise.all(types.map(async(t)=> ret[t] = await this.subscribeMQTT(t , paramString)))
    return ret
  }

  public unsubscribeMQTTs(types : MQType[] , forced = false , paramString = ''){
    types.forEach(t=> this.unsubscribeMQTT(t , forced , paramString))
  }

  public unsubscribeAllMQ(){
    this.unsubscribeMQTTs(<any>Object.keys(this.mqMaster).filter(t=>!this.mqMaster[t].subscribedCount) , true)
  }

  public async unsubscribeMQTT(type: MQType , forced = false , paramString = '') {
    //Commented 20220422 - - - Aviod duplicate subscription
    paramString = this.util.standaloneApp || paramString == null ? '' : paramString
    this.setSubscribedCount(type, (forced ? 0 : Math.max(0, this.getSubscribedCount(type, paramString) - 1)), paramString)
    if( this.getSubscribedCount(type , paramString) == 0 && !this.backgroundSubscribeTypes.includes(type) ){
      // let mapping = this.mqMaster[type].mapping
      // if(mapping){
      //   Object.keys(mapping).forEach(k => this.data[k].next(null))
      // }
      let topicSfx =  paramString == '' ? '' : '/' + paramString 
      if(this._USE_AZURE_PUBSUB){
        this.pubsubSrv.unsubscribeTopic(this.mqMaster[type].topic + (PUB_SUB_IGNORE_SFX_LIST.includes(type) ? '' : topicSfx))
      }else{
        this.signalRSrv.unsubscribeTopic(this.mqMaster[type].topic + topicSfx)
      }
    }
  }
  
  public async refreshTaskStatus(){
    let resp = await this.httpSrv.fmsRequest('GET' ,'task/v1/status')
    this.updateTaskStatus(JSON.parse(resp.body))
  }

  public async subscribeMQTT(type: MQType, paramString = '' , getLatestFromApi = false ) {//paramString : get concated topic (ARCS implementing query param in signalR topic)
    if(!this.util.getCurrentUser()){
      return
    }
    paramString = this.util.standaloneApp ? '' : paramString
    let subscribedCount = this.getSubscribedCount(type, paramString) 
    let topicSfx = paramString == '' || paramString == null ? '' : '/' + paramString 
    let newSubscription =  !(this._USE_AZURE_PUBSUB ? this.pubsubSrv.getCreatedTopics() : this.signalRSrv.subscribedTopics).includes(this.mqMaster[type].topic + topicSfx)
    let ret = this._USE_AZURE_PUBSUB ? (await this.pubsubSrv.subscribeTopic(this.mqMaster[type].topic + (PUB_SUB_IGNORE_SFX_LIST.includes(type) ? '' : topicSfx))) : (await this.signalRSrv.subscribeTopic(this.mqMaster[type].topic + topicSfx, subscribedCount == 0))
    let $unsubscribed = this.signalRSrv.getUnsubscribedSubject(this.mqMaster[type].topic + topicSfx)

    if (subscribedCount == 0 || getLatestFromApi) {
      if ((this.util.standaloneApp && this.mqMaster[type].api && subscribedCount == 0) ) { // || (this.util.arcsApp && subscribedCount == 0 && ['arcsLift', 'arcsTurnstile'].includes(type))
        let resp = await this.httpSrv.fmsRequest('GET', this.mqMaster[type].api)
        if (resp && resp.status == 200) {
          this.updateMqBehaviorSubject(type, JSON.parse(resp.body), paramString)
        }
      } else if (this.util.arcsApp && subscribedCount == 0) {
          if (this.mqMaster[type].apiPathParam) {
            let resp = await this.httpSrv.fmsRequest('GET', this.mqMaster[type].api + '/' + paramString)
            if (resp && resp.status == 200 && resp.body?.length > 0) {
              this.updateMqBehaviorSubject(type, JSON.parse(resp.body), paramString)
            }
          } else if (this.mqMaster[type].apiQueryParam) {
            let resp = await this.httpSrv.fmsRequest('GET', this.mqMaster[type].api + (paramString?.length > 0 ?  `?${this.mqMaster[type].apiQueryParam}=` + paramString : ""))
            if (resp && resp.status == 200 && resp.body?.length > 0) {
              this.updateMqBehaviorSubject(type, JSON.parse(resp.body), paramString)
            }
          } else if (['arcsSyncLog'].includes(type)) {
            let ticket = this.uiSrv.loadAsyncBegin()
            let resp = await this.httpSrv.get(this.mqMaster[type].api);
            this.data.arcsSyncLog.next((this.dataSrv.getLocalStorage('syncDoneLog') ? JSON.parse(this.dataSrv.getLocalStorage('syncDoneLog')) : []).concat(resp))
            this.uiSrv.loadAsyncDone(ticket)
          }     
      }


      if (newSubscription) {
        //20220804 added take until
        ret.pipe(takeUntil($unsubscribed ? $unsubscribed  : new Subject<any>())).subscribe(
          (data) =>  this.updateMqBehaviorSubject(type, JSON.parse(data), paramString)
        )
      }
    }
    this.setSubscribedCount(type, this.getSubscribedCount(type, paramString) + 1, paramString)
    return ret
  }



  updateMqBehaviorSubject(type , data , param = '') {
    let mapping = this.mqMaster[type].mapping
    let robotStateMapping =  this.mqMaster[type].robotState
    if (this.util.config.DEBUG_SIGNALR && (!this.util.config.DEBUG_SIGNALR_TYPE || this.util.config.DEBUG_SIGNALR_TYPE?.length == 0 || type == this.util.config.DEBUG_SIGNALR_TYPE)) {
      console.log(`[${new Date().toDateString()}] SignalR Received [${type.toUpperCase()}] : ${JSON.stringify(data)}`)
    }
    
    // if (this.util.arcsApp && this._USE_AZURE_PUBSUB && param != '') {
    //   if ((type == 'arcsPoses' && data['mapName'] != param) || (type != 'arcsPoses' && data['robotId'] != param)) {
    //     return
    //   }
    // }
    if(robotStateMapping){
      let robotCode = data?.robotId == null ? data?.robotCode : data?.robotId
      Object.keys(robotStateMapping).forEach(k=>{
        if (robotStateMapping[k] === null) {
          this.robotSrv.robotState(robotCode)[k].next(data)
        } else if (this.util.isString(robotStateMapping[k])) {
          this.robotSrv.robotState(robotCode)[k].next(data?.[robotStateMapping[k]])
        } else if (this.util.isFunction(robotStateMapping[k])) {
          this.robotSrv.robotState(robotCode)[k].next(robotStateMapping[k](data))
        }
      })
    }
   
    if(mapping){
      Object.keys(mapping).forEach(k => {
        if (mapping[k] == null) {
          this.data[k].next(data)
        } else if (this.util.isString(mapping[k])) {
          this.data[k].next(data?.[mapping[k]])
        } else if (this.util.isFunction(mapping[k])) {
          this.data[k].next(mapping[k](data))
        }
      })
    }
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
          this.updateMqBehaviorSubject(k,tmpMap[k])
        }
      })
    }else if(taskWrapped.taskCompletionDTO && this.robotSrv.robotState(this.dataSrv.robotProfile?.robotCode).taskActive.value && (!taskWrapped.taskCompletionDTO?.completed || !taskWrapped.taskCompletionDTO?.cancelled)){
      this.updateMqBehaviorSubject('taskComplete',taskWrapped.taskCompletionDTO)
    }
  }

  

  loadDataFromLocalStorage(){
    let notiCount = this.dataSrv.getLocalStorage('unreadMsgCnt')
    let syncCount = this.dataSrv.getLocalStorage('unreadSyncMsgCount')
    let syncDoneLog = this.dataSrv.getLocalStorage('syncDoneLog')
    let log = this.dataSrv.getLocalStorage('eventLog')
    if(notiCount != null){
      this.data.unreadMsgCnt.next(Number(notiCount))
    }
    if(syncCount != null){
      this.unreadSyncMsgCount.next(Number(syncCount))
    }
    if(syncDoneLog != null){
      let oldLogs = this.data.arcsSyncLog.value ? this.data.arcsSyncLog.value : []
      let unreadLogs : syncLog[] = JSON.parse(syncDoneLog)
      this.data.arcsSyncLog.next(unreadLogs.concat(oldLogs.filter(l=>l.dataSyncStatus!='TRANSFERRING')))
    }
    if(log!=null){
      this.dataSrv.eventLog.next(JSON.parse(log))
    }
  }

  loghouseKeep(data : [] , maxSizeMb = 3){
    if( new Blob([JSON.stringify(data)]).size > maxSizeMb * 1000){  // 1000000
      data.pop();
    }
    if( new Blob([JSON.stringify(data)]).size > maxSizeMb * 1000){ // pop recursively until size < threshold
      this.loghouseKeep(data)
    }
  }


  onLoggedNotificationReceived(msg : string , robotCode : string | undefined = undefined , msgType : 'success' | 'none' | 'warning' | 'info' | 'error' = 'info' , showNotification = true ){
    this.data.unreadMsgCnt.next( this.data.unreadMsgCnt.value + 1)
    if(showNotification){
      this.uiSrv.showNotificationBar( robotCode? `[${robotCode}] ${msg}` : msg  , msgType)
    }
    this.addEventLogToLocalStorage(msg, robotCode, msgType) //TBR
    this.uiSrv.showBrowserPopupNotification(robotCode ? `[${robotCode}] ${msg}` : msg)
  }

  addEventLogToLocalStorage(message : string , robotCode : string | undefined  = undefined , type : 'success' | 'none' | 'warning' | 'info' | 'error' = 'info' ){
    //TBR : EVENT LOG TO BE RETRIEVED FROM DB INSTEAD OF LOCALSTORAGE
    let data =  this.dataSrv.getLocalStorage('eventLog') ? JSON.parse(this.dataSrv.getLocalStorage('eventLog')) : []
    let evtlog : eventLog = {message : message  , robotCode: robotCode, type : `${type.toUpperCase()} MESSAGE` , datetime : this.datePipe.transform(new Date() , 'dd/MM/yyyy hh:mm:ss aa')}
    data = [evtlog].concat(data)
    this.loghouseKeep(data)
    this.dataSrv.eventLog.next(data)
    this.dataSrv.setLocalStorage('eventLog', JSON.stringify(data))
  }

  async refreshIotStatus(floorPlanCode : string){
    const iotStatus : {
      lifts:  {
        liftId: string,
        floor?: string,
        carStatus?: string,
        doorStatus?: string,
        robotId ? : string
      }[ ]
    } = await this.httpSrv.fmsRequest('GET' , 'iot/v1?floorPlanCode=' +  floorPlanCode , undefined , false)
    
    iotStatus.lifts.forEach(l=>{
      this.updateMqBehaviorSubject( 'arcsLift' , l)
    })
  }
}


class mqSchema{
  id: string
  topicName: string
  className: string
  object: object
}


