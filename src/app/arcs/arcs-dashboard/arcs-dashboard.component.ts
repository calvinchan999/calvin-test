import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { MqService } from 'src/app/services/mq.service';
import { Map2DViewportComponent, Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import {DropListBuilding, DropListFloorplan, DropListType, FloorPlanAlertTypeDescMap, FloorPlanDataset, JFloorPlan, JSite, RobotStatusARCS as RobotStatus, RobotStatusARCS, ShapeJData, TaskStateOptions} from 'src/app/services/data.models';
import { Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { skip, takeUntil } from 'rxjs/operators';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { take , filter } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth.service';
import { ArcsDashboardRobotDetailComponent } from './arcs-dashboard-robot-detail/arcs-dashboard-robot-detail.component';
import { ArcsTaskScheduleComponent } from './arcs-task-schedule/arcs-task-schedule.component';
import { RobotObject3D, ThreejsViewportComponent } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { ArcsRobotGroupComponent } from './arcs-robot-group/arcs-robot-group.component';
import { truncateSync } from 'fs';
import { CmTaskCancelComponent } from 'src/app/common-components/cm-task/cm-task-cancel/cm-task-cancel.component';
import { environment } from 'src/environments/environment';
import { PixiBuildingPolygon } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import * as PIXI from 'pixi.js';
import { RobotService } from 'src/app/services/robot.service';
import { MapService } from 'src/app/services/map.service';
import { ArcsEventDetectionDetailComponent } from './arcs-event-detection-detail/arcs-event-detection-detail.component';
import { ArcsDashboardMapPanelComponent } from './arcs-dashboard-map-panel/arcs-dashboard-map-panel.component';

type robotTypeInfo = { //A group can be an individual robot (when filtered by robot type) OR robot type (no filter applied) 
  robotType: string
  name : string | null
  waitingTaskCount? : number | null
  executingTaskCount? : number | null
  completedTaskCount? : number | null
  processCount ? : number | null
  chargingCount ? : number | null
  idleCount ? : number | null
  offlineCount ? : number | null
  reservedCount? : number | null
  alertCount?: number | null
} 

export type RobotInfo = { //A group can be an individual robot (when filtered by robot type) OR robot type (no filter applied) 
  robotType : string
  floorPlanCode : string
  robotCode: string
  executingTaskCount? : number | null
  waitingTaskCount? : number | null
  completedTaskCount? : number | null
  robotStatus : string
  robotStatusCssClass? : string
  alert? : string
} 


@Component({
  selector: 'app-arcs-dashboard',
  templateUrl: './arcs-dashboard.component.html',
  styleUrls: ['./arcs-dashboard.component.scss']
})
export class ArcsDashboardComponent implements OnInit {
  @ViewChild('pixi') pixiElRef: Map2DViewportComponent
  @ViewChild('threeJs')threeJsElRef : ThreejsViewportComponent
  @ViewChild('mainContainer') mainContainer 
  @ViewChild('table') tableRef : TableComponent
  @ViewChild('robotDetailComp') robotDetailCompRef : ArcsDashboardRobotDetailComponent
  @ViewChild('btmMapPanel') btmMapPanel : ArcsDashboardMapPanelComponent
  @ViewChild('rightMapPanel') rightMapPanel : ArcsDashboardMapPanelComponent
  
  totalRobotCount
  activeRobotCount
  totalTaskCount
  executingTaskCount


  robotInfos: RobotInfo[] = []
  robotTypeInfos: robotTypeInfo[] = []

  scrollToBottom = ()=> this.mainContainer.nativeElement.scrollTop = this.mainContainer.nativeElement.scrollHeight
  tableDisabledButtons = { new: false, action: true }
  tableButtons = { new: true, action: true }
  selectedTab = 'dashboard'
  robotTypeFilter = null
  year
  location
  dropdownData = { types: []}
  dropdownOptions = {
    types: [],
    years: [],
    locations: [],
    floorplans: []
  }
  data = []
  robotIconColorMap = {}
  stopSubscribeRobotStatus = new Subject()

  gridSettings = this.getGridSettings()
  getGridSettings(){
    return {
      task:{
        functionId:"TASK",
        apiUrl:"api/task/page/v1" + (this.robotTypeFilter? `/${this.robotTypeFilter}` : ''),
        defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'createdDateTime'}]},
        columns:[
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton' , fixed : true  },
          // { title: "Order No.", id: "taskId", width: 50 },
          { title: "Description", id: "name", width: 100 },
          { title: "Status", id: "state", width: 40 , dropdownOptions: TaskStateOptions},
        ].concat(
          this.util.arcsApp? <any>[{ title: "Assigned To", id: "robotCode", width: 50 }] : []
        ).concat(<any>[
          { title: "Completion Date", id: "endDateTime",  type: "date" , width: 50 },
          { title: "Created Date", id: "createdDateTime",  type: "date" , width: 50 },
          { title: "", type: "button", id: "cancel", width: 20, icon: 'cancel-butoon mdi mdi-close-thick iconButton' , fixed : true ,  ngIf: true   }, 
        ]),
      },
      template:{
        functionId:"TASK_TEMPLATE",
        apiUrl:"api/task/mission/page/v1"  + (this.robotTypeFilter? `/${this.robotTypeFilter}` : ''),
        columns:[ { title: "", type: "checkbox", id: "select", width: 30 ,fixed : true },
        { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton' , fixed : true  },
        { title: "Template Code", id: "missionId", width: 50 },
        { title: "Description", id: "name", width: 100 },
        { title: "", type: "button", id: "execute", width: 80, icon: 'add-button k-icon k-i-play iconButton' , fixed : true  },
        ],
      },
      schedule: {
        functionId: "TASK_SCHEDULE",
        apiUrl: "api/task/schedule/page/v1" + (this.robotTypeFilter ? `/${this.robotTypeFilter}` : ''),
        defaultState: { filter: { filters: [{ filters: [{ field: "expired", operator: "eq", value: false }], logic: "or" }], logic: "and" }, skip: 0, sort: [{ dir: 'asc', field: 'startDateTime' }], take: 15 },
        columns: [
          { title: "", type: "checkbox", id: "select", width: 30, fixed: true },
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton', fixed: true },
          { title: "Template Code", id: "missionId", width: 100 },
          { title: "Schedule Name", id: "name", width: 200 },
          { title: "Start Date", id: "startDateTime",  type: "date" , width: 100 },
          { title: "End Date", id: "endDateTime", type: "date" , width: 100 },
          { title: "Recurring", id: "recurring", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
          { title: "Enabled", id: "enabled", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
          { title: "Active", id: "active", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
          { title: "Expired", id: "expired", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
        ],
      },
      group: {
        functionId: "ROBOT_GROUP",
        apiUrl: "api/robot/robotGroup/page/v1",
        columns: [
          { title: "", type: "checkbox", id: "select", width: 30, fixed: true },
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton', fixed: true },
          { title: "Group Name", id: "name", width: 50 },
          { title: "Robots", id: "robotCodes", width: 150 },
        ],
      },
      robot_detection: {
        apiUrl: "api/analytics/robotDetection/page/v1",
        defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'detectionDateTime'}]},
        buttons : {new: false, action: false },
        columns: [
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon mdi mdi-text-box-search-outline' , fixed: true },          
          { title: "Date", id: "detectionDateTime", width: 100 ,  type: "date"  },
          { title: "Floor Plan", id: "floorPlanCode", width: 100 , dropdownType : 'floorplans'},
          { title : "Event" , id : "detectionType" , width : 250 , dropdownOptions : Object.keys(FloorPlanAlertTypeDescMap).map(k=> { return {text : FloorPlanAlertTypeDescMap[k] , value : k}})},
          { title: "Robot Code", id: "robotCode", width: 100 },
        ],
      },
    }
  }
  

  getTabs(){
    const extraTabsByRobotType = {
      PATROL: [
        { id: 'patrol_playback', label: 'Playback', functionId : 'PATROL_PLAYBACK' } 
      ]
    }
    return (this.robotTypeFilter ? [
      { id: 'dashboard', label: 'Dashboard' , authorized : false},
      { id: 'task', label: 'Task' , functionId :  this.gridSettings.task.functionId},
      { id: 'template', label: 'Task Template' ,  functionId :  this.gridSettings.template.functionId},
      { id: 'schedule' , label : 'Schedule', functionId :  this.gridSettings.schedule.functionId},
    ].
    concat(extraTabsByRobotType[this.robotTypeFilter.toUpperCase()] ? extraTabsByRobotType[this.robotTypeFilter.toUpperCase()] : []) : 

    [
      { id: 'dashboard', label: 'Dashboard', authorized: false } , 
      { id: 'usability', label: 'Usability', authorized: false },
      { id: 'utilization', label: 'Utilization', authorized: false },      
      { id: 'robot_detection' , label : 'Event' , authorized : false },
      // { id: 'analysis', label: 'Analysis', authorized: false },
      { id: 'group', label: 'Group' , functionId :  this.gridSettings.group.functionId},
    ]).
    filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(t.functionId.toUpperCase()))
  }
  tabs: { id: string, label: string, authorized?: boolean, functionId?: string }[] = []

  columnDef = [ ]
  robotDetailId = null
  $onDestroy = new Subject()
  floorPlanFilter = null
  selectedFloorPlanCode
  site : JSite
  loadingTicket
  currentFloorPlan : JFloorPlan = null
  use3DMap = false 
  locationTree : {
    site : {
      code : string ,
      name : string 
    },
    building :{
      code : string ,
      name : string 
    },
    currentLevel : 'floorplan' | 'site'
    selected : {
      building: string,
      floorplan : string,
    }
  } = {
    site : {
      code : null,
      name : null
    },
    building : {
      code : null,
      name : null
    },
    currentLevel : 'site',
    selected : {
      building: null,
      floorplan : null,
    }
  }
  me
  iconMap = {}
  constructor(public mapSrv : MapService, public robotSrv : RobotService, public mqSrv : MqService,  private util :GeneralUtil , private authSrv : AuthService , private httpSrv : RvHttpService, public uiSrv : UiService , private dataSrv : DataService, private router : Router , private ngZone : NgZone ) {
    // this.chartTesting()
    environment.routes.forEach(r=>{
      this.iconMap [r.path.replace('/','').toUpperCase()] = r.icon
    })
    this.me = this
    this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(t.functionId))
    this.selectedTab = 'dashboard'
    // this.mqSrv.subscribeMQTTs([ 'obstacleDetection' , 'tilt' , 'estop'])

    this.mqSrv.data.arcsRobotStatusChange.pipe(skip(1), filter(v => v != null), takeUntil(this.$onDestroy)).subscribe((c) => {
      if (this.selectedTab == 'dashboard') {
        this.refreshStats(c?.filter(c => !this.robotTypeFilter || c?.robotType == this.robotTypeFilter?.toUpperCase()))
      }
      if (this.selectedTab == 'group') {
        this.tableRef?.retrieveData();
      }
      if (this.selectedTab == 'task' && this.tableRef) {
        this.tableRef.retrieveData();
      }
    })

  }

  ngOnDestroy(){
    // if(this.currentFloorPlan){
    //   // this.mqSrv.unsubscribeMQTT('arcsTaskInfoChange', false , this.currentFloorPlan.floorPlanCode)
    //   this.mqSrv.unsubscribeMQTT('arcsRobotStatusChange', false , this.currentFloorPlan.floorPlanCode)
    // }
    this.stopSubscribeRobotStatus.next()
    this.$onDestroy.next()    
  }
  
  async ngOnInit(){
    this.robotTypeFilter = this.router.url == '/home' ? null : this.router.url.replace('/', '')
    this.tabs = this.getTabs()
    this.gridSettings = this.getGridSettings()
  }

  async ngAfterViewInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.site = await this.mapSrv.getSite()
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
    this.locationTree = this.dataSrv.getSessionStorage('arcsLocationTree') ? JSON.parse(this.dataSrv.getSessionStorage('arcsLocationTree')) : this.locationTree 
    if(this.dataSrv.getLocalStorage('dashboardMapType') != '3D' || this.locationTree?.currentLevel != 'floorplan'){
      await this.initPixi()
    }else{
      this.use3DMap = true
      this.currentFloorPlan = null
      await this.refreshFloorPlanOptions()
      await this.loadFloorPlan()
    }
    this.uiSrv.loadAsyncDone(ticket)
  }
  

  async refreshFloorPlanOptions(){
    var data = (await this.dataSrv.getDropList('floorplans')).data
    this.dropdownOptions.floorplans = this.dataSrv.getDropListOptions('floorplans', data, this.locationTree?.building?.code ? { buildingCode: this.locationTree?.building?.code } : undefined)
    if (this.pixiElRef) {
      this.pixiElRef.module.data.dropdownData.floorplans = data
      this.pixiElRef.module.data.dropdownOptions.floorplans = this.dropdownOptions.floorplans
    }
  }

  async initPixi(floorPlanCode = null , showSite = false) {
    // let ticket = this.uiSrv.loadAsyncBegin()
    let ret = new Subject()
    setTimeout(async () => {
      this.pixiElRef?.initDone$.subscribe(async () => {
        if(this.site &&  (!this.dataSrv.getSessionStorage('dashboardFloorPlanCode') || showSite)){
          await this.loadSite()
        }else{
          await this.loadFloorPlan(floorPlanCode)
        }
        ret.next(true)
        // this.uiSrv.loadAsyncDone(this.loadingTicket)
      })
    })
    return  <any> ret.pipe(filter(v => ![null,undefined].includes(v)), take(1)).toPromise()
  }

  async loadSite(){
    sessionStorage.removeItem('arcsLocationTree')
    sessionStorage.removeItem('dashboardFloorPlanCode')
    this.selectedFloorPlanCode = null
    this.currentFloorPlan = null
    if( this.pixiElRef){
      // this.tabs = this.tabs.filter(t=>t.id != '3dMap')
      this.pixiElRef.reset()
      this.locationTree.currentLevel = 'site'
      this.locationTree.site.code = this.site.siteCode
      this.locationTree.site.name = this.site.name
      this.pixiElRef.viewport.pixiApp.renderer.transparent = false
      this.pixiElRef.viewport.pixiApp.renderer.backgroundColor = 0xFFFFFF
      await this.pixiElRef.loadToMainContainer( this.site.base64Image )  
      this.pixiElRef.backgroundSprite.filters = null
      this.loadBuildingPolygons()
      
      this.pixiElRef.setViewportCamera(this.site.viewX, this.site.viewY, this.site.viewZoom)
      this.stopSubscribeRobotStatus.next()
      this.mqSrv.subscribeMQTTUntil('arcsRobotStatusChange' ,  null , this.stopSubscribeRobotStatus )
    }
    // this.refreshTaskInfo()
    this.refreshStats()
  }

  async loadBuildingPolygons(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let ddl = await this.dataSrv.getDropList('buildings')
    this.pixiElRef.module.data.dropdownData.buildings = ddl.data
    let buildings: DropListBuilding[] = <any>ddl.data
    buildings.filter(b=>b.polygonCoordinates && b.polygonCoordinates.length > 0).forEach(b => {
      let polygon = new PixiBuildingPolygon(this.pixiElRef.viewport , b.polygonCoordinates.map(c=>new PIXI.Point(c.x , c.y)))
      //this.getBuildingPolygon(b.polygonCoordinates , {x : b.labelX , y : b.labelY} , true)
      polygon.buildingCode = `${b.buildingCode}`
      polygon.buildingName = `${b.name}`
      polygon.setTagPosition( new PIXI.Point(b.labelX , b.labelY))
      this.pixiElRef.mainContainer.addChild(polygon)      
      polygon.events.click.pipe(takeUntil(polygon.events.removedOrDestroyed)).subscribe(()=>{
        this.ngZone.run(async()=>{
          let floorplans : DropListFloorplan[] = <any>this.pixiElRef.module.data.dropdownData.floorplans
          let fpCode = floorplans.filter(fp=>fp.buildingCode == b.buildingCode && fp.defaultPerBuilding)[0]?.floorPlanCode
          fpCode = fpCode ? fpCode : floorplans.filter(fp=>fp.buildingCode == b.buildingCode)[0]?.floorPlanCode
          this.pixiElRef.module.site.locationTree.building.code = b.buildingCode
          this.pixiElRef.module.site.locationTree.building.name = b.name
          if (fpCode) {
            await this.refreshFloorPlanOptions()
            this.locationTree.currentLevel = 'floorplan'
            this.use3DMap = this.dataSrv.getLocalStorage('dashboardMapType') == '3D'
            await this.loadFloorPlan(fpCode)
          } else {
            this.uiSrv.showNotificationBar(`No available floor plans found for the selected building [${b.buildingCode}]`)
          }
        })
      })
    })
    this.refreshBuildingRobotCountTag()
    this.uiSrv.loadAsyncDone(ticket)
  }

  refreshBuildingRobotCountTag(){ 
    this.pixiElRef.viewport.allPixiPolygons.forEach(b=>{
      let floorPlanList = (<DropListFloorplan[]>this.pixiElRef.module.data.dropdownData.floorplans).filter((fp) => fp.buildingCode == b.buildingCode).map(fp=>fp.floorPlanCode)
      this.pixiElRef.setBuildingRobotCount(b.buildingCode , this.robotInfos.filter(r=> r.robotStatus!= 'UNKNOWN' && floorPlanList.includes(r.floorPlanCode)).length)
    })
  }

  async setFloorplanRobotCount(options :  { value: string, text: string, suffix: string }[]) {
    let ticket = this.uiSrv.loadAsyncBegin()
    let robotInfo: RobotStatusARCS[] = await this.dataSrv.httpSrv.fmsRequest('GET', 'robot/v1/info' + (this.robotTypeFilter ? `?robotType=${this.robotTypeFilter.toUpperCase()}` : ''), undefined, false)
    options.forEach((o) => {
      let count = robotInfo.filter(r => r.robotStatus != "UNKNOWN" &&  r.floorPlanCode == o.value).length
      o.suffix = count == 0 ? undefined : count.toString()
    })
    this.ngZone.run(()=>{
      if(this.pixiElRef ){
        this.pixiElRef.module.data.dropdownOptions.floorplans = JSON.parse(JSON.stringify(options))
      }
      if(this.threeJsElRef){
        this.threeJsElRef.floorPlanOptions =  JSON.parse(JSON.stringify(options))
      }
    })
    this.uiSrv.loadAsyncDone(ticket)
  }

  // async getDefaultFloorPlanCode(){
  //   if(this.dataSrv.getSessionStorage('dashboardFloorPlanCode')){
  //     return this.dataSrv.getSessionStorage('dashboardFloorPlanCode')
  //   }
  //   let defaultBuilding = this.mapSrv.defaultBuilding
  //   let floorPlans : DropListFloorplan[] = <any>((await this.dataSrv.getDropList('floorplans')).data)
  //   let floorPlanCode = floorPlans.filter(f=>(f.buildingCode == defaultBuilding || !defaultBuilding ) && f.defaultPerBuilding)[0]?.floorPlanCode
  //   floorPlanCode = floorPlanCode ? floorPlanCode : floorPlans.filter(f=> f.buildingCode == defaultBuilding || !defaultBuilding )[0]?.floorPlanCode
  //   return floorPlanCode
  // }

  async loadFloorPlan(code = null) {
    this.btmMapPanel?.selectedMapObjChange(null)
    let ticket = this.uiSrv.loadAsyncBegin()
    code = code ? code :  await this.mapSrv.getDefaultFloorPlanCode()
    if(!code){
      this.uiSrv.loadAsyncDone(ticket)
      if(this.pixiElRef){
        this.pixiElRef.overlayMsg = this.uiSrv.translate("No floorplan records found.")
      }else{
        this.dataSrv.setLocalStorage('dashboardMapType' , '2D') 
        this.ngAfterViewInit()
      }
      return 
    }
    if(code != this.selectedFloorPlanCode){
      this.rightMapPanel.panelMode = null
      this.btmMapPanel.selectedMapObjChange(null)
    }

    let floorplan = await this.mapSrv.getFloorPlan(code);
    if(!floorplan){
      location.reload()
      return
    }
    this.currentFloorPlan = floorplan
    if(floorplan?.floorPlanCode){
      this.dataSrv.setSessionStorage('dashboardFloorPlanCode', floorplan.floorPlanCode);  
    }
    this.selectedFloorPlanCode = floorplan.floorPlanCode
    if(this.pixiElRef){
      await this.pixiElRef.module.data.loadFloorPlan(floorplan.floorPlanCode) // .loadDataset(floorplan, true, true);
      this.pixiElRef.module.robot.subscribeRobotPose([... new Set(floorplan.mapList.map(m => m.mapCode))])
      this.pixiElRef.module.data.subscribeFloorPlanAlertState()
    }
    this.dataSrv.setSessionStorage('arcsLocationTree' , JSON.stringify(this.locationTree))      
    if(this.threeJsElRef){
      this.threeJsElRef.floorPlanDataset = floorplan
      this.threeJsElRef.loadFloorPlan(floorplan)
    }    
    if(this.rightMapPanel?.taskComp){
      this.rightMapPanel.taskComp.refreshMapPoints()
    }
   
    this.floorPlanFilter = floorplan.floorPlanCode
    // await this.refreshTaskInfo()
    // await this.refreshStats()
    // this.mqSrv.subscribeMQTT('arcsTaskInfoChange' ,  floorplan.floorPlanCode )
    this.stopSubscribeRobotStatus.next()
    this.mqSrv.subscribeMQTTUntil('arcsRobotStatusChange' ,  floorplan.floorPlanCode , this.stopSubscribeRobotStatus )
    this.refreshIotStatus()
    // this.tabs = (floorplan.mapList.length == 0 ? [] : [{ id: '3dMap', label: '3D Map', authorized: false }]).concat(<any>this.getTabs())
    this.uiSrv.loadAsyncDone(ticket)
    
  }

  async refreshIotStatus(){
    if(this.currentFloorPlan.pointList.filter(p=>p.pointType == 'LIFT').length >0){
      this.mqSrv.refreshIotStatus(this.currentFloorPlan.floorPlanCode)
      this.mqSrv.subscribeMQTTUntil('arcsLift' , undefined, this.stopSubscribeRobotStatus)
    }
  }

  
  refreshRobotIconColorMap(){
    for(let i = 0 ; i <this.robotInfos.length ; i++){
      let idx = 0
      if(this.robotTypeFilter){
        idx = i
      }else{
        idx = this.robotTypeInfos.indexOf(this.robotTypeInfos.filter(t => t.robotType == this.robotInfos[i].robotType)[0])
      }
      this.robotIconColorMap[this.robotInfos[i].robotCode]  = this.util.config.robot?.visuals[idx]?.fillColor
    }  
    this.robotIconColorMap = JSON.parse(JSON.stringify(this.robotIconColorMap))
  }

  addAndRemoveRobotInfos(data: any[]) {
    this.robotInfos = this.robotInfos.filter(r => data.map(d => d.robotCode).includes(r.robotCode)).
                       concat([... data.filter(d => !this.robotInfos.map(i => i.robotCode).includes(d.robotCode))].map(d => {
                         return { robotCode: d.robotCode , robotType: d.robotType, floorPlanCode: d.floorPlanCode,  completedTaskCount: null, waitingTaskCount: null, robotStatus: null, robotStatusCssClass : null }
                      }))
    this.robotTypeInfos = this.robotTypeInfos.filter(i=> data.map(d => d.robotType).includes(i.robotType)).
                          concat([... new Set(data.filter(d=> !this.robotTypeInfos.map(i=>i.robotType).includes(d.robotType)).map(i=>i.robotType))].map(t=> 
                            {return {robotType : t , name : this.dropdownData.types.filter((d:DropListType)=> d.enumName == t)[0]?.description , executingTaskCount: 0, completedTaskCount: 0, processCount: 0, chargingCount : 0,idleCount : 0, offlineCount : 0 , alertCount : 0}})
                          )
    this.refreshRobotIconColorMap()
  }

  getStatusListUrlParam(){
    let ret =  (this.robotTypeFilter ? [`robotType=${this.robotTypeFilter.toUpperCase()}`]: []).concat(this.selectedFloorPlanCode? [`floorPlanCode=${this.selectedFloorPlanCode}`] : []).join("&")
    return ret == ''? '' : '?' + ret
  }

  async refreshStats(data: RobotStatus[] = null){
    const filters = this.getStatusListUrlParam()
    data = data == null ?  await this.dataSrv.httpSrv.fmsRequest('GET', 'robot/v1/info' + this.getStatusListUrlParam(), undefined, false) : data
    if(filters!= this.getStatusListUrlParam()){ //validate concurrency
      return
    }
    
    this.addAndRemoveRobotInfos(data)  
    data.forEach(d=> this.robotSrv.robotState(d.robotCode).updateRobotInfo(d))
    // this.refreshRobotDetail(data)

    if(this.threeJsElRef){
      this.threeJsElRef.robotObjs.filter(r=>! data.map(r2=>r2.robotCode).includes(r.robotCode)).forEach(r=>r.destroy())
    }
    if(this.pixiElRef){
      this.pixiElRef.robots.filter(r => !data.map(r2 => r2.robotCode).includes(r.id)).forEach(r => this.pixiElRef.robotModule.removeRobot(r))
    }

    let robotStatusCssClassMap = {
      IDLE : 'idle',
      EXECUTING : 'working',
      CHARGING: 'charging',
      UNKNOWN : 'offline',
      HOLD : 'reserved'
    }
    this.robotInfos.forEach(i=>{
      let robot = data.filter(t=>t.robotCode == i.robotCode)[0]
      i.robotType = robot?.robotType
      i.robotStatus = robot?.robotStatus
      i.floorPlanCode = robot?.floorPlanCode
      i.executingTaskCount = robot?.executingTaskCount
      i.waitingTaskCount = robot?.waitingTaskCount
      i.completedTaskCount = robot?.completedTaskCount
      i.robotStatusCssClass =  robotStatusCssClassMap[robot?.robotStatus]
      i.alert = (robot.estopped ? [this.uiSrv.commonAlertMessages.estopped] :[]).concat(robot.obstacleDetected ? [this.uiSrv.commonAlertMessages.obstacleDetected] :[]).concat(robot.tiltDetected ? [this.uiSrv.commonAlertMessages.tiltDetected] :[]).join(" ,\n")
    })    
    

    let alerted = (s : RobotStatus)=> s.obstacleDetected || s.estopped || s.tiltDetected
    this.robotTypeInfos.forEach(i => {
      i.executingTaskCount = data.filter(t => t.robotType == i.robotType).reduce((acc, i) => acc += i.executingTaskCount, 0)
      i.completedTaskCount = data.filter(t => t.robotType == i.robotType).reduce((acc, i) => acc += i.completedTaskCount, 0)
      i.waitingTaskCount = data.filter(t => t.robotType == i.robotType).reduce((acc, i) => acc += i.waitingTaskCount, 0)
      i.idleCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'IDLE').length
      i.processCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'EXECUTING').length
      i.chargingCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'CHARGING').length
      i.offlineCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'UNKNOWN').length
      i.reservedCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'HOLD').length
      i.alertCount = data.filter(s => alerted(s) && s.robotType == i.robotType).length
    })    

    this.executingTaskCount = data.filter(t => !this.robotTypeFilter || t?.robotType == this.robotTypeFilter?.toUpperCase()).map(t => t.executingTaskCount).reduce((acc, i) => acc += i, 0)
    this.totalTaskCount = data.filter(t => !this.robotTypeFilter || t?.robotType == this.robotTypeFilter?.toUpperCase()).map(t => t.executingTaskCount + t.completedTaskCount).reduce((acc, i) => acc += i, 0)
    
    if( this.currentFloorPlan){
      for(let i = 0 ; i < data.length ; i ++){
        let d = data[i];
        let robot : Robot | RobotObject3D = this.pixiElRef ? this.pixiElRef?.robots.filter(r=>r.id == d.robotCode)[0] : this.threeJsElRef?.robotObjs.filter(r=>r.robotCode == d.robotCode)[0]
        if (!robot && d.robotStatus == "UNKNOWN" && (this.pixiElRef || this.threeJsElRef)) {
          // TBR : TO BE INCLUDE IN robotInfo
          // STILL SHOW OFFLINE ROBOT , GET POSE FROM API 
          let pose: { x: number, y: number, angle: number } = await this.httpSrv.fmsRequest('GET', 'robotStatus/v1/robotTaskStatus/pose/' + d.robotCode, undefined, false)
          let mapCode = this.currentFloorPlan.mapList.map(m => m.mapCode)[0]
          let robotInfo = (await this.dataSrv.getRobotList()).filter(r => r.robotCode == d.robotCode)[0]
          let arcsPoseObj = this.mqSrv.data.arcsPoses.value ? JSON.parse(JSON.stringify(this.mqSrv.data.arcsPoses.value)) : {}
          arcsPoseObj[mapCode] = arcsPoseObj[mapCode] ? arcsPoseObj[mapCode] : {}
          arcsPoseObj[mapCode][d.robotCode] = {
            x: pose.x, y: pose.y, angle: pose.angle,
            mapName: mapCode,
            timeStamp: new Date().getTime(),
            interval: 0
          }
          if (robotInfo && this.pixiElRef && this.pixiElRef.getMapContainer(mapCode, robotInfo.robotBase)) {
            robot = this.pixiElRef.robotModule.addRobot(d.robotCode, mapCode, robotInfo.robotBase)
            // robot.observed = true
          } else if (robotInfo && this.threeJsElRef && this.threeJsElRef.getMapMesh(robotInfo.robotBase)) {
            robot = this.threeJsElRef.getRobot(d.robotCode) ? this.threeJsElRef.getRobot(d.robotCode) : new RobotObject3D(this.threeJsElRef, d.robotCode, robotInfo.robotBase, robotInfo.robotType , robotInfo.robotSubType)
            this.threeJsElRef.getMapMesh(robotInfo.robotBase).add(robot)
            this.threeJsElRef.refreshRobotColors()
            robot.visible = true
          }
          this.mqSrv.data.arcsPoses.next(arcsPoseObj)
        }
        
        if(robot){
          robot.offline = d.robotStatus == "UNKNOWN"
          robot.alert = alerted(d)
        }
      }
    }

    this.activeRobotCount = data.filter(s=>s.robotStatus != 'UNKNOWN' && (!this.robotTypeFilter || s?.robotType == this.robotTypeFilter?.toUpperCase())).length
    this.totalRobotCount = data.filter(s=>!this.robotTypeFilter || s?.robotType == this.robotTypeFilter?.toUpperCase()).length
    if(this.pixiElRef &&  this.locationTree.currentLevel == 'site'){
      this.refreshBuildingRobotCountTag()
    }
  }

  showDialog(event){
    if (event?.column == 'select'){
      return
    }else  if ( this.selectedTab == 'task' &&  event?.column == 'cancel') {
      this.cancelTask(event)
    }else{
      const compMap =  {
        schedule : ArcsTaskScheduleComponent,
        task : CmTaskJobComponent,
        template : CmTaskJobComponent,
        group : ArcsRobotGroupComponent,
        robot_detection : ArcsEventDetectionDetailComponent
      }
      let dialog : DialogRef = this.uiSrv.openKendoDialog({content: compMap[this.selectedTab] , preventAction:()=>true});
      const content = dialog.content.instance;
      content.dialogRef = dialog
      if(this.selectedTab == 'template' || this.selectedTab == 'task'){
        content.isTemplate = this.selectedTab == 'template' 
        content.isExecuteTemplate = event?.column == 'execute'
        content.readonly = this.selectedTab == 'task' && content.id != null;
        content.defaultRobotType = this.robotTypeFilter?.toUpperCase()
      }
      content.parent = this
      content.parentRow = event?.row
      dialog.result.subscribe(()=>{
        this.tableRef.retrieveData()
      })
    }
  }


  async cancelTask(evt){
    let dialog : DialogRef = this.uiSrv.openKendoDialog({content: CmTaskCancelComponent , preventAction:()=>true});
    const content : CmTaskCancelComponent = dialog.content.instance;
    content.dialogRef = dialog
    content.parent = this
    content.taskId = evt?.['row']?.['taskId']
    content.taskName = evt?.['row']?.['name']
    dialog.result.subscribe(()=>{
      this.tableRef.retrieveData()
    })
  }

  async delete(){
    if (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))) {
      return
    }
    let urlMapping = {
      template: 'api/task/mission/v1' ,
      schedule: 'api/task/schedule/v1' ,
      group : 'api/robot/robotGroup/v1'
    }
   
    let resp = await this.dataSrv.deleteRecords(urlMapping[this.selectedTab], this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
  }

  showRobotDetailDialog(id){
    this.robotDetailId = id
    const dialog : DialogRef = this.uiSrv.openKendoDialog({
      content: ArcsDashboardRobotDetailComponent ,   
      preventAction: () => true
    });
    const content : ArcsDashboardRobotDetailComponent = dialog.content.instance;
    content.parent = this
    content.dialogRef = dialog
    content.robotId = this.robotDetailId
    this.robotDetailCompRef = content
    dialog.result.subscribe(()=> {
      this.loadData()
      this.robotDetailCompRef = null
    })
  }

  async loadData(evt = null) {
    this.tableRef?.retrieveData()
    // this.uiSrv.loadAsyncDone(ticket)
  }
  
}


    // data = data.filter(d=>d.robotCode !=  'DUMMY-TEST-1')
    // data.forEach(d=>{
    //   if(d.robotCode == 'RV-ROBOT-103'){
    //     d.robotType = 'PATROL'
    //   }
    // })
    // data = [
    //   {
    //     robotType: 'MOBILE_CHAIR',
    //     floorPlanCode: 'AA-L5-TRANSFER',
    //     executingTaskCount: 1,
    //     completedTaskCount: 8,
    //     waitingTaskCount: 0,
    //     robotCode: 'Mobilechair-01'
    //   },
    //   {
    //     robotType: 'MOBILE_CHAIR',
    //     floorPlanCode: 'AA-L5-TRANSFER',
    //     executingTaskCount: 0,
    //     completedTaskCount: 12,
    //     waitingTaskCount: 0,
    //     robotCode: 'Mobilechair-02'
    //   },
    //   {
    //     robotType: 'MOBILE_CHAIR',
    //     floorPlanCode: 'AA-L5-TRANSFER',
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: 'Mobilechair-03'
    //   }
    // ]

       // data = data.filter(d=>d.robotCode !=  'DUMMY-TEST-1')
    // data.forEach(d=>{
    //   if(d.robotCode == 'RV-ROBOT-103'){
    //     d.robotType = 'PATROL'
    //   }
    // })
    // data = [
    //   {
    //     robotType: 'MOBILE_CHAIR',
    //     robotCode: 'Mobilechair-02',
    //     floorPlanCode: 'AA-L5-TRANSFER',
    //     robotStatus: 'UNKNOWN',
    //     obstacleDetected : false,
    //     tiltDetected : false,
    //     estopped : false
    //   },
    //   {
    //     robotType: 'PATROL',
    //     robotCode: 'RV-ROBOT-104',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'EXECUTING',
    //     obstacleDetected : false,
    //     tiltDetected : false,
    //     estopped : false
    //   }
    // ]


    
    // data = [
    //   {
    //     batteryPercentage : 0.5,
    //     speed : 0,
    //     modeState : null,
    //     pointCode : null,
    //     reservedPoint : null,
    //     reservingPoints : null,
    //     waitingPoint : null,
    //     trayRackDTO : null,
    //     executingTaskCount : 1,
    //     completedTaskCount : 35,
    //     waitingTaskCount : 0 , 
    //     robotType: 'DELIVERY',
    //     robotCode: 'MIR',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'EXECUTING',
    //     obstacleDetected : false,
    //     tiltDetected : false,
    //     estopped : false
    //   },
    //   {
    //     batteryPercentage : 0.5,
    //     speed : 0,
    //     modeState : null,
    //     pointCode : null,
    //     reservedPoint : null,
    //     reservingPoints : null,
    //     waitingPoint : null,
    //     trayRackDTO : null,
    //     executingTaskCount : 0,
    //     completedTaskCount : 21,
    //     waitingTaskCount : 0 , 
    //     robotType: 'CONCIERGE',
    //     robotCode: 'TEMI',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'IDLE',
    //     obstacleDetected : false,
    //     tiltDetected : false,
    //     estopped : false
    //   },
    //   {
    //     batteryPercentage : 0.5,
    //     speed : 0,
    //     modeState : null,
    //     pointCode : null,
    //     reservedPoint : null,
    //     reservingPoints : null,
    //     waitingPoint : null,
    //     trayRackDTO : null,
    //     executingTaskCount : 0,
    //     completedTaskCount : 14,
    //     waitingTaskCount : 0 , 
    //     robotType: 'FLOOR_SCRUB',
    //     robotCode: 'GAUSSIAN',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'IDLE',
    //     obstacleDetected : false,
    //     tiltDetected : false,
    //     estopped : false
    //   },
    //   {
    //     batteryPercentage : 0.1,
    //     speed : 0,
    //     modeState : null,
    //     pointCode : null,
    //     reservedPoint : null,
    //     reservingPoints : null,
    //     waitingPoint : null,
    //     trayRackDTO : null,
    //     executingTaskCount : 1,
    //     completedTaskCount : 31,
    //     waitingTaskCount : 0 , 
    //     robotType: 'PATROL',
    //     robotCode: 'PATROL',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'EXECUTING',
    //     obstacleDetected: false,
    //     tiltDetected: false,
    //     estopped: false
    //   }, 
    //   {
    //     batteryPercentage: 0.5,
    //     speed: 0,
    //     modeState: null,
    //     pointCode: null,
    //     reservedPoint: null,
    //     reservingPoints: null,
    //     waitingPoint: null,
    //     trayRackDTO: null,
    //     executingTaskCount: 0,
    //     completedTaskCount: 18,
    //     waitingTaskCount: 0,
    //     robotType: 'MOBILE_CHAIR',
    //     robotCode: 'CHAIR',
    //     floorPlanCode: '5W_2022',
    //     robotStatus: 'UNKNOWN',
    //     obstacleDetected: false,
    //     tiltDetected: false,
    //     estopped: false
    //   }
    // ]
