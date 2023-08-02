import { Text, Group } from "@progress/kendo-drawing";
import { ChartComponent, HighlightVisualArgs, LegendLabelsContentArgs, SeriesClickEvent, SeriesLabelsVisualArgs, SeriesVisualArgs, AxisLabelVisualArgs, SeriesHoverEvent, LegendItemHoverEvent } from '@progress/kendo-angular-charts';
import { ChangeDetectorRef, Component, NgZone, OnInit, Input, ViewChild, ElementRef, TemplateRef, OnDestroy, HostListener } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';
import { ARCS_STATUS_MAP, DropListBuilding, DropListFloorplan, DropListRobot, DropListType, FloorPlanDataset, JFloorPlan, RobotStatusARCS as RobotStatus, ShapeJData } from 'src/app/services/data.models';
import { Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { skip, takeUntil, filter, take } from 'rxjs/operators';
import { BehaviorSubject, from, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { mixin } from "pixi-viewport";
import { TooltipDirective } from "@progress/kendo-angular-tooltip";
import { DatePipe } from '@angular/common'
import { Template } from "@angular/compiler/src/render3/r3_ast";
import { ArcsAbnormalTasksComponent } from "./arcs-abnormal-tasks/arcs-abnormal-tasks.component";
import { LegendItemClickEvent } from "@progress/kendo-angular-charts";
import { type } from "os";
import { PixiEventMarker, PixiWayPoint, PixiWayPointBubble } from "src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics";
import * as PIXI from 'pixi.js';

const Utilization_Status_Types = ['executing', 'idle', 'charging', 'hold', 'unknown']
@Component({
  selector: 'app-arcs-charts',
  templateUrl: './arcs-charts.component.html',
  styleUrls: ['./arcs-charts.component.scss']
})

export class ArcsChartsComponent implements OnInit, OnDestroy {
  @ViewChild('navigatorChart') navigatorChart: ChartComponent
  // @ViewChild('obstacleWaypointScatter') waypointObstacleChart : ChartComponent
  @ViewChild('floorplanObstacle') floorplanObstacleChart: ChartComponent
  @ViewChild('tooltipFr') tooltipFr: TooltipDirective
  @ViewChild('tooltipTo') tooltipTo: TooltipDirective
  @ViewChild('frDateTpl') frDateTpl: TemplateRef<any>
  @ViewChild('toDateTpl') toDateTpl: TemplateRef<any>
  @ViewChild('usabilityByRobotChart') usabilityByRobotChart: ChartComponent
  @ViewChild('usabilityByRobotTypeChart') usabilityByRobotTypeChart: ChartComponent
  @ViewChild('utilizationByRobotChart') utilizationByRobotChart: ChartComponent
  @ViewChild('utilizationByRobotTypeChart') utilizationByRobotTypeChart: ChartComponent
  @ViewChild('utilizationByHourChart') utilizationByHourChart: ChartComponent
  @ViewChild('pixi') pixiRef : Map2DViewportComponent
  @ViewChild('detectionByFloorplanChart') detectionByFloorplanChart : ChartComponent
  @ViewChild('detectionByTypeChart') detectionByTypeChart : ChartComponent

  frDateTplView


  robotTypePipe = (e: AxisLabelVisualArgs) => {
    return this.uiSrv.translate(this.dataSrv.enumPipe.transform(e.value))
  }
  @Input() set chartType(t) {
    let orginalType = this._chartType
    this._chartType = t
    if (orginalType) {
      this.ngAfterViewInit()
    }
  }
  _chartType: "usability" | "utilization" | "detection"
  get chartType() {
    return this._chartType
  }
  year = new Date().getFullYear()
  location
  dropdownData = { types: [], robots: [] , floorplans : []}
  dropdownOptions = {
    types: [],
    robots: [],
    years: [{ value: this.year, text: this.year.toString() }],
    locations: [],
    floorplans : [],
    waypoint : []
  }

  detection : {
    total : {
      count : number,
      waypoint1 : any,
      waypoint2 : any,
      waypoint3 : any,
    },
    detectionType: {
      data: any[],
      centerText: string
    },
    waypoint: {
      selected: string,
      labelContent: any,
      maxY: number,
      minX: number,
      minY: number,
      maxX: number,
      data: any[],
    },
    daily: {
      min: Date,
      max: Date,
      navigatorStep: number,
      transitions: boolean,
      categories: any[],
      data: any[],
    },
    events: {
      data: any[]
    },
    floorplan :{
      centerText: string,
      selected: string,
      categories : any[],
      data: any[]
    }
    // hourlyAvg: {
    //   selected: null,
    //   categories: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
    //   data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // }
  }
  
  usability : {
    total: number,
    completed: number,
    canceled: number,
    incomplete: number,
    robotType: {
      data: any[],
      centerText: string
    },
    hourlyAvg: {
      categories : any[],
      data: number[],
    },
    weeklyAvg: {
      categoriesMap: {},
      categories: any[],
      data: number[]
    },
    daily: {
      data: number[],
      categories: any[],
      transitions: boolean,
      navigatorStep: number,
      min: any,
      max: any
    },
    robot : {
      data: number[],
      categories: any[],
    }
  }

  usabilityData : { type : 'COMPLETED' | 'CANCELED' | 'INCOMPLETE' | 'DAILY' | 'HOURLY_AVG' | 'WEEKLY_AVG' | 'ROBOT_TYPE' | 'ROBOT' , category? : string , value? : number }[] = []
  utilizationData: { type: 'ROBOT' | 'DAILY' | 'ROBOT_TYPE' , category? : string , charging : number , idle : number , executing : number , hold : number , unknown : number , total: number}[] = []
  detectionData : { type : 'DAILY' | 'FLOOR_PLAN' | 'DETECTION_TYPE' | 'JSON' , category? : string  , value? : string }[]

  utilization : {
    statuss : string[],
    statusLabel : any,
    statusVisible : any,
    totalRobotHours : number,
    totalExecutingHours : number,
    daily: {
      categories:any[],
      transitions: boolean,
      navigatorStep: number,
      data:{
        charging:any[],
        idle:any[],
        executing:any[],
        hold: any[],
        unknown: any[],
      }
      min: any,
      max: any,
    },
    robotType: {
      labelContent: any //(arg : LegendLabelsContentArgs)=> arg.value > 0 ? arg.value + '%' : '',
      categories: any[],
      robotTypes : any[],
      data: {
        charging: any[],
        idle: any[],
        executing:any[],
        hold:any[],
        unknown: any[],
      }
    },
    robot: {
      categories : string[]
      data:{
        charging:any[],
        idle:any[],
        executing:any[],
        hold: any[],
        unknown: any[],
      }
    },
    hourly : {
      categories : string[]
      data:{
        charging:any[],
        idle:any[],
        executing:any[],
        hold: any[],
        unknown: any[],
      }
    },
    total: {
      type1: {
        robotType: string,
        executing: number,
        total : number
      },
      type2: {
        robotType: string,
        executing: number,
        total : number
      },
      type3: {
        robotType: string,
        executing: number,
        total : number
      }
    }
  }
  
  dateRangeToolTip = {
    from : {
      handleEl: null,
      content : null
    },
    to : {
      handleEl: null,
      content : null
    }
  }

  robotTypeFilter = null
  robotCodeFilter = null
  floorPlanCodeFilter = null
  detectionTypeFilter = null
  hightlightedSeriesIndex = null
  $onDestroy = new Subject()

  constructor(public datepipe: DatePipe ,  private util :GeneralUtil , public uiSrv : UiService , private dataSrv : DataService ) {
    this.uiSrv.lang.pipe( filter(v=>v!=null) ,takeUntil(this.$onDestroy)).subscribe(l=>{
      this.refreshTranslation()
    })
  }


  refreshTranslation() {
    if (this.usability?.robotType?.data) {
      this.usability.robotType.data = JSON.parse(JSON.stringify(this.usability.robotType.data))
    }
    if(this.utilization?.robotType?.data){
      this.utilization.robotType.data = JSON.parse(JSON.stringify(this.utilization.robotType.data))
    }
  }

  onSeriesClick(evt : SeriesClickEvent){
    if (evt.sender == this.usabilityByRobotTypeChart || evt.sender == this.utilizationByRobotTypeChart) {
      this.robotTypeFilter = evt.category == this.robotTypeFilter ? null : evt.category
      this.robotCodeFilter = null
      this.refreshRobotOptions()
      this.refreshChart()
    }else if (evt.sender == this.usabilityByRobotChart || evt.sender == this.utilizationByRobotChart){
      this.robotCodeFilter = evt.category ==  this.robotCodeFilter ? null : evt.category
      this.refreshRobotTypeFilter()
      this.refreshChart()
    } 
    // else if (evt.sender == this.floorplanObstacleChart && this.detection.floorplan.selected != evt.category) {
    //   this.detection.floorplan.selected = evt.category
    //   this.detection.waypoint.selected = null
    //   this.refreshDetection()
    // }
  }

  setHighlightedSeriesIndex( seriesIndex){
    this.hightlightedSeriesIndex = seriesIndex
    if(this.chartType == 'utilization'){
      this.utilization.robotType.data = JSON.parse(JSON.stringify( this.utilization.robotType.data))
      this.utilization.robot.data = JSON.parse(JSON.stringify( this.utilization.robot.data))
      this.utilization.hourly.data = JSON.parse(JSON.stringify( this.utilization.hourly.data))
    }
  }

  onLegendClick(e: LegendItemClickEvent): void {
    if(this.chartType == 'utilization' && e.sender == this.navigatorChart){
      this.utilization.statusVisible[this.utilization.statuss[e.seriesIndex]] = !e.series.visible
    }
  }

  showAbnormalTasks(id : 'failed' | 'canceled'){
    //Pending : check access right for tasks
    let dialog : DialogRef = this.uiSrv.openKendoDialog({content: ArcsAbnormalTasksComponent , preventAction:()=>true});
    const content :ArcsAbnormalTasksComponent = dialog.content.instance;
    content.dialogRef = dialog
    content.fromDate = new Date(this.getSelectedDateRange().fromDate.getTime())
    content.toDate = new Date(this.getSelectedDateRange().toDate.getTime() - 86400000)
    content.total = id == 'failed' ? this.usability.incomplete : this.usability.canceled
    content.robotType = this.robotTypeFilter
    content.robotCode = this.robotCodeFilter
    content.parent = this
    content.taskState = id
    // content.parentRow = evt?.row
    // dialog.result.subscribe(()=>{
    // })
  }


  async ngOnInit() {
    // this.init()
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  async ngAfterViewInit() {
    this.robotTypeFilter = null
    this.robotCodeFilter = null
    let ticket = this.uiSrv.loadAsyncBegin()
    this.year = new Date().getFullYear()
    await this.initDropDown()
    this.initUsability()
    this.initUtilization()
    this.initDetection()
    let frDate = null , toDate = null
    if(this.chartType == 'utilization' && new Date().getMonth()!= 0){
      toDate = new Date() 
      frDate = toDate.getMonth() == 0 ? new Date(toDate.getFullYear(), 0, 1) : new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
      frDate.setMonth(frDate.getMonth() - 1);
    }
    this.setDateRange(frDate , null)
    await this.refreshChart()
    this.uiSrv.loadAsyncDone(ticket)
  }

  refreshRobotTypeFilter(){
    let robotType = (<DropListRobot>this.dropdownData.robots.filter((r:DropListRobot)=>r.robotCode == this.robotCodeFilter)[0])?.robotType
    this.robotTypeFilter = robotType ? robotType : this.robotTypeFilter 
  }

  refreshRobotOptions(){
    this.dropdownOptions.robots = this.dataSrv.getDropListOptions('robots' , this.dropdownData.robots , this.robotTypeFilter ? {robotType :this.robotTypeFilter} : undefined) 
  }

  getSelectedDateRange(){
    let fr = null
    let to = null
    if(this._chartType == 'usability'){
      fr = this.usability?.daily?.min
      to = this.usability?.daily?.max
    }else if(this._chartType == 'utilization'){
      fr = this.utilization?.daily?.min
      to = this.utilization?.daily?.max
    }else if(this._chartType == 'detection'){
      fr = this.detection?.daily?.min
      to = this.detection?.daily?.max
    }
    return {fromDate : fr , toDate : to}
  }

  public async onSelectStart(){
    this.tooltipFr.template = this.frDateTpl
    this.tooltipTo.template = this.toDateTpl
    this.dateRangeToolTip.from.handleEl = this.navigatorChart.surfaceElement.nativeElement.getElementsByClassName("k-left-handle")[0]
    this.dateRangeToolTip.to.handleEl = this.navigatorChart.surfaceElement.nativeElement.getElementsByClassName("k-right-handle")[0]
    this.tooltipFr.show(this.dateRangeToolTip.from.handleEl)
    this.tooltipTo.show(this.dateRangeToolTip.to.handleEl)
  }

  public async onSelect(evt){
    this.dateRangeToolTip.from.content = this.datepipe.transform(evt.from , 'dd MMM')
    this.dateRangeToolTip.to.content  = this.datepipe.transform(evt.to.getTime() - 86400000 , 'dd MMM')
    // this.tooltipTo.popupRef.popupElement.innerHTML = this.toDateDragHandleEl.title 
  }

  public async onSelectEnd(args: any) {
    this.tooltipFr.hide()
    this.tooltipTo.hide()
    // set the axis range displayed in the main pane to the selected range
    if(this.chartType == 'usability'){
      this.usability.daily.min = args.from;
      this.usability.daily.max = args.to;
      this.usability.daily.transitions = false;
    }else if(this.chartType == 'utilization'){
      this.utilization.daily.min = args.from;
      this.utilization.daily.max = args.to;
      this.utilization.daily.transitions = false;
    }else if(this.chartType == 'detection'){
      this.detection.daily.min = args.from;
      this.detection.daily.max = args.to;
      this.detection.daily.transitions = false;
    }
    this.refreshChart()
  }

  style = {
    dimOpacity : 0.3 ,
    textColor : '#FFFFFF',
    seriesColors: this.util.getConfigColors(),
    labelVisual : (arg: SeriesLabelsVisualArgs) => {
      if (!arg.sender) {
        return
      }
      let ret = arg.createVisual();
      let mainText = (<Group>ret).children.filter(c => typeof c?.['chartElement'] === typeof new Text(undefined, undefined))[0];
      if ([this.usabilityByRobotTypeChart, this.detectionByFloorplanChart , this.detectionByTypeChart].includes(arg.sender)) {        
        let content = [this.usabilityByRobotTypeChart , this.detectionByTypeChart].includes(arg.sender) ? this.dataSrv.enumPipe.transform(arg.dataItem.category) : arg.dataItem.category;
        (<Text>mainText).content(this.uiSrv.translate(content));
        let subTextContent = `${(arg.percentage * 100).toFixed(2)}%`;
        (<Group>ret).remove((<Group>ret).children.filter(c => typeof c?.['Path'])[0])
        let subText = new Text(subTextContent, [(<Text>mainText).position().x, (<Text>mainText).position().y + 15], { font: `11px Arial`, fill: { color: '#BBBBBB' } });
        (<Group>ret).append(subText)
      }else if(arg.sender == this.utilizationByRobotTypeChart){
        (<Text>mainText).content(this.uiSrv.translate(this.dataSrv.enumPipe.transform(arg.text)));
        (<Text>mainText).position([5 , (<Text>mainText).position().y])
      }else {
        (<Text>mainText).content(arg.value)
      }
      if(this.isDimmed(arg ,arg.sender == this.usabilityByRobotTypeChart?  undefined  : ( arg.sender == this.utilizationByRobotTypeChart? arg.text :(<Text>mainText).content()))){
        ret.options.set('opacity',  this.style.dimOpacity)
      }
      return ret;
    },    
    seriesVisual: (arg: SeriesVisualArgs) => {
      if (!arg.sender) {
        return
      }
      let ret = arg.createVisual();
      if (this.isDimmed(arg)) {
        ret.options.set('opacity', this.style.dimOpacity)
      }
      return ret;
    }
  }

  isDimmed(arg: SeriesVisualArgs | SeriesLabelsVisualArgs , checkValue = null) {
    checkValue = checkValue ? checkValue :  arg.category   
    let utilizationCharts = [this.utilizationByRobotChart , this.utilizationByRobotTypeChart , this.utilizationByHourChart]
    return (arg.sender == this.floorplanObstacleChart && this.detection.floorplan.selected && this.detection.floorplan.selected != checkValue) ||
           ([this.usabilityByRobotTypeChart , this.utilizationByRobotTypeChart].includes(arg.sender) && this.robotTypeFilter && checkValue!= this.robotTypeFilter) ||
           ((arg.sender == this.usabilityByRobotChart || arg.sender == this.utilizationByRobotChart ) && this.robotCodeFilter && checkValue != this.robotCodeFilter) || 
           (this.hightlightedSeriesIndex !== null && arg.series?.index != null && (utilizationCharts.includes(arg.sender)) && arg.series.index != this.hightlightedSeriesIndex )
  }


  async initDropDown(){
    let ddl = await this.dataSrv.getDropLists(['types' , 'robots', 'floorplans']);
    Object.keys(ddl.data).forEach(k=>{
      this.dropdownData[k] = ddl.data[k];
      this.dropdownOptions[k] = ddl.option[k];
    })
  }

  initYearDropDown(firstYear : number ){
    this.dropdownOptions.years = []
    for(let i = firstYear ; i <= new Date().getFullYear() ; i ++){
      this.dropdownOptions.years.push({value : i  , text : i.toString()})
    }
  }

  setDateRange(frDate = null , toDate = null) {
    this.usability.daily.min = frDate ? frDate : new Date(this.year, 0, 1)
    this.utilization.daily.min = frDate ? frDate : new Date(this.year, 0, 1)
    if(toDate != null){
      this.usability.daily.max = toDate
      this.utilization.daily.max = toDate
    }else if(this.year == new Date().getFullYear()){
      toDate = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())
      toDate.setDate(toDate.getDate() + 1)
      this.usability.daily.max = toDate
      this.utilization.daily.max = toDate
    } else {
      this.utilization.daily.max = new Date(this.year + 1, 0, 1)
      this.usability.daily.max = new Date(this.year + 1, 0, 1)
    }
  }

  async refreshChart() {
    // if(this.chartType == 'detection'){ //TBR !!!!!!!!!!!!!!!!!!
    //   this.refreshDetection()
    //   return 
    // }

    let toDate = new Date(this.getSelectedDateRange().toDate.getTime())
    toDate.setDate(toDate.getDate() - 1)
    await this.retreiveData(this.getSelectedDateRange().fromDate , toDate)
    if(this._chartType == 'usability'){
      this.fetchUsability() 
    }else if(this._chartType == 'utilization'){
      this.fetchUtilization() 
    }else if(this._chartType == 'detection'){
      this.fetchDetection() 
    }
  }

  async retreiveData( fromDate: Date , toDate: Date ) {
    // if(!['usability' , 'utilization'].includes(this.chartType)){
    //   this.initYearDropDown(Number(new Date().getFullYear()))
    //   return
    // }
    // fromDate = fromDate ? fromDate : this.getSelectedDateRange().fromDate
    // toDate = toDate ? toDate : this.getSelectedDateRange().toDate    
    // console.log(toDate)
    // toDate = new Date(toDate.getTime() - 86400000)
    let ticket = this.uiSrv.loadAsyncBegin()
    let frDateStr = this.util.getSQLFmtDateStr(fromDate)
    let toDateStr = this.util.getSQLFmtDateStr(toDate)
    let data = []
    let param = `?fromDate=${frDateStr}&toDate=${toDateStr}`
    let filters =   {
      robotType : this.robotTypeFilter,
      robotCode : this.robotCodeFilter,
      floorPlanCode : this.floorPlanCodeFilter,
      detectionType : this.detectionTypeFilter
    }
    Object.keys(filters).filter(k=>filters[k]!=null).forEach(k=>{
      param += `&${k}=${filters[k]}`
    }) 
    data = await this.dataSrv.httpSrv.get(`api/analytics/${this._chartType}/v1${param}`)
    if(this._chartType == 'usability'){
      this.usabilityData = JSON.parse(JSON.stringify(data))
    }else if(this._chartType == 'utilization'){
      this.utilizationData = JSON.parse(JSON.stringify(data))
      // if(isInit){
      //   let tmpDate = toDate.getMonth() == 0 ? new Date(toDate.getFullYear(), 0, 1) : new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
      //   tmpDate.setMonth(tmpDate.getMonth() - 1);
      //   this.onSelectEnd({ from: tmpDate, to: new Date(toDate.getTime() + 86400000) })
      // }
    }else if(this._chartType == 'detection'){
      this.detectionData = JSON.parse(JSON.stringify(data))
    }
    let firstYear = data.filter(r=>r.type == 'FIRST_YEAR')[0]?.category
    if(firstYear){
      this.initYearDropDown(Number(firstYear))
    }
    this.uiSrv.loadAsyncDone(ticket)
  }
  
  initUtilization() {
    this.utilization = {
      statuss : Utilization_Status_Types,
      statusLabel : {},
      statusVisible :  this.utilization?.statusVisible? JSON.parse(JSON.stringify( this.utilization?.statusVisible)) : {},
      totalRobotHours: 0,
      totalExecutingHours : 0,
      daily: {
        transitions: true,
        navigatorStep: 30,
        categories: [],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: [],
          unknown:[]
        },
        min: this.getSelectedDateRange()?.fromDate,
        max: this.getSelectedDateRange()?.toDate
      },
      robot:{
        categories: [],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: [],
          unknown:[]
        }
      },
      hourly: {
        categories : ['0','1','2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22','23'],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: [],
          unknown:[]
        },
      },
      robotType: {
        robotTypes : [],
        labelContent: (arg: LegendLabelsContentArgs) => arg.value > 0 ? arg.value + '%' : '',
        categories: [],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: [],
          unknown:[]
        }
      },
      total: {
        type1:{
          robotType: null,
          executing: 0,
          total: 0
        },
        type2:{
          robotType: null,
          executing: 0,
          total: 0
        },
        type3:{
          robotType: null,
          executing: 0,
          total: 0
        }
        
      }
    }
    this.utilization.statuss.forEach(s=>{
      this.utilization.statusLabel[s] = ARCS_STATUS_MAP[s.toUpperCase()]
      this.utilization.statusVisible[s] = this.utilization.statusVisible?.[s] == false ? false : true
    }) 
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ?  new Date() : new Date(this.year + 1 , 0 , 1) 
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear + 1; i++) {
      this.utilization.daily.categories.push(date);
      Utilization_Status_Types.forEach(t=>{
        this.utilization.daily.data[t].push(0);
      })
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    //this.utilization.daily.min =  this.getSelectedDateRange().fromDate //fromDate ? fromDate : this.utilization.daily.categories[0]
    //this.utilization.daily.max =  this.getSelectedDateRange().toDate //toDate ? toDate : this.utilization.daily.categories[ this.utilization.daily.categories.length - 1]
    this.utilization.daily.categories.pop()
    //this.utilization.daily.navigatorStep = 30// Math.floor(this.utilization.daily.categories.length / 12);
 
  }

  initUsability() {
    this.usability = {
      total: null,
      completed: null,
      canceled: null,
      incomplete: null,
      robotType: {
        data: [],
        centerText: ''
      },
      hourlyAvg: {
        categories : [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
        data: [],
      },
      weeklyAvg: {
        categoriesMap: {
          SUNDAY: "Sun",
          MONDAY: "Mon",
          TUESDAY: "Tue",
          WEDNESDAY: "Wed",
          THURSDAY: "Thu",
          FRIDAY: "Fri",
          SATURDAY: "Sat"
        },
        categories: [],
        data: [0, 0, 0, 0, 0, 0, 0]
      },
      daily: {
        data: [],
        categories: [],
        transitions: true,
        navigatorStep: 30,
        min: this.getSelectedDateRange()?.fromDate,
        max: this.getSelectedDateRange()?.toDate
      },
      robot:{
        data: [],
        categories: [],
      }
    }
    this.usability.weeklyAvg.categories = Object.values(this.usability.weeklyAvg.categoriesMap)
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ?  new Date() : new Date(this.year  + 1 , 0 , 1) 
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear + 1 ; i++) {
      this.usability.daily.categories.push(date);
      this.usability.daily.data.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    // let lastMonthSameDay = new Date(new Date().getFullYear(), new Date().getMonth() - 1 , new Date().getDate())
    //to.setDate(to.getDate()+1)
    // this.usability.daily.min =  fromDate ? fromDate : this.usability.daily.categories[0]
    // this.usability.daily.max =  toDate ? toDate : to
    //this.usability.daily.navigatorStep =  30//Math.floor(this.usability.daily.categories.length / 12);
    this.usability.daily.categories.pop()
    for (let i = 0; i < 24; i++) {
      this.usability.hourlyAvg.data.push(0)
    }
  }
  
  fetchUtilization() {    
    this.initUtilization()
    let tmpRow = {type : 'ROBOT' , category : this.robotCodeFilter}
    this.utilization.statuss.forEach(s=>tmpRow[s] = 0)
    let filteredRobotData = this.robotCodeFilter  && this.utilizationData.filter(r=> r.type == 'ROBOT' && r.category == this.robotCodeFilter).length == 0 ? [tmpRow]:[]
    // this.utilizationData = this.utilizationData.filter(r => r.type != 'DAILY').concat(this.fullYearDataset.utilization[this.year.toString()].filter(r => r.type == 'DAILY'))
    this.utilizationData = this.utilizationData.filter(r => r.type != 'ROBOT_TYPE').concat(this.utilizationData.filter(r => r.type == 'ROBOT_TYPE').sort((a, b) => b.executing / b.total - a.executing / a.total))
    this.utilizationData = this.utilizationData.filter(r => r.type != 'ROBOT').concat(this.utilizationData.filter(r => r.type == 'ROBOT').sort((a, b) => b.executing / b.total - a.executing / a.total)).concat(<any>filteredRobotData)
    this.utilizationData.forEach(r => {
      if (r.type == 'DAILY') {
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Date.UTC(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) )))
        Utilization_Status_Types.forEach(t=> this.utilization.daily.data[t][index] = this.getRoundedValue(r[t] , 1))       
      }else if(r.type == 'ROBOT'){
        this.utilization.robot.categories.push(r.category)
        Utilization_Status_Types.forEach(t=> this.utilization.robot.data[t][this.utilization.robot.categories.length - 1] = this.getRoundedValue(r[t] * 100 / r.total))       
      }else if(r.type == 'ROBOT_TYPE'){     
        this.utilization.robotType.categories.push(r.category)
        Utilization_Status_Types.forEach(t=> this.utilization.robotType.data[t][this.utilization.robotType.categories.length - 1] = this.getRoundedValue(r[t] * 100 / r.total))       
      }else if(r.type == 'HOURLY'){
        let index = this.utilization.hourly.categories.indexOf(r.category)
        Utilization_Status_Types.forEach(t=> this.utilization.hourly.data[t][index] = this.getRoundedValue(r[t] * 100 , 1))    
      }
    });
    let sortedUtilByTypes = this.utilizationData.filter(r=>r.type == 'ROBOT_TYPE').sort((a,b) => b.executing / b.total -  a.executing / a.total)
    for (let i = 0; i < Math.min(3, sortedUtilByTypes.length); i++) {
      let r = sortedUtilByTypes[i]
      this.utilization.total['type' + (i + 1)] = { robotType: r.category, executing: r.executing, total: r.total }
    }
    this.utilization.totalExecutingHours = this.utilizationData.filter(r=>r.type == 'ROBOT' && (!this.robotCodeFilter || this.robotCodeFilter == r.category)).reduce((acc, r) => acc + r.executing, 0)
    this.utilization.totalRobotHours = Utilization_Status_Types.reduce((acc2, t) => acc2 + this.utilizationData.filter(r=>r.type == 'ROBOT' && (!this.robotCodeFilter || this.robotCodeFilter == r.category)).reduce((acc, r) => acc + r[t], 0), 0)
  }

  fetchUsability() {    
    this.initUsability()
    let filteredRobotData = this.robotCodeFilter  && this.usabilityData.filter(r=> r.type == 'ROBOT' && r.category == this.robotCodeFilter).length == 0 ? [{type : 'ROBOT' , category : this.robotCodeFilter , value : 0}]:[]
    this.usabilityData = this.usabilityData.filter(r=>r.type != 'ROBOT').concat((this.usabilityData.filter(r=>r.type == 'ROBOT').sort((a,b)=> b.value - a.value)).concat((<any>filteredRobotData)))
    this.usabilityData.forEach(r => {
      if (r.type == 'COMPLETED') {
        this.usability.completed = this.getRoundedValue(r.value, 0)
      } else if (r.type == 'INCOMPLETE') {
        this.usability.incomplete = this.getRoundedValue(r.value, 0)
      } else if (r.type == 'CANCELED') {
        this.usability.canceled = this.getRoundedValue(r.value, 0)
      } else if (r.type == 'DAILY') {
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2])))
        this.usability.daily.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'HOURLY_AVG') {
        this.usability.hourlyAvg.data[Number(r.category)] = this.getRoundedValue(r.value)
      } else if (r.type == 'WEEKLY_AVG') {
        let index = Object.keys(this.usability.weeklyAvg.categoriesMap).indexOf(r.category?.toUpperCase())
        this.usability.weeklyAvg.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'ROBOT_TYPE') {
        this.usability.robotType.data.push({ category: r.category, value: this.getRoundedValue(r.value) })
      } else if (r.type == 'ROBOT') {
        this.usability.robot.categories.push(r.category)
        this.usability.robot.data.push(this.getRoundedValue(r.value))
      }
    })
    this.usability.total = this.usability.completed + this.usability.incomplete //+ this.usability.canceled
    this.usability.robotType.centerText = (this.usability.robotType.data.filter(d=>!this.robotTypeFilter || this.robotTypeFilter == d.category).map(d=>d.value).reduce((acc, i) => acc += i, 0)).toString() + ' \n ' + this.uiSrv.translate('Tasks')
  }

  fetchDetection(){
    this.initDetection()
    this.detectionData.forEach(r => {
      if(r.type == 'DAILY'){
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2])))
        this.detection.daily.data[index] = this.getRoundedValue(Number(r.value))
      } else if(r.type == 'DETECTION_TYPE'){
        this.detection.detectionType.data.push({ category: r.category, value: this.getRoundedValue(Number(r.value)) })
      } else if(r.type == 'FLOOR_PLAN'){
        console.log(this.detection.floorplan)
        this.detection.floorplan.data.push({ category: r.category, value: this.getRoundedValue(Number(r.value)) })
      } else if(r.type == 'JSON'){

      }
    })
  }

  getRoundedValue(value: number, decimalPlace: number = 2) {
    return Number(this.util.trimNum(value , decimalPlace))
  }
  
  daysIntoYear(date : Date) {
    // console.log(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / 24 / 60 / 60 / 1000;
  }


 // ===============================================================================================================================================
 


 @HostListener('window:resize', ['$event'])
  onResize() {
    // let containerEl = (<any>this.waypointObstacleChart)?.element?.nativeElement?.parentElement
    // this.refreshChartOnSizeChange(containerEl?.offsetWidth, containerEl?.offsetHeight)
  }

  getFilteredDetections(dateFilter = true , wpFilter = true , fpFilter= true){ // ONLY FOR 3 14 DEMO , TO BE MOVED TO BACKEND
    return this.detection.events.data.filter(d=>{
      let splitedDateString = d.date.split("-")
      let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]))
      let dateMatch = !dateFilter || (this.detection.daily.min && this.detection.daily.max && date >= this.detection.daily.min && date <= this.detection.daily.max)
      let wpMatch = !wpFilter || !this.detection.waypoint.selected || d.waypoint == this.detection.waypoint.selected
      let fpMatch = !fpFilter  || !this.detection.floorplan.selected || d.floorplan == this.detection.floorplan.selected
      return dateMatch && wpMatch && fpMatch
    })
  }

  async refreshDetection(){    
    // if( !this.detectionTestData){
    //   return
    // }
    if(!this.pixiRef){
      return
    }

    if(this.pixiRef && this.pixiRef.module.data.activeFloorPlanCode != this.detection.floorplan.selected){
      await this.pixiRef.module.data.loadFloorPlan(this.detection.floorplan.selected)
    }
    const pixiWayPoints : PixiWayPoint [] = this.pixiRef.viewport.allPixiWayPoints
    pixiWayPoints.forEach(p=>p.bubble?.parent.removeChild(p.bubble))
    // let containerEl = (<any>this.waypointObstacleChart)?.element?.nativeElement?.parentElement
    // this.refreshChartOnSizeChange(containerEl?.offsetWidth, containerEl?.offsetHeight)
    this.dropdownOptions.waypoint = pixiWayPoints.map(d=>{return {value : d.code , text : d.code }})
    this.detection.waypoint.data = pixiWayPoints.map(d => {
      return {
        category: d.code ,
        x: d.x ,
        y: d.y,
        count: 0
      }
    })
    pixiWayPoints.forEach(p=> {
      p.visible = false
      new PixiWayPointBubble(p.viewport , p , 0)
    })
    //this.detectionTestData.floorplan[this.detection.floorplan.selected].waypoints.map(d=>{return {value : d.category , text : d.category}})
    this.detection.daily.data = []
    this.detection.waypoint.data.forEach(d=>d.count = 0)
    
    //DAILY
    this.getFilteredDetections(false , false , true).forEach(d=>{
      let splitedDateString = d.date.split("-")
      let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) )
      let index = this.daysIntoYear(date)
      this.detection.daily.data[index] = this.detection.daily.data[index] + 1
      this.detection.daily.data = JSON.parse(JSON.stringify(this.detection.daily.data)) //IDK why it must be inside the for loop
    })

    //WAYPOINT
    this.getFilteredDetections(true , false , true).forEach(d=>{
      let waypointDistances = this.detection.waypoint.data.map(w => {
        return {
          waypoint: w.category,
          distance: Math.sqrt((d.x - w.x) * (d.x - w.x) + (d.y - w.y) * (d.y - w.y))
        }
      })
      let minDis = Math.min(...waypointDistances.map(w => w.distance))
      let closetWpCode = waypointDistances.filter(w => w.distance == minDis)[0]?.waypoint
      d.waypoint = closetWpCode
      for (let j = 0; j < this.detection.waypoint.data.length; j++) {
        if (closetWpCode && this.detection.waypoint.data[j].category == closetWpCode) {
          this.detection.waypoint.data[j].count = this.detection.waypoint.data[j].count + 1 //= this.detection.waypoint.data[j].count ? this.detection.waypoint.data[j].count + 1 : 0
          this.detection.waypoint.data = JSON.parse(JSON.stringify(this.detection.waypoint.data))
          const wp = pixiWayPoints.filter(p=>p.code ==closetWpCode)[0];
          if(wp){
            wp.bubble.count += 1
          }
          break
        }
      }       
    })
    this.detection.waypoint.data.forEach(d=>{
      d.count = (d.category == this.detection.waypoint.selected ? -1 : 1) * Math.abs(d.count)
    })

    //FLOORPLAN
    this.detection.floorplan.categories = [...new Set(this.detection.floorplan.data.map(d => d.category))].sort()
    // for (let i = 0; i < this.detection.floorplan.categories.length; i++) {
    //   this.detection.floorplan.data[i] = this.getFilteredDetections(true , false , false).filter(d=>d.floorplan == this.detection.floorplan.categories[i]).length 
    // }   
    this.detection.floorplan.data = JSON.parse(JSON.stringify(this.detection.floorplan.data))

    // //HOURLY AVG
    // if(this.detection.daily.max && this.detection.daily.min){
    //   let daysCount = Math.ceil(Math.abs(<any>this.detection.daily.max - <any>this.detection.daily.min) / (1000 * 60 * 60 * 24)); 
    //   for (let i = 0; i < this.detection.hourlyAvg.categories.length; i++) {
    //     let hour = this.detection.hourlyAvg.categories[i]
    //     this.detection.hourlyAvg.data[i] = this.getRoundedValue( this.getFilteredDetections().filter(d => d.hour == hour).length / daysCount)
    //   }   
    // }
    // this.detection.hourlyAvg.data = JSON.parse(JSON.stringify(this.detection.hourlyAvg.data))

    //TOTAL
    this.detection.total.count = this.getFilteredDetections().length
    this.detection.total.waypoint1 = null
    this.detection.total.waypoint2 = null
    this.detection.total.waypoint3 = null
    
    let tmpData = JSON.parse(JSON.stringify(this.detection.waypoint.data.map(d=>{return {category : d.category , count : Math.abs(d.count)}})))
    tmpData.sort((a, b) => b.count - a.count)
    for (let i = 0; i < Math.min(tmpData.length, 3); i++) {
      let d = { name: tmpData[i].category, count: tmpData[i].count }
      this.detection.total['waypoint' + (i + 1)] = d
    }


    this.pixiRef.viewport.allPixiEventMarkers.forEach(m=> m.parent?.removeChild(m))
    this.detection.events.data.filter((d: { floorplan: string }) => d.floorplan == this.detection.floorplan.selected).forEach((d: { x: number, y: number, date: string, waypoint: string }) => {
      let eventMarker = new PixiEventMarker(this.pixiRef.viewport, undefined, undefined, undefined, 'cross')
      eventMarker.position.set(d.x, d.y)
      this.pixiRef.viewport.mainContainer.addChild(eventMarker)
      eventMarker.visible = false
      eventMarker.waypoint = pixiWayPoints.filter(p=>p.code == d.waypoint)[0]
    })

    pixiWayPoints.forEach(p=> {
      p.bubble.total = this.detection.events.data.filter((d: { floorplan: string }) => d.floorplan == this.detection.floorplan.selected).length;
      p.bubble.maxCount = Math.max.apply(null,  pixiWayPoints.map(p2=> p2.bubble.count))
      p.bubble.draw()
    })
  }

  async initDetection() {
    this.detection = {
      total : {
        count : null,
        waypoint1 : null,
        waypoint2 : null,
        waypoint3 : null,
      },
      detectionType: {
        data: [],
        centerText: ''
      },
      waypoint: {
        selected: null,
        labelContent: (e): string => {
          return e.dataItem?.category;
        },
        maxY: null,
        minX: null,
        minY: null,
        maxX: null,
        data: [],
      },
      daily: {
        min: new Date(new Date().getFullYear(), 0, 1),
        max: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1),
        navigatorStep: 30,
        transitions: false,
        categories: [],
        data: [],
      },
      events: {
        data: []
      },
      floorplan :{
        centerText: "",
        selected: null,
        categories : [],
        data: []
      }
      // hourlyAvg: {
      //   selected: null,
      //   categories: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      //   data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      // }
    }
    // this.detectionTestData = await this.dataSrv.getAssets("assets/detectionData.json")
    // this.dropdownOptions.floorplan = Object.keys( this.detectionTestData.floorplan).map(code => { return { value: code, text: code } })
    this.detection.floorplan.selected = this.dropdownOptions.floorplans.map(o => o.value)[0]
    // this.detection.events.data = this.detectionTestData.obstacles
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ? new Date() : new Date(this.year + 1, 0, 1)
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear + 1; i++) {
      this.detection.daily.categories.push(date);
      this.detection.daily.data.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    setTimeout(()=>this.refreshDetection())
  }

  selectWaypoint(e) {
    // this.detection.waypoint.selected = this.detection.obstacle.data[0]?.waypoint == e.category ? null : e.category
    this.refreshDetection()
  }

  // refreshChartOnSizeChange(offsetWidth : number , offsetHeight : number){   
  //   let tmpScatter = JSON.parse(JSON.stringify( this.detection.obstacle.data ))
  //   this.detection.obstacle.data = []

  //   this.detection.background.width = offsetWidth / offsetHeight < 1 ? offsetWidth  :  offsetHeight *  this.detection.background.imageWidth  / this.detection.background.imageHeight
  //   this.detection.background.height = offsetWidth / offsetHeight < 1 ? offsetHeight  :  offsetWidth * this.detection.background.imageHeight  / this.detection.background.imageWidth
  //   this.detection.waypoint.minX = 0 
  //   this.detection.waypoint.maxX = this.detection.background.imageWidth 
  //   this.detection.waypoint.maxY = 0 
  //   this.detection.waypoint.minY = - this.detection.background.imageHeight
  //   this.detection.waypoint.data = JSON.parse(JSON.stringify(this.detection.waypoint.data))

  //   this.detection.obstacle.data = tmpScatter
  //   // return

  //   // if( offsetWidth && offsetHeight){
  //   //   let minX = Math.min(... this.detection.waypoint.data.map(d=>d.x))
  //   //   let maxY = Math.max(... this.detection.waypoint.data.map(d=>d.y));
  //   //   let xRange = Math.max(... this.detection.waypoint.data.map(d => d.x)) - minX
  //   //   let yRange = maxY - Math.min(... this.detection.waypoint.data.map(d => d.y)) 
  //   //   let extraUnit =  xRange / offsetWidth > yRange / offsetHeight ? Math.ceil(xRange * 0.1) : Math.ceil(yRange * 0.1)
  //   //   this.detection.waypoint.maxY = maxY + extraUnit
  //   //   this.detection.waypoint.minX = minX - extraUnit

  //   //   if (xRange / offsetWidth > yRange / offsetHeight) {
  //   //     this.detection.waypoint.maxX = Math.max(... this.detection.waypoint.data.map(d => d.x)) + extraUnit
  //   //     this.detection.waypoint.minY = this.detection.waypoint.maxY - (this.detection.waypoint.maxX - this.detection.waypoint.minX) * (offsetHeight / offsetWidth) 
  //   //   } else {
  //   //     this.detection.waypoint.minY = Math.min(... this.detection.waypoint.data.map(d => d.y)) - extraUnit
  //   //     this.detection.waypoint.maxX = this.detection.waypoint.minX + (this.detection.waypoint.maxY - this.detection.waypoint.minY) * (offsetWidth / offsetHeight) 
  //   //   }       
  //   // }
  // }
}


    // this.usability.robotUtil.categories.forEach(c => {
    //   this.usability.robotUtil.data.operating.push(Math.floor(Math.random() * 75))
    //   this.usability.robotUtil.data.charging.push(Math.floor(Math.random() * 20))
    //   this.usability.robotUtil.data.downtime.push(Math.floor(Math.random() * 5))
    // });

    // robotUtil:{
    //   labelContent:(arg : LegendLabelsContentArgs)=> arg.value > 0 ? arg.value + '%' : '',
    //   categories:[],
    //   data:{
    //     operating:[],
    //     charging:[],
    //     downtime:[]
    //   }
    // },
    // avgUtil:{
    //   categories:[],
    //   data:{
    //     operating:[],
    //     charging:[],
    //     downtime:[]
    //   }
    // },

 