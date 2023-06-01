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

const Utilization_Status_Types = ['executing', 'idle', 'charging', 'hold', 'unknown']
@Component({
  selector: 'app-arcs-charts',
  templateUrl: './arcs-charts.component.html',
  styleUrls: ['./arcs-charts.component.scss']
})

export class ArcsChartsComponent implements OnInit, OnDestroy {
  @ViewChild('navigatorChart') navigatorChart: ChartComponent
  @ViewChild('obstacleWaypointScatter') waypointObstacleChart : ChartComponent
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

  frDateTplView

  analysisTestData : {floorplan : {[key : string] : {
    path? : string,
    width? : number,
    height? :  number,
    imageWidth? : number,
    imageHeight? : number,   
    waypoints? :  {category : string , x : number , y : number , count : number}[]
  }} , obstacles : any []} =null
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
  _chartType: "usability" | "utilization" | "analysis"
  get chartType() {
    return this._chartType
  }
  year = new Date().getFullYear()
  location
  dropdownData = { types: [], robots: [] }
  dropdownOptions = {
    types: [],
    robots: [],
    years: [{ value: this.year, text: this.year.toString() }],
    locations: [],
    floorplan : [],
    waypoint : []
  }


  analysis = {
    total : {
      count : null,
      waypoint1 : null,
      waypoint2 : null,
      waypoint3 : null,
    },
    background : {
      path : null,
      width : 0,
      height : 0,
      imageWidth : 0,
      imageHeight : 0
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
    obstacle: {
      data: []
    },
    obstacleAll: {
      data: []
    },
    floorplan :{
      selected: null,
      categories : [],
      data: []
    },
    hourlyAvg: {
      selected: null,
      categories: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
      data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    }
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

  usabilityData : {type : 'COMPLETED'|'CANCELED'|'INCOMPLETE'|'DAILY'|'HOURLY_AVG'|'WEEKLY_AVG'|'ROBOT_TYPE'|'ROBOT' , category? : string , value? : number}[] = []
  utilizationData: { type: 'ROBOT' | 'DAILY' | 'ROBOT_TYPE' , category? : string , charging : number , idle : number , executing : number , hold : number , unknown : number , total: number}[] = []

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
    } else if (evt.sender == this.floorplanObstacleChart && this.analysis.floorplan.selected != evt.category) {
      this.analysis.floorplan.selected = evt.category
      this.analysis.waypoint.selected = null
      this.refreshAnalysis()
    }
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
    this.initUsability()
    this.initUtilization()
    await this.initDropDown()
    let frDate = null , toDate = null
    if(this.chartType == 'utilization' && new Date().getMonth()!= 0){
      toDate = new Date() 
      frDate = toDate.getMonth() == 0 ? new Date(toDate.getFullYear(), 0, 1) : new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate());
      frDate.setMonth(frDate.getMonth() - 1);
    }
    this.setDateRange(frDate , null)
    await this.refreshChart()
    this.uiSrv.loadAsyncDone(ticket)
    setTimeout(() => this.initAnalysis())
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
    }else if(this._chartType == 'analysis'){
      fr = this.analysis?.daily?.min
      to = this.analysis?.daily?.max
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
    }else if(this.chartType == 'analysis'){
      this.analysis.daily.min = args.from;
      this.analysis.daily.max = args.to;
      this.analysis.daily.transitions = false;
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
      if (arg.sender == this.usabilityByRobotTypeChart) {
        (<Text>mainText).content(this.uiSrv.translate(this.dataSrv.enumPipe.transform(arg.dataItem.category)));
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
    return (arg.sender == this.floorplanObstacleChart && this.analysis.floorplan.selected && this.analysis.floorplan.selected != checkValue) ||
           ([this.usabilityByRobotTypeChart , this.utilizationByRobotTypeChart].includes(arg.sender) && this.robotTypeFilter && checkValue!= this.robotTypeFilter) ||
           ((arg.sender == this.usabilityByRobotChart || arg.sender == this.utilizationByRobotChart ) && this.robotCodeFilter && checkValue != this.robotCodeFilter) || 
           (this.hightlightedSeriesIndex !== null && arg.series?.index != null && (utilizationCharts.includes(arg.sender)) && arg.series.index != this.hightlightedSeriesIndex )
  }


  async initDropDown(){
    let ddl = await this.dataSrv.getDropLists(['types' , 'robots']);
    ['types' , 'robots'].forEach(k=>{
      this.dropdownData[k] = ddl.data[k];
      this.dropdownOptions[k] = this.dataSrv.getDropListOptions(<any>k, ddl.data[k])
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
    if(this.chartType == 'analysis'){ //TBR !!!!!!!!!!!!!!!!!!
      this.refreshAnalysis()
      return 
    }

    let toDate = new Date(this.getSelectedDateRange().toDate.getTime())
    toDate.setDate(toDate.getDate() - 1)
    await this.retreiveData(this.getSelectedDateRange().fromDate , toDate)
    if(this._chartType == 'usability'){
      this.fetchUsability() 
    }else if(this._chartType == 'utilization'){
      this.fetchUtilization() 
    }
  }

  async retreiveData( fromDate: Date , toDate: Date ) {
    if(!['usability' , 'utilization'].includes(this.chartType)){
      this.initYearDropDown(Number(new Date().getFullYear()))
      return
    }
    // fromDate = fromDate ? fromDate : this.getSelectedDateRange().fromDate
    // toDate = toDate ? toDate : this.getSelectedDateRange().toDate    
    // console.log(toDate)
    // toDate = new Date(toDate.getTime() - 86400000)
    let ticket = this.uiSrv.loadAsyncBegin()
    let frDateStr = this.util.getSQLFmtDateStr(fromDate)
    let toDateStr = this.util.getSQLFmtDateStr(toDate)
    let data = []
    let param = `?fromDate=${frDateStr}&toDate=${toDateStr}${this.robotTypeFilter ? `&robotType=${this.robotTypeFilter}` : '' }${this.robotCodeFilter ? `&robotCode=${this.robotCodeFilter}` : '' }`
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
        this.usability.completed = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'INCOMPLETE') {
        this.usability.incomplete = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'CANCELED') {
        this.usability.canceled = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'DAILY') {
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) ))
        this.usability.daily.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'HOURLY_AVG') {
        this.usability.hourlyAvg.data[Number(r.category)] = this.getRoundedValue(r.value)
      } else if (r.type == 'WEEKLY_AVG') {
        let index = Object.keys(this.usability.weeklyAvg.categoriesMap).indexOf(r.category?.toUpperCase())
        this.usability.weeklyAvg.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'ROBOT_TYPE') {
        this.usability.robotType.data.push({ category: r.category , value: this.getRoundedValue(r.value) })
      }else if(r.type == 'ROBOT'){
        this.usability.robot.categories.push(r.category)
        this.usability.robot.data.push( this.getRoundedValue(r.value))
      }
    })
    this.usability.total = this.usability.completed + this.usability.incomplete //+ this.usability.canceled
    this.usability.robotType.centerText = (this.usability.robotType.data.filter(d=>!this.robotTypeFilter || this.robotTypeFilter == d.category).map(d=>d.value).reduce((acc, i) => acc += i, 0)).toString() + ' \n ' + this.uiSrv.translate('Tasks')
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
    let containerEl = (<any>this.waypointObstacleChart)?.element?.nativeElement?.parentElement
    this.refreshChartOnSizeChange(containerEl?.offsetWidth, containerEl?.offsetHeight)
  }

  getFilteredObstacles(dateFilter = true , wpFilter = true , fpFilter= true){ // ONLY FOR 3 14 DEMO , TO BE MOVED TO BACKEND
    return this.analysis.obstacleAll.data.filter(d=>{
      let splitedDateString = d.date.split("-")
      let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]))
      let dateMatch = !dateFilter || (this.analysis.daily.min && this.analysis.daily.max && date >= this.analysis.daily.min && date <= this.analysis.daily.max)
      let wpMatch = !wpFilter || !this.analysis.waypoint.selected || d.waypoint == this.analysis.waypoint.selected
      let fpMatch = !fpFilter  || !this.analysis.floorplan.selected || d.floorplan == this.analysis.floorplan.selected
      return dateMatch && wpMatch && fpMatch
    })
  }

  refreshAnalysis(){    
    if( !this.analysisTestData){
      return
    }

    this.analysis.background = <any>this.analysisTestData.floorplan[this.analysis.floorplan.selected]
    let containerEl = (<any>this.waypointObstacleChart)?.element?.nativeElement?.parentElement
    this.refreshChartOnSizeChange(containerEl?.offsetWidth, containerEl?.offsetHeight)
    this.dropdownOptions.waypoint = this.analysisTestData.floorplan[this.analysis.floorplan.selected].waypoints.map(d=>{return {value : d.category , text : d.category}})
    this.analysis.waypoint.data = JSON.parse(JSON.stringify(this.analysisTestData.floorplan[this.analysis.floorplan.selected].waypoints)) 
    this.analysis.daily.data = []
    this.analysis.waypoint.data.forEach(d=>d.count = 0)
    
    //DAILY
    this.getFilteredObstacles(false , false , true).forEach(d=>{
      let splitedDateString = d.date.split("-")
      let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) )
      let index = this.daysIntoYear(date)
      this.analysis.daily.data[index] = this.analysis.daily.data[index] + 1
      this.analysis.daily.data = JSON.parse(JSON.stringify(this.analysis.daily.data)) //IDK why it must be inside the for loop
    })

    //WAYPOINT
    this.getFilteredObstacles(true , false , true).forEach(d=>{
      let waypointDistances = this.analysis.waypoint.data.map(w => {
        return {
          waypoint: w.category,
          distance: Math.sqrt((d.x - w.x) * (d.x - w.x) + (d.y - w.y) * (d.y - w.y))
        }
      })
      let minDis = Math.min(...waypointDistances.map(w => w.distance))
      let closetWpCode = waypointDistances.filter(w => w.distance == minDis)[0]?.waypoint
      d.waypoint = closetWpCode
      for (let j = 0; j < this.analysis.waypoint.data.length; j++) {
        if (closetWpCode && this.analysis.waypoint.data[j].category == closetWpCode) {
          this.analysis.waypoint.data[j].count = this.analysis.waypoint.data[j].count + 1 //= this.analysis.waypoint.data[j].count ? this.analysis.waypoint.data[j].count + 1 : 0
          this.analysis.waypoint.data = JSON.parse(JSON.stringify(this.analysis.waypoint.data))
          break
        }
      }       
    })
    this.analysis.waypoint.data.forEach(d=>{
      d.count = (d.category == this.analysis.waypoint.selected ? -1 : 1) * Math.abs(d.count)
    })

    //FLOORPLAN
    this.analysis.floorplan.categories =  this.dropdownOptions.floorplan.map(f=>f.value)//[...new Set(data.map(d => d.floorplan))].sort()
    for (let i = 0; i < this.analysis.floorplan.categories.length; i++) {
      this.analysis.floorplan.data[i] = this.getFilteredObstacles(true , false , false).filter(d=>d.floorplan == this.analysis.floorplan.categories[i]).length 
    }   
    this.analysis.floorplan.data = JSON.parse(JSON.stringify(this.analysis.floorplan.data))

    //HOURLY AVG
    if(this.analysis.daily.max && this.analysis.daily.min){
      let daysCount = Math.ceil(Math.abs(<any>this.analysis.daily.max - <any>this.analysis.daily.min) / (1000 * 60 * 60 * 24)); 
      for (let i = 0; i < this.analysis.hourlyAvg.categories.length; i++) {
        let hour = this.analysis.hourlyAvg.categories[i]
        this.analysis.hourlyAvg.data[i] = this.getRoundedValue( this.getFilteredObstacles().filter(d => d.hour == hour).length / daysCount)
      }   
    }
    this.analysis.hourlyAvg.data = JSON.parse(JSON.stringify(this.analysis.hourlyAvg.data))

    //OBSTACLE SCATTER
    this.analysis.obstacle.data = this.analysis.waypoint.selected ? this.getFilteredObstacles().filter(d => d.waypoint == this.analysis.waypoint.selected) : []

    //TOTAL
    this.analysis.total.count = this.getFilteredObstacles().length
    this.analysis.total.waypoint1 = null
    this.analysis.total.waypoint2 = null
    this.analysis.total.waypoint3 = null
    
    let tmpData = JSON.parse(JSON.stringify(this.analysis.waypoint.data.map(d=>{return {category : d.category , count : Math.abs(d.count)}})))
    tmpData.sort((a, b) => b.count - a.count)
    for (let i = 0; i < Math.min(tmpData.length, 3); i++) {
      let d = { name: tmpData[i].category, count: tmpData[i].count }
      this.analysis.total['waypoint' + (i + 1)] = d
    }
  }

  async initAnalysis() {
    this.analysisTestData = await this.dataSrv.getAssets("assets/analysisData.json")
    this.dropdownOptions.floorplan = Object.keys( this.analysisTestData.floorplan).map(code => { return { value: code, text: code } })
    this.analysis.floorplan.selected = this.dropdownOptions.floorplan.map(o => o.value)[0]
    this.analysis.obstacleAll.data = this.analysisTestData.obstacles
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ? new Date() : new Date(this.year + 1, 0, 1)
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear + 1; i++) {
      this.analysis.daily.categories.push(date);
      this.analysis.daily.data.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    this.refreshAnalysis()
  }

  selectWaypoint(e) {
    this.analysis.waypoint.selected = this.analysis.obstacle.data[0]?.waypoint == e.category ? null : e.category
    this.refreshAnalysis()
  }

  refreshChartOnSizeChange(offsetWidth : number , offsetHeight : number){   
    let tmpScatter = JSON.parse(JSON.stringify( this.analysis.obstacle.data ))
    this.analysis.obstacle.data = []

    this.analysis.background.width = offsetWidth / offsetHeight < 1 ? offsetWidth  :  offsetHeight *  this.analysis.background.imageWidth  / this.analysis.background.imageHeight
    this.analysis.background.height = offsetWidth / offsetHeight < 1 ? offsetHeight  :  offsetWidth * this.analysis.background.imageHeight  / this.analysis.background.imageWidth
    this.analysis.waypoint.minX = 0 
    this.analysis.waypoint.maxX = this.analysis.background.imageWidth 
    this.analysis.waypoint.maxY = 0 
    this.analysis.waypoint.minY = - this.analysis.background.imageHeight
    this.analysis.waypoint.data = JSON.parse(JSON.stringify(this.analysis.waypoint.data))

    this.analysis.obstacle.data = tmpScatter
    // return

    // if( offsetWidth && offsetHeight){
    //   let minX = Math.min(... this.analysis.waypoint.data.map(d=>d.x))
    //   let maxY = Math.max(... this.analysis.waypoint.data.map(d=>d.y));
    //   let xRange = Math.max(... this.analysis.waypoint.data.map(d => d.x)) - minX
    //   let yRange = maxY - Math.min(... this.analysis.waypoint.data.map(d => d.y)) 
    //   let extraUnit =  xRange / offsetWidth > yRange / offsetHeight ? Math.ceil(xRange * 0.1) : Math.ceil(yRange * 0.1)
    //   this.analysis.waypoint.maxY = maxY + extraUnit
    //   this.analysis.waypoint.minX = minX - extraUnit

    //   if (xRange / offsetWidth > yRange / offsetHeight) {
    //     this.analysis.waypoint.maxX = Math.max(... this.analysis.waypoint.data.map(d => d.x)) + extraUnit
    //     this.analysis.waypoint.minY = this.analysis.waypoint.maxY - (this.analysis.waypoint.maxX - this.analysis.waypoint.minX) * (offsetHeight / offsetWidth) 
    //   } else {
    //     this.analysis.waypoint.minY = Math.min(... this.analysis.waypoint.data.map(d => d.y)) - extraUnit
    //     this.analysis.waypoint.maxX = this.analysis.waypoint.minX + (this.analysis.waypoint.maxY - this.analysis.waypoint.minY) * (offsetWidth / offsetHeight) 
    //   }       
    // }
  }
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

 