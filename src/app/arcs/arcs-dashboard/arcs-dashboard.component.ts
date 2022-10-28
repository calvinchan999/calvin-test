import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, PixiCommon, Robot } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService, DropListBuilding, DropListFloorplan, DropListType, FloorPlanDataset, JSite, RobotStatusARCS as RobotStatus, RobotTaskInfoARCS, ShapeJData } from 'src/app/services/data.service';
import { Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { skip, takeUntil } from 'rxjs/operators';
import { BehaviorSubject, combineLatest, Observable, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { ArcsDashboardRobotDetailComponent } from './arcs-dashboard-robot-detail/arcs-dashboard-robot-detail.component';
import { ArcsTaskScheduleComponent } from './arcs-task-schedule/arcs-task-schedule.component';

type robotTypeInfo = { //A group can be an individual robot (when filtered by robot type) OR robot type (no filter applied) 
  robotType: string
  name : string | null
  executingTaskCount? : number | null
  completedTaskCount? : number | null
  processCount ? : number | null
  chargingCount ? : number | null
  idleCount ? : number | null
  offlineCount ? : number | null
  reservedCount? : number | null
  alertCount?: number | null
} 

type robotInfo = { //A group can be an individual robot (when filtered by robot type) OR robot type (no filter applied) 
  robotType : string
  floorPlanCode : string
  robotCode: string
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
  @ViewChild('pixi') pixiElRef: DrawingBoardComponent
  @ViewChild('mainContainer') mainContainer 
  @ViewChild('table') tableRef : TableComponent
  @ViewChild('robotDetailComp') robotDetailCompRef : ArcsDashboardRobotDetailComponent
  totalRobotCount
  activeRobotCount
  totalTaskCount
  executingTaskCount


  robotInfos: robotInfo[] = []
  robotTypeInfos: robotTypeInfo[] = []
  robotGroups: robotTypeInfo[] = [
    // { name: 'TYPE-01', completedTask: 8, totalTask: 10, processCount: 0, chargingCount: 0, idleCount: 0, offlineCount: 10 },
    // { name: 'TYPE-02', completedTask: 8, totalTask: 12, processCount: 0, chargingCount: 0, idleCount: 0, offlineCount: 9 },
    // { name: 'TYPE-03', completedTask: 2, totalTask: 5, processCount: 0, chargingCount: 0, idleCount: 0, offlineCount: 8 },
    // { name: 'TYPE-04', completedTask: 27, totalTask: 30, processCount: 0, chargingCount: 0, idleCount: 0, offlineCount: 7 },
    // { name: 'TYPE-05', completedTask: 3, totalTask: 5, processCount: 0, chargingCount: 0, idleCount: 0, offlineCount: 6 },
  ] // TO BE RETREIVED FROM DataSrv , should be inside a object that has floorplan code as its property key
  scrollToBottom = ()=> this.mainContainer.nativeElement.scrollTop = this.mainContainer.nativeElement.scrollHeight
  tableDisabledButtons = { new: false, action: true }
  tableButtons = { new: true, action: true }
  selectedTab = 'dashboard'
  robotTypeFilter = null
  year
  location
  dropdownData = {types:[]}
  dropdownOptions = {
    types:[],
    years:[], 
    locations:[]
  }
  data = []
  robotIconColorMap = {}

  gridSettings = this.getGridSettings()
  getGridSettings(){
    return {
      task:{
        functionId:"TASK",
        apiUrl:"api/task/page/v1" + (this.robotTypeFilter? `/${this.robotTypeFilter}` : ''),
        defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'createdDateTime'}]},
        columns:[
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton' , fixed : true  },
          { title: "Order No.", id: "taskId", width: 50 },
          { title: "Description", id: "name", width: 100 },
          { title: "Status", id: "state", width: 40 , dropdownOptions:[{text : "Pending" , value : "WAITING"} , {text : "Executing" , value : "EXECUTING"},{text : "Completed" , value : "SUCCEEDED"} , {text : "Canceled" , value : "CANCELED"} , {text : "Failed" , value : "FAILED"},] },
        ].concat(
          this.util.arcsApp? <any>[{ title: "Assigned To", id: "robotCode", width: 50 }] : []
        ).concat(<any>[
          { title: "Completion Date", id: "endDateTime",  type: "date" , width: 50 },
          { title: "Created Date", id: "createdDateTime",  type: "date" , width: 50 },
          { title: "", type: "button", id: "cancel", width: 20, icon: 'cancel-butoon mdi mdi-close-thick iconButton' , fixed : true , ngIf: true },
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
        functionId:"TASK_SCHEDULE",
        apiUrl:"api/task/schedule/page/v1" + (this.robotTypeFilter? `/${this.robotTypeFilter}` : ''),
        defaultState: {filter:{filters:[{filters:[{field:"expired",operator:"eq",value:false}],logic:"or"}],logic:"and"},skip:0,sort:[{dir: 'asc' , field: 'startDateTime'}],take:15},
        columns: [
          { title: "", type: "checkbox", id: "select", width: 30, fixed: true },
          { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton', fixed: true },
          { title: "Template Code", id: "missionId", width: 100 },
          { title: "Schedule Name", id: "name", width: 200 },
          { title: "Start Date", id: "startDateTime",  type: "date" , width: 100 },
          { title: "End Date", id: "endDateTime", type: "date" , width: 100 },
          { title: "Recurring", id: "recurring", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
          { title: "Active", id: "active", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
          { title: "Expired", id: "expired", width: 50 , dropdownOptions:[{text : "Yes" , value :true},{text : "No" , value :false} ]},
        ],
      }
    }
  }
  
  getTabs(){
    return this.robotTypeFilter ? [
      { id: 'dashboard', label: 'Dashboard' , authorized : false},
      { id: 'task', label: 'Task' , functionId :  this.gridSettings.task.functionId},
      { id: 'template', label: 'Task Template' ,  functionId :  this.gridSettings.template.functionId},
      { id: 'schedule' , label : 'Schedule', functionId :  this.gridSettings.schedule.functionId},
    ].filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(t.functionId.toUpperCase())) : 
    [
      { id: 'dashboard', label: 'Dashboard', authorized: false } , 
      { id: 'usability', label: 'Usability', authorized: false },
      { id: 'utilization', label: 'Utilization', authorized: false }
    ]

  }
  tabs = []

  columnDef = [ ]
  robotDetailId = null
  $onDestroy = new Subject()
  floorPlanFilter = null
  selectedFloorPlanCode
  site : JSite
  loadingTicket
  
  constructor(  private util :GeneralUtil , private authSrv : AuthService , private httpSrv : RvHttpService, public uiSrv : UiService , private dataSrv : DataService, private router : Router , private ngZone : NgZone ) {
    // this.chartTesting()
    this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(t.functionId))
    this.selectedTab = 'dashboard'
    this.dataSrv.subscribeSignalRs(['arcsRobotStatusChange' , 'arcsTaskInfoChange', 'obstacleDetection' , 'tilt' , 'estop'])

    this.dataSrv.signalRSubj.arcsRobotStatusChange.pipe(skip(1), takeUntil(this.$onDestroy)).subscribe((c)=>{
      if(( !this.floorPlanFilter || c?.floorPlanCode == this.floorPlanFilter ) && (!this.robotTypeFilter || c?.robotType == this.robotTypeFilter?.toUpperCase())){
        this.refreshRobotStatus()
      }
      if(this.robotDetailCompRef){
        this.robotDetailCompRef.refreshRobotStatus()
      }
    })

    this.dataSrv.signalRSubj.arcsWarningChangedRobotCode.pipe(skip(1), takeUntil(this.$onDestroy)).subscribe((c)=>{
      if(this.robotInfos.map(r=>r.robotCode).includes(c)){
        this.refreshRobotStatus()
      }
      if(this.robotDetailCompRef && this.robotDetailId == c){
        this.robotDetailCompRef.refreshRobotStatus()
      }
    })

    this.dataSrv.signalRSubj.arcsTaskInfoChange.pipe(skip(1), takeUntil(this.$onDestroy)).subscribe((c)=>{
      if(( !this.floorPlanFilter || c?.floorPlanCode == this.floorPlanFilter ) && (!this.robotTypeFilter || c?.robotType == this.robotTypeFilter?.toUpperCase())){
        this.refreshTaskInfo()
      }
      if((!this.robotTypeFilter || c?.robotType == this.robotTypeFilter?.toUpperCase()) && this.selectedTab == 'task' && this.tableRef){
        this.tableRef.retrieveData();
      }
    })
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }

  ngOnDestroy(){
    this.$onDestroy.next()
    this.dataSrv.unsubscribeSignalRs(['arcsRobotStatusChange' , 'arcsTaskInfoChange'])
  }
  
  async ngOnInit(){
    // let robotList = <any>(await this.dataSrv.getDropList('robots')).data
    this.robotTypeFilter = this.router.url == '/home' ? null : this.router.url.replace('/', '')
    this.tabs = this.getTabs()
    this.gridSettings = this.getGridSettings()
    // for(let i = 2000 ; i < new Date().getFullYear() ; i ++){
    //   this.dropdownOptions.years.push({value : i , text: i.toString()})
    // }
  }

  async ngAfterViewInit() {
    this.site = await this.dataSrv.getSite()
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
    this.initPixi()
  }

  async initPixi() {
    // let ticket = this.uiSrv.loadAsyncBegin()
    setTimeout(async () => {
      this.pixiElRef.initDone$.subscribe(async () => {
        if(this.dataSrv.getSessionStorage('arcsLocationTree')){
          this.pixiElRef.arcsLocationTree = JSON.parse(this.dataSrv.getSessionStorage('arcsLocationTree'))
        }
        if(this.site && ! this.dataSrv.getSessionStorage('dashboardFloorPlanCode')){
          this.loadSite()
        }else{
          this.loadFloorPlan()
        }
        this.uiSrv.loadAsyncDone(this.loadingTicket)
      })
    })
  }

  async loadSite(){
    sessionStorage.removeItem('arcsLocationTree')
    sessionStorage.removeItem('dashboardFloorPlanCode')
    this.selectedFloorPlanCode = null
    if( this.pixiElRef){
      this.pixiElRef.reset()
      this.pixiElRef.arcsLocationTree.currentLevel = 'site'
      this.pixiElRef.arcsLocationTree.site.code = this.site.siteCode
      this.pixiElRef.arcsLocationTree.site.name = this.site.name
      await this.pixiElRef.loadToMainContainer( this.site.base64Image )  
      this.pixiElRef.loadArcsBuildings()
      this.pixiElRef.setViewportCamera(this.site.viewX, this.site.viewY, this.site.viewZoom)
    }
    this.refreshTaskInfo()
    this.refreshRobotStatus()
  }

  refreshBuildingRobotCountTag(robotList : {floorPlanCode : string}[]){
    this.pixiElRef.dropdownData.floorplans.map((b:DropListBuilding)=> b.buildingCode).filter(b=>this.pixiElRef.allPixiPolygon.map(p=>p.arcsBuildingCode).includes(b)).forEach(buildingCode=>{
      let floorPlanList = (<DropListFloorplan[]>this.pixiElRef.dropdownData.floorplans).filter((fp) => fp.buildingCode == buildingCode).map(fp=>fp.floorPlanCode)
      this.pixiElRef.setBuildingRobotCount(buildingCode , robotList.filter(r=>floorPlanList.includes(r.floorPlanCode)).length)
    })
  }

  async onPixiBuildingSelected(buildingCode : string){
    this.ngZone.run(()=>{
      let floorplans : DropListFloorplan[] = <any>this.pixiElRef.dropdownData.floorplans
      let fpCode = floorplans.filter(fp=>fp.buildingCode == buildingCode && fp.defaultPerBuilding)[0]?.floorPlanCode
      fpCode = fpCode ? fpCode : floorplans.filter(fp=>fp.buildingCode == buildingCode)[0]?.floorPlanCode
      if(this.pixiElRef.arcsLocationTree){
        this.dataSrv.setSessionStorage('arcsLocationTree' , JSON.stringify(this.pixiElRef.arcsLocationTree))
      }
      if(fpCode){
        // console.log(this.pixiElRef.arcsLocationTree)
        this.pixiElRef.dropdownOptions.floorplans = this.dataSrv.getDropListOptions('floorplans' , this.pixiElRef.dropdownData.floorplans , {buildingCode : buildingCode})
        this.loadFloorPlan(fpCode) 
      }else{
        this.uiSrv.showNotificationBar(`No available floor plans found for the selected building [${buildingCode}]`)
      }
    })
  }

  async getDefaultFloorPlanCode(){
    if(this.dataSrv.getSessionStorage('dashboardFloorPlanCode')){
      return this.dataSrv.getSessionStorage('dashboardFloorPlanCode')
    }
    let defaultBuilding = this.dataSrv.arcsDefaultBuilding
    let floorPlans : DropListFloorplan[] = <any>((await this.dataSrv.getDropList('floorplans')).data)
    let floorPlanCode = floorPlans.filter(f=>(f.buildingCode == defaultBuilding || !defaultBuilding ) && f.defaultPerBuilding)[0]?.floorPlanCode
    floorPlanCode = floorPlanCode ? floorPlanCode : floorPlans.filter(f=> f.buildingCode == defaultBuilding || !defaultBuilding )[0]?.floorPlanCode
    return floorPlanCode
  }
 

  async loadFloorPlan(code = null) {
    let ticket = this.uiSrv.loadAsyncBegin()
    code = code ? code :  await this.getDefaultFloorPlanCode()
    if(!code){
      this.pixiElRef.overlayMsg = this.uiSrv.translate("No floorplan records found.")
      this.uiSrv.loadAsyncDone(ticket)
      return 
    }
    let floorplan = await this.dataSrv.getFloorPlanV2(code);
    if(floorplan?.floorPlanCode){
      this.dataSrv.setSessionStorage('dashboardFloorPlanCode', floorplan.floorPlanCode);  
    }
    await this.pixiElRef.loadFloorPlanDatasetV2(floorplan, true, true);
    this.selectedFloorPlanCode = floorplan.floorPlanCode
    // console.log([... new Set(floorplan.mapList.map(m => m.mapCode))])
    this.pixiElRef.subscribeRobotsPose_ARCS([... new Set(floorplan.mapList.map(m => m.mapCode))])
    this.floorPlanFilter = floorplan.floorPlanCode
    await this.refreshTaskInfo()
    await this.refreshRobotStatus()
    this.uiSrv.loadAsyncDone(ticket)
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

  async refreshTaskInfo() {
    let data: RobotTaskInfoARCS[] = await this.dataSrv.httpSrv.rvRequest('GET', 'task/v1/taskInfo' + this.getStatusListUrlParam(), undefined, false)
    //    data = [
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "TEST",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "DUMMY-1",
    //   },
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "5W_0429",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "DUMMY-2",
    //   },
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "5W_0429",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "DUMMY-3",
    //   },
    // ]
    
    this.addAndRemoveRobotInfos(data)

    this.robotInfos.forEach(i=>{
      let robot = data.filter(t=>t.robotCode == i.robotCode)[0]
      i.robotType = robot ?.robotType
      i.floorPlanCode = robot?.floorPlanCode
      i.waitingTaskCount = robot?.waitingTaskCount 
      i.completedTaskCount = robot?.completedTaskCount
    })

    this.robotTypeInfos.forEach(i=>{
      i.executingTaskCount = data.filter(t=>t.robotType == i.robotType).reduce((acc, i)=>  acc += i.executingTaskCount , 0)
      i.completedTaskCount = data.filter(t=>t.robotType == i.robotType).reduce((acc, i)=>  acc += i.completedTaskCount , 0)
    })    
    this.executingTaskCount = data.map(t=> t.executingTaskCount ).reduce((acc, i)=>  acc += i , 0)
    this.totalTaskCount =  data.map(t=> t.executingTaskCount + t.completedTaskCount).reduce((acc, i)=>  acc += i , 0)
    if(this.pixiElRef && this.pixiElRef.arcsLocationTree.currentLevel == 'site'){
      this.refreshBuildingRobotCountTag((<any>data))
    }
  }

  async refreshRobotStatus(){
    let data : RobotStatus[] = await this.dataSrv.httpSrv.rvRequest('GET','robot/v1/robotInfo' + this.getStatusListUrlParam(), undefined, false) //TBR : add query param : robot type & floorplan Code 
    // data = [
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-1",
    //     floorPlanCode: "TEST",
    //     robotStatus: "EXECUTING"
    //   },
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-2",
    //     floorPlanCode: "5W_0429",
    //     robotStatus: "EXECUTING"
    //   },
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-3",
    //     floorPlanCode: "5W_0429",
    //     robotStatus: "EXECUTING"
    //   }
    // ]  
    this.addAndRemoveRobotInfos(data)  

    let robotStatusCssClassMap = {
      IDLE : 'idle',
      EXECUTING : 'working',
      CHARGING: 'charging',
      UNKNOWN : 'offline',
      HOLD : 'reserved'
    }
    
    this.robotInfos.forEach(i=>{
      let robot = data.filter(t=>t.robotCode == i.robotCode)[0]
      i.robotType = robot ?.robotType
      i.robotStatus = robot?.robotStatus
      i.floorPlanCode = robot?.floorPlanCode
      i.robotStatusCssClass =  robotStatusCssClassMap[robot?.robotStatus]
      i.alert = (robot.eStopped ? [this.uiSrv.commonAlertMessages.eStopped] :[]).concat(robot.obstacleDetected ? [this.uiSrv.commonAlertMessages.obstacleDetected] :[]).concat(robot.tiltDetected ? [this.uiSrv.commonAlertMessages.tiltDetected] :[]).join(" ,\n")
    })    

    let alerted = (s : RobotStatus)=> s.obstacleDetected || s.eStopped || s.tiltDetected
    this.robotTypeInfos.forEach(i => {
      i.idleCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'IDLE').length
      i.processCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'EXECUTING').length
      i.chargingCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'CHARGING').length
      i.offlineCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'UNKNOWN').length
      i.reservedCount = data.filter(s => !alerted(s) && s.robotType == i.robotType && s.robotStatus == 'HOLD').length
      i.alertCount = data.filter(s => alerted(s)).length
    })    
    
    data.forEach(d=>{
      let robot : Robot = this.pixiElRef?.robots.filter(r=>r.id == d.robotCode)[0]
      if(robot){
        robot.offline = d.robotStatus == "UNKNOWN"
        robot.alert = alerted(d)
      }
    })

    this.activeRobotCount = data.filter(s=>s.robotStatus != 'UNKNOWN').length
    this.totalRobotCount = data.length
    if(this.pixiElRef &&  this.pixiElRef.arcsLocationTree.currentLevel == 'site'){
      this.refreshBuildingRobotCountTag(<any>data)
    }
  }

  showTaskDetail(evt = null){
    let dialog : DialogRef = this.uiSrv.openKendoDialog({content: this.selectedTab == 'schedule'? ArcsTaskScheduleComponent : CmTaskJobComponent , preventAction:()=>true});
    const content = dialog.content.instance;
    content.dialogRef = dialog
    if(this.selectedTab != 'schedule'){
      content.isTemplate = this.selectedTab == 'template' 
      content.isExecuteTemplate = evt?.column == 'execute'
      content.readonly = this.selectedTab == 'task' && content.id != null;
    }
    content.parent = this
    content.parentRow = evt?.row
    dialog.result.subscribe(()=>{
      this.tableRef.retrieveData()
    })
  }

  async cancelTask(evt){
    var taskId = evt?.['row']?.['taskId']
    if(await this.uiSrv.showConfirmDialog(this.uiSrv.translate("Are you sure to cancel task") + ` ${evt?.['row']?.['name']} [${taskId}] ?` )){
      let ticket = this.uiSrv.loadAsyncBegin()
      await this.httpSrv.rvRequest('DELETE' , 'task/v1/task/' + taskId , undefined, true , this.uiSrv.translate("Cancel Task") + ` [${taskId}]`)
      this.tableRef?.retrieveData()
      this.uiSrv.loadAsyncDone(ticket)
    }
  }

  async delete(){
    if (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))) {
      return
    }
    let urlMapping = {
      template: 'api/task/mission/v1' ,
      schedule: 'api/task/schedule/v1' ,
    }
   
    let resp = await this.dataSrv.deleteRecordsV2(urlMapping[this.selectedTab] ,   this.data.filter(r => r['select'] == true))
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
    const content = dialog.content.instance;
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
