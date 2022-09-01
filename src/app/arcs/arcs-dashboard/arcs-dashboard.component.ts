import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, PixiCommon } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService, DropListBuilding, DropListFloorplan, DropListType, FloorPlanDataset, RobotStatusARCS as RobotStatus, RobotTaskInfoARCS, ShapeJData } from 'src/app/services/data.service';
import { Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { skip, takeUntil } from 'rxjs/operators';
import { BehaviorSubject, Subject } from 'rxjs';
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
} 

type robotInfo = { //A group can be an individual robot (when filtered by robot type) OR robot type (no filter applied) 
  robotType : string
  floorPlanCode : string
  robotCode: string
  waitingTaskCount? : number | null
  completedTaskCount? : number | null
  robotStatus : string
  robotStatusCssClass? : string
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
      { id: 'usability', label: 'Usability', authorized: false }
    ]

  }
  tabs = []

  columnDef = [ ]
  robotDetailId = null
  $onDestroy = new Subject()
  floorPlanFilter = null
  selectedFloorPlanCode
  
  constructor(  private util :GeneralUtil , private authSrv : AuthService , private httpSrv : RvHttpService, public uiSrv : UiService , private dataSrv : DataService, private router : Router ) {
  
    // this.chartTesting()
    this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(t.functionId))
    this.selectedTab = 'dashboard'
    this.dataSrv.subscribeSignalRs(['arcsRobotStatusChange' , 'arcsTaskInfoChange'])
    this.dataSrv.signalRSubj.arcsRobotStatusChange.pipe(skip(1), takeUntil(this.$onDestroy)).subscribe((c)=>{
      if(( !this.floorPlanFilter || c?.floorPlanCode == this.floorPlanFilter ) && (!this.robotTypeFilter || c?.robotType == this.robotTypeFilter?.toUpperCase())){
        this.refreshRobotStatus()
      }
      if(this.robotDetailCompRef){
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
  }

  ngOnDestroy(){
    this.$onDestroy.next()
    this.dataSrv.unsubscribeSignalRs(['arcsRobotStatusChange' , 'arcsTaskInfoChange'])
  }
  
  async ngOnInit(){
    // let robotList = <any>(await this.dataSrv.getDropList('robots')).data
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
    this.robotTypeFilter = this.router.url == '/home' ? null : this.router.url.replace('/', '')
    this.tabs = this.getTabs()
    this.gridSettings = this.getGridSettings()
    // for(let i = 2000 ; i < new Date().getFullYear() ; i ++){
    //   this.dropdownOptions.years.push({value : i , text: i.toString()})
    // }
  }

  async ngAfterViewInit() {
    this.initPixi()
  }

  async initPixi() {
    let ticket = this.uiSrv.loadAsyncBegin()
    setTimeout(async () => {
      this.pixiElRef.initDone$.subscribe(async () => {
        this.loadFloorPlan()
        this.uiSrv.loadAsyncDone(ticket)
      })
    })
  }

  async getDefaultFloorPlanCode(){
    if(sessionStorage.getItem('dashboardFloorPlanCode')){
      return sessionStorage.getItem('dashboardFloorPlanCode')
    }
    let defaultBuilding = this.dataSrv.arcsDefaultBuilding
    let floorPlans : DropListFloorplan[] = <any>((await this.dataSrv.getDropList('floorplans')).data)
    let floorPlanCode = floorPlans.filter(f=>(f.buildingCode == defaultBuilding || !defaultBuilding ) && f.defaultPerBuilding)[0]?.floorPlanCode
    floorPlanCode = floorPlanCode ? floorPlanCode : floorPlans.filter(f=> f.buildingCode == defaultBuilding || !defaultBuilding )[0]?.floorPlanCode
    return floorPlanCode
  }

  async loadFloorPlan(code = null) {
    code = code ? code :  await this.getDefaultFloorPlanCode()
    if(!code){
      this.pixiElRef.overlayMsg = this.uiSrv.translate("No floorplan records found.")
      return 
    }
    let floorplan = await this.dataSrv.getFloorPlanV2(code);
    sessionStorage.setItem('dashboardFloorPlanCode', floorplan.floorPlanCode);  
    await this.pixiElRef.loadFloorPlanDatasetV2(floorplan, true, true);
    this.selectedFloorPlanCode = floorplan.floorPlanCode
    this.pixiElRef.subscribeRobotsPose_ARCS([... new Set(floorplan.mapList.map(m => m.mapCode))])
    this.floorPlanFilter = floorplan.floorPlanCode
    this.refreshTaskInfo()
    this.refreshRobotStatus()
  }

  refreshRobotIconColorMap(){
    for(let i = 0 ; i <this.robotInfos.length ; i++){
      let idx = 0
      if(this.robotTypeFilter){
        idx = this.robotTypeInfos.indexOf(this.robotTypeInfos.filter(t => t.robotType == this.robotInfos[i].robotType)[0])
      }else{
        idx = i 
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
                            {return {robotType : t , name : this.dropdownData.types.filter((d:DropListType)=> d.enumName == t)[0]?.description , executingTaskCount: 0, completedTaskCount: 0, processCount: 0, chargingCount : 0,idleCount : 0, offlineCount : 0}})
                          )
    this.refreshRobotIconColorMap()
  }

  getStatusListUrlParam(){
    let ret =  (this.robotTypeFilter ? [`robotType=${this.robotTypeFilter.toUpperCase()}`]: []).concat(this.selectedFloorPlanCode? [`floorPlanCode=${this.selectedFloorPlanCode}`] : []).join("&")
    return ret = ''? '' : '?' + ret
  }

  async refreshTaskInfo() {
    let data: RobotTaskInfoARCS[] = await this.dataSrv.httpSrv.rvRequest('GET', 'task/v1/taskInfo' + this.getStatusListUrlParam(), undefined, false)
    //    data = [
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "HKAA-L5",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "DUMMY-1",
    //   },
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "HKAA-L5",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "DUMMY-2",
    //   },
    //   {
    //     robotType: "PATROL",
    //     floorPlanCode: "HKAA-L5",
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
  }

  async refreshRobotStatus(){
    let data : RobotStatus[] = await this.dataSrv.httpSrv.rvRequest('GET','robot/v1/robotInfo' + this.getStatusListUrlParam(), undefined, false) //TBR : add query param : robot type & floorplan Code 
    // data = [
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-1",
    //     floorPlanCode: "HKAA-L5",
    //     robotStatus: "EXECUTING"
    //   },
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-2",
    //     floorPlanCode: "HKAA-L5",
    //     robotStatus: "EXECUTING"
    //   },
    //   {
    //     robotType: "PATROL",
    //     robotCode: "DUMMY-3",
    //     floorPlanCode: "HKAA-L5",
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
    })    

  
    this.robotTypeInfos.forEach(i=>{
      i.idleCount = data.filter(s=>s.robotType == i.robotType && s.robotStatus == 'IDLE').length
      i.processCount = data.filter(s=>s.robotType == i.robotType && s.robotStatus == 'EXECUTING').length
      i.chargingCount = data.filter(s=>s.robotType == i.robotType && s.robotStatus == 'CHARGING').length
      i.offlineCount = data.filter(s=>s.robotType == i.robotType && s.robotStatus == 'UNKNOWN').length
      i.reservedCount = data.filter(s=>s.robotType == i.robotType && s.robotStatus == 'HOLD').length
    })    
    
    data.forEach(d=>{
      var robot = this.pixiElRef?.robots.filter(r=>r.id == d.robotCode)[0]
      if(robot){
        robot.offline = d.robotStatus == "UNKNOWN"
      }
    })

    this.activeRobotCount = data.filter(s=>s.robotStatus != 'UNKNOWN').length
    this.totalRobotCount = data.length
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
    dialog.result.subscribe(()=> this.loadData())
  }

  async loadData(evt = null) {
    this.tableRef?.retrieveData()
    // this.uiSrv.loadAsyncDone(ticket)
  }

  // onRobotClicked(evt){
  //     this.robotDetailId = evt.id
  // }

    //  //20220805 DUMMY DATA
    //  data = [
    //   {
    //     robotType: "MOBILE_CHAIR",
    //     floorPlanCode: "HKAA-L5",
    //     executingTaskCount: 1,
    //     completedTaskCount: 5,
    //     waitingTaskCount: 1,
    //     robotCode: "MC01"
    //   },
    //   {
    //     robotType: "MOBILE_CHAIR",
    //     floorPlanCode: "HKAA-L5",
    //     executingTaskCount: 1,
    //     completedTaskCount: 3,
    //     waitingTaskCount: 0,
    //     robotCode: "MC02"
    //   },
    //   {
    //     robotType: "MOBILE_CHAIR",
    //     floorPlanCode: "HKAA-L5",
    //     executingTaskCount: 0,
    //     completedTaskCount: 10,
    //     waitingTaskCount: 0,
    //     robotCode: "MC03"
    //   },
    // ]
    // //20220805 DUMMY DATA

      // //20220805 DUMMY DATA
      // data = [
      //   {
      //     robotType: "MOBILE_CHAIR",
      //     robotCode: "MC01",
      //     floorPlanCode: "HKAA-L5",
      //     robotStatus: "EXECUTING"
      //   },
      //   {
      //     robotType: "MOBILE_CHAIR",
      //     robotCode: "MC02",
      //     floorPlanCode: "HKAA-L5",
      //     robotStatus: "EXECUTING"
      //   },
      //   {
      //     robotType: "MOBILE_CHAIR",
      //     robotCode: "MC03",
      //     floorPlanCode: "HKAA-L5",
      //     robotStatus: "IDLE"
      //   }
      // ]
      // //20220805 DUMMY DATA
  
  // async loadSite(){ //Consider To move this into drawingBoardComponent
  //   let ticket = this.uiSrv.loadAsyncBegin()
  //   this.pixiElRef.reset()
  //   // this.pixiElRef.selectedStyle.polygon.color = this.util.dbConfig['mapBrushs'].filter(r => r['lineType'] && r['lineType'].startsWith('zone')).map(r => r['fillColor'])[0]
  //   // this.pixiElRef.selectedStyle.polygon.opacity = 0.8
  //   // let sites = await this.dataSrv.httpSrv.get('api/locations/site/v1')
  //   let siteData = await this.dataSrv.httpSrv.get('api/locations/site/v1/active')
  //   if(siteData.length == 0){
  //     this.loadFloorPlan()
  //     return
  //   }
  //   // let planData : FloorPlanDataset = await this.dataSrv.getFloorplanFullDs(86)  //testing
  //    this.pixiElRef.arcsObjs.hierarchy = { site: { id: siteData['locationId'], name: siteData['locationName'] }, building: { id: null, name: null } } // testing
  //   if (siteData.imgSrc) {
  //     // await this.pixiElRef.loadToMainContainer(planData.floorPlan.imgSrc)
  //     await this.pixiElRef.loadToMainContainer(siteData.imgSrc)
  //     this.pixiElRef.defaultPos = {
  //       x: siteData['defaultX'],
  //       y: siteData['defaultY'],
  //       zoom : siteData['defaultZoom']
  //     }
  //     this.pixiElRef.setViewportCamera( this.pixiElRef.defaultPos.x ,  this.pixiElRef.defaultPos.y  , this.pixiElRef.defaultPos.zoom)
  //     this.pixiElRef.loadShapes((await this.dataSrv.httpSrv.get('api/locations/site/v1/shape'))['shapes'])
  //   }
  //   this.uiSrv.loadAsyncDone(ticket)
  // }


  // public onSelectEnd(args: any): void {
  //   // set the axis range displayed in the main pane to the selected range
  //   this.chartObj.dailyQty.min = args.from;
  //   this.chartObj.dailyQty.max = args.to;
  //   // stop the animations
  //   this.chartObj.dailyQty.transitions = false;
  // }


  // chartObj = {
  //   textColor : '#FFFFFF',
  //   style:{
  //     seriesColors: this.util.getConfigColors()
  //   },
  //   robotUtil:{
  //     labelContent:(arg : LegendLabelsContentArgs)=> arg.value > 0 ? arg.value + '%' : '',
  //     categories:['R01-1','R01-2','R01-3','R01-4','R02-1','R02-2','R02-3','R02-4', 'R03-1','R03-2','R03-3','R03-4'],
  //     data:{
  //       operating:[],
  //       charging:[],
  //       downtime:[]
  //     }
  //   },
  //   avgUtil:{
  //     categories:[],
  //     data:{
  //       operating:[],
  //       charging:[],
  //       downtime:[]
  //     }
  //   },
  //   type:{
  //     // labelContent : (args: LegendLabelsContentArgs) => {
  //     //   return `${args.dataItem.category} \n ${(args.percentage * 100).toFixed(2)}%`;
  //     // },
  //     labelVisual:(arg: SeriesLabelsVisualArgs ) => {
  //       let ret = arg.createVisual();
  //       let mainText = (<Group>ret).children.filter(c=>typeof c?.['chartElement'] === typeof new Text(undefined,undefined))[0]; //(c?.['chartElement']) instanceof Text
  //       (<Text>mainText).content(arg.dataItem.category);
  //       (<Group>ret).remove((<Group>ret).children.filter(c=>typeof c?.['Path'])[0])
  //       let subText = new Text((arg.percentage * 100).toFixed(2) + '%', [(<Text>mainText).position().x, (<Text>mainText).position().y + 15] ,{font: `10px Arial`,fill:{color:'#BBBBBB'}});
  //       (<Group>ret).append(subText)
  //       return ret;
  //     },
  //     data:[
  //       {category:'Disinfection' ,value :2611},
  //       {category:'Delivery' ,value :4496},
  //       {category:'RFID' ,value :852},
  //       {category:'Patrol' ,value :2691},
  //     ],
  //     centerText:'10,650 \n Orders'
  //   },
  //   hourlyAvg:{
  //     data:[],
  //   },
  //   dailyQty : {
  //     data:[],
  //     categories:[],
  //     transitions:false,
  //     navigatorStep: 365/12,
  //     min: 0,
  //     max: 0
  //   }
  // }


  // chartTesting(){
  //   for(let i = 0; i< 24 ; i++){
  //     this.chartObj.hourlyAvg.data.push(Math.floor(Math.random() * 15))
  //   }
  //   let date = new Date(2021,0,1);
  //   for (let i = 0; i < 365; i++) {
  //     this.chartObj.dailyQty.categories.push(date);
  //     this.chartObj.dailyQty.data.push(Math.floor(Math.random() * 200));
  //     if(i <= 40){
  //       this.chartObj.avgUtil.categories.push(date)
  //       this.chartObj.avgUtil.data.operating.push(Math.floor(Math.random() * 75))
  //       this.chartObj.avgUtil.data.charging.push(Math.floor(Math.random() * 20))
  //       this.chartObj.avgUtil.data.downtime.push(Math.floor(Math.random() * 5))
  //     }
  //     let newDate = new Date()
  //     newDate.setTime(date.getTime() + 86400000)
  //     date = newDate
  //   }
  //   this.chartObj.dailyQty.min = this.chartObj.dailyQty.categories[0]
  //   this.chartObj.dailyQty.max = this.chartObj.dailyQty.categories[Math.min(31,this.chartObj.dailyQty.categories.length - 1)]
  //   this.chartObj.dailyQty.navigatorStep = Math.floor(this.chartObj.dailyQty.categories.length / 12);
  //   this.chartObj.robotUtil.categories.forEach(c => {
  //     this.chartObj.robotUtil.data.operating.push(Math.floor(Math.random() * 75))
  //     this.chartObj.robotUtil.data.charging.push(Math.floor(Math.random() * 20))
  //     this.chartObj.robotUtil.data.downtime.push(Math.floor(Math.random() * 5))
  //   });
  // }
}
