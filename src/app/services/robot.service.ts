import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { RvHttpService } from './rv-http.service';
import { UiService } from './ui.service';
import { GeneralUtil } from '../utils/general/general.util';
import { DropListRobot, RobotStatusARCS } from './data.models';
import { DataService } from './data.service';
import { filter } from 'rxjs/operators';

// @ts-ignore
@Injectable({
    providedIn: 'root'
})
export class RobotService {
    ARCS : ArcsRobotServiceModule 
    STANDALONE : StandaloneRobotServiceModule
    data : RobotState

    robotList: DropListRobot[]

    constructor( public util : GeneralUtil,   public httpSrv : RvHttpService, public uiSrv : UiService , public dataSrv : DataService) {
        this.ARCS = new ArcsRobotServiceModule(  httpSrv , uiSrv , util )
        this.STANDALONE = new StandaloneRobotServiceModule(  httpSrv , uiSrv , util )
        this.data = this.STANDALONE.state
        this.dataSrv.dropListRobots.pipe(filter(v=>v!=null)).subscribe(v=>{
            this.robotList = v
            this.setRobotStatesMasterDataByRobotList()
        })
    }

    public async getRobotList() : Promise<DropListRobot[]>{
        if(!this.robotList || this.robotList?.length == 0){
          this.robotList = <any>((await this.dataSrv.getDropList('robots')).data)
        }
        this.setRobotStatesMasterDataByRobotList()
        let tmpMap = JSON.parse(JSON.stringify(this.uiSrv.robotTypeIconMapAll))
        Object.keys(this.uiSrv.robotTypeIconMapAll).filter(k=> !this.robotList.map(r=>r.robotType.toUpperCase()).includes(k)).forEach(k=> delete tmpMap[k])
        this.uiSrv.robotTypeIconMap = JSON.parse(JSON.stringify(tmpMap))
        this.uiSrv.refreshDrawerItems.next(true);
        return this.robotList
    }

    setRobotStatesMasterDataByRobotList(){
        this.robotList.forEach(r=>{
            this.robotState(r.robotCode).robotName = r.name
            this.robotState(r.robotCode).robotType = r.robotType
            this.robotState(r.robotCode).robotSubType = r.robotSubType
        })
    }
    
    robotState(robotCode : string = null) : RobotState{
        if(this.util.arcsApp){
            this.ARCS.initRobotState(robotCode)
            return this.ARCS?.robotStore[robotCode]
        }else{
            return this.STANDALONE.state
        }
    }

    public async openRobotCabinet(id, robotCode = null) {
       await this.httpSrv.fmsRequest("POST", `cabinet/v1/open/${robotCode ? robotCode + '/' : ''}` + id, undefined, true, this.uiSrv.translate(`Open Cabiniet [${id}]`))
    }

    public async closeRobotCabinet(id, robotCode = null) {
       await  this.httpSrv.fmsRequest("POST", `cabinet/v1/close/${robotCode ? robotCode + '/' : ''}` + id, undefined, true, this.uiSrv.translate(`Close Cabiniet [${id}]`))
    }

}

class ArcsRobotServiceModule {
    public robotStore: { [key: string]: RobotState } = {

    }
    constructor( public httpSrv : RvHttpService, public uiSrv : UiService , public util : GeneralUtil) {

    }

    public initRobotState(robotCode: string) {
        let obj = this.robotStore[robotCode]
        if (!obj && robotCode) {
            obj = new RobotState(robotCode , this.util)
            this.robotStore[robotCode] = obj
        }
    } 

    public async getRobotDetail(robotCode : string): Promise<{
        robotCode: string,
        robotStatus: string,
        modeState: string,
        batteryPercentage: number,
        speed: number,
        obstacleDetected: boolean,
        tiltDetected: boolean,
        estopped: boolean,
    }> {
        return await this.httpSrv.fmsRequest("GET", "robot/v1/info/" + robotCode, undefined, false)
    }
}

class StandaloneRobotServiceModule{
    state : RobotState
    constructor(  public httpSrv : RvHttpService, public uiSrv : UiService , public util : GeneralUtil)  {
        this.state = new RobotState(null , this.util)
    }
    
    public async connectWifi(ssid, pw) {
        this.httpSrv.fmsRequest('POST', 'wifi/v1/connection', { ssid: ssid, password: pw }, true, this.uiSrv.translate('Connected to [SSID] Successfully').replace('[SSID]', ('[' + ssid + ']')))
    }
    public async stopManualMode() {
        return this.httpSrv.fmsRequest('PUT', 'baseControl/v1/manual/OFF', null, true, 'Manual OFF')
    }
}


export class RobotState {
    util : GeneralUtil

    robotCode : string
    robotType? : string
    robotSubType? : string
    robotName? : string

    execute: any = new BehaviorSubject<any>(null)//dummyKeyForMqService

    speed: BehaviorSubject<any> = new BehaviorSubject<any>(' - ')
    batteryRounded: BehaviorSubject<any> = new BehaviorSubject<any>(null)
    state: BehaviorSubject<any> = new BehaviorSubject<any>(null)
    estop: BehaviorSubject<boolean> = new BehaviorSubject<any>(false)
    obstacleDetected: BehaviorSubject<boolean> = new BehaviorSubject<any>(false)
    tiltActive: BehaviorSubject<boolean> = new BehaviorSubject<any>(false)
    status: BehaviorSubject<any> = new BehaviorSubject<any>(' - ')
    destination: BehaviorSubject<any> = new BehaviorSubject<any>(null)
    brakeActive: BehaviorSubject<any> = new BehaviorSubject<any>(null)
    occupancyGridMap = new BehaviorSubject<any>(null)
    battery = new BehaviorSubject<any>(null)
    pose = new BehaviorSubject<any>(null)
    arcsPoses = new BehaviorSubject<any>(null)
    cellularBars = new BehaviorSubject<any>(null)
    cellularNumerator = new BehaviorSubject<any>(null)
    cellularDenominator = new BehaviorSubject<any>(null)
    charging = new BehaviorSubject<any>(null)
    wifiList = new BehaviorSubject<any>(null)
    fan = new BehaviorSubject<any>(null)
    led = new BehaviorSubject<any>(null)
    followMePaired = new BehaviorSubject<any>(null)
    followMeAoaState = new BehaviorSubject<any>(null)
    isFollowMeMode = new BehaviorSubject<any>(false)
    isFollowMeWithoutMap = new BehaviorSubject<any>(false)
    isAutoMode = new BehaviorSubject<any>(false)
    isMappingMode = new BehaviorSubject<any>(false)
    isManualMode = new BehaviorSubject<any>(false)
    taskActive = new BehaviorSubject<any>(null)
    taskItemIndex = new BehaviorSubject<any>(0)
    taskDepart = new BehaviorSubject<any>(0)
    isPaused = new BehaviorSubject<any>(false)
    isMovingInTask = new BehaviorSubject<any>(false)
    navigationDisabled = new BehaviorSubject<any>(false)
    taskProgress = new BehaviorSubject<any>(null)
    destinationReached = new BehaviorSubject<any>(null)
    exception = new BehaviorSubject<any>(null)
    currentTaskId = new BehaviorSubject<any>(' - ')
    lidar = new BehaviorSubject<{ mapName: string, pointList: { x: number, y: number }[], robotId: string } | null>(null)
    lidarSwitchedOn = new BehaviorSubject<any>(null)
    taskPopupRequest = new BehaviorSubject<{ guiId: string, invisible: boolean } | null>(null)
    nextTaskAction = new BehaviorSubject<string | null>(null)
    poseDeviation = new BehaviorSubject<{ poseValid: boolean, translationDeviation: boolean, angleDeviation: boolean } | null>(null)
    cpuTemp = new BehaviorSubject<number|null> (null)
    currentWaypoint = new BehaviorSubject<string|null> (null)
    pendingTaskCount =  new BehaviorSubject<number|null> (null)
    
    // topModules

    get ieq() {
        return this.topModule.patrol.ieq
    }
    get availContainersCount() {
        return this.topModule.delivery.availContainersCount
    }
    get totalContainersCount() {
        return this.topModule.delivery.totalContainersCount
    }
    get containersAvail() {
        return this.topModule.delivery.containersAvail
    }
    get containersDoorStatus() {
        return this.topModule.delivery.containersDoorStatus
    }

    topModule = {
        patrol : {
            updateAirQuality:(ieq , levels , range)=>{
                let overall = null
                let detail = {}
                levels =levels ? levels : ['Inadequate', 'Poor', 'Fair', 'Good', 'Excellent']
                range = range ? range :  {
                  t_degreeC: [[15, 24], [16, 23], [17, 22], [18, 21]],
                  rh_percent: [[10, 90], [20, 80], [30, 70], [40, 60]],
                  co_ppb: [[null, 7000], [null, null], [null, 1000], [null, 0]],
                  no2_ppb: [[null, 400], [null, null], [null, 200], [null, null]],
                  co2_ppm: [[null, 1800], [null, 1500], [null , 800], [null, 600]],
                  tvoc_ppb: [[null, 1000], [null, 500], [null, 300], [null, 100]]
                }        
                for (let i = 0; i < levels.length - 1; i++) {
                  Object.keys(range).forEach(k => {
                    let limits = range[k][i]
                      if (limits != undefined && !isNaN(Number(ieq[k])) && ((limits[0] != null && Number(ieq[k]) < limits[0]) || (limits[1] != null && Number(ieq[k]) > limits[1]))) {
                          overall = overall == null ? levels[i] : overall
                          detail[k] = detail[k] == undefined ? levels[i] : detail[k]
                      }
                  })
                }   
                Object.keys(range).filter(k=>!Object.keys(detail).includes(k)).forEach(k => detail[k]  = levels[levels.length - 1])     
                this.topModule.patrol.airQualityOverall.next(overall == null ? levels[levels.length - 1] : overall)  
                this.topModule.patrol.airQualityDetail.next(detail)      
              },
            ieq: new BehaviorSubject<any>(null),
            airQualityOverall : new BehaviorSubject<any>(null),
            airQualityDetail : new BehaviorSubject<any>(null)
        },
        delivery :{
            updateContainers : (d : { robotId : string , levelList? : {trayFull? : boolean}[] , doorList? : {trayFull? : boolean, status? : string}[]})=>{
                if(d.levelList){                 
                    this.topModule.delivery.totalContainersCount.next( d?.levelList?.length)
                    this.topModule.delivery.availContainersCount.next(d.levelList?.filter(l => !l.trayFull).length)
                    this.topModule.delivery.containersAvail.next(d?.levelList?.map(lv=> lv.trayFull ? 'Occupied' : 'Available'))  
                }
                if(d.doorList){
                    this.topModule.delivery.totalContainersCount.next( d?.doorList?.length)
                    this.topModule.delivery.availContainersCount.next(d.doorList?.filter(l => !l.trayFull).length)
                    this.topModule.delivery.containersAvail.next(d?.doorList?.map(dr=> dr.trayFull ? 'Occupied' : 'Available'))
                    this.topModule.delivery.containersDoorStatus.next(d.doorList?.map(door=> door.status))   
                }
            },
            availContainersCount: new BehaviorSubject<any>(null),
            totalContainersCount: new BehaviorSubject<any>(null),
            containersAvail : new BehaviorSubject<string[]>([]),
            containersDoorStatus : new BehaviorSubject<string[]>([])
        }        
    }

    //DELIVERY
     
    constructor(robotCode : string , util : GeneralUtil) {
        this.robotCode = robotCode
        this.util = util
    }

    updateRobotInfo(s: RobotStatusARCS) {
        this.pendingTaskCount.next(s.waitingTaskCount)
        this.status.next(s.robotStatus)
        this.estop.next(s.estopped)
        this.tiltActive.next(s.tiltDetected)
        this.obstacleDetected.next(s.obstacleDetected)
        this.batteryRounded.next((s.batteryPercentage * 100).toFixed(0))   //fms send null sometimes , temporarily dont update this 
        this.destination.next(s.pointCode)
        if (s.ieqDTO) {
            this.topModule.patrol.updateAirQuality(s.ieqDTO, this.util.config.IEQ_LEVELS, this.util.config.IEQ_STANDARD)
        }
        if (s.cabinetDTO) {
            this.topModule.delivery.updateContainers(s.cabinetDTO)
        }
        if (s.trayRackDTO) {
            this.topModule.delivery.updateContainers(s.trayRackDTO)
        }
    }
}