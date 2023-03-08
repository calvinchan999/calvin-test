import { Text, Group} from "@progress/kendo-drawing";
import { ChartComponent,  HighlightVisualArgs, LegendLabelsContentArgs, SeriesClickEvent, SeriesLabelsVisualArgs, SeriesVisualArgs , AxisLabelVisualArgs, SeriesHoverEvent, LegendItemHoverEvent } from '@progress/kendo-angular-charts';
import { ChangeDetectorRef, Component, NgZone, OnInit, Input , ViewChild , ElementRef , TemplateRef, OnDestroy, HostListener } from '@angular/core';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, PixiCommon } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ARCS_STATUS_MAP, DataService, DropListBuilding, DropListFloorplan, DropListRobot, DropListType, FloorPlanDataset, RobotStatusARCS as RobotStatus, RobotTaskInfoARCS, ShapeJData } from 'src/app/services/data.service';
import { Router } from '@angular/router';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { skip, takeUntil , filter } from 'rxjs/operators';
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

export class ArcsChartsComponent implements OnInit , OnDestroy {
  @ViewChild('navigatorChart') navigatorChart : ChartComponent
  @ViewChild('obstacleWaypointScatter') waypointObstacleChart 
  @ViewChild('tooltipFr') tooltipFr : TooltipDirective
  @ViewChild('tooltipTo') tooltipTo : TooltipDirective
  @ViewChild('frDateTpl') frDateTpl : TemplateRef<any>
  @ViewChild('toDateTpl') toDateTpl : TemplateRef<any>
  @ViewChild('usabilityByRobotChart') usabilityByRobotChart : ChartComponent
  @ViewChild('usabilityByRobotTypeChart') usabilityByRobotTypeChart : ChartComponent
  @ViewChild('utilizationByRobotChart') utilizationByRobotChart : ChartComponent
  @ViewChild('utilizationByRobotTypeChart') utilizationByRobotTypeChart : ChartComponent
  @ViewChild('utilizationByHourChart') utilizationByHourChart : ChartComponent
  frDateTplView


  robotTypePipe = (e: AxisLabelVisualArgs) => {
    return  this.uiSrv.translate(this.dataSrv.enumPipe.transform(e.value))
  }
  @Input() set chartType(t){
    let orginalType = this._chartType
    this._chartType = t  
    if(orginalType){
      this.ngAfterViewInit()
    }
  }
  _chartType : "usability" | "utilization" | "analysis"
  get chartType(){
    return this._chartType
  }
  year = new Date().getFullYear()
  location
  dropdownData = {types:[] , robots : []}
  dropdownOptions = {
    types:[],
    robots : [],
    years:[ {value : this.year , text : this.year.toString()}], 
    locations:[]
  }

  
  analysis = {
    waypoint: {
      labelContent :(e): string => {
        return e.dataItem?.category;
      },
      maxY : null,
      minX : null,
      minY : null,
      maxX : null,

      data : [
        {"category":"WP-01","x":598.98399483444,"y":-847.86759385555 , count : 0},
        {"category":"WP-03","x":508.073928204866,"y":-751.844351307767, count : 0},
        {"category":"WP-04","x":233.974066697926,"y":-754.307316411976, count : 0},
        {"category":"WP-05","x":454.613088722257,"y":-930.237354922539, count : 0},
        {"category":"WP-06","x":636.932236435755,"y":-915.586284693838, count : 0},
      ],
    },
    daily: {
      min: new Date(new Date().getFullYear(), 0, 1),
      max: new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() + 1)
    },
    obstacle:{
      data:[]
    },
    obstacleAll:{
      data: [
        { x: 629.071061862255, y: -819.756986193155 , waypoint : null},
        { x: 559.256897607737, y: -798.44590529357 },
        { x: 436.554725188861, y: -812.54992860738 },
        { x: 448.336376271336, y: -922.37592287958 },
        { x: 579.918391256856, y: -855.729242519982 },
        { x: 504.236977228906, y: -789.52397880251 },
        { x: 612.416388072866, y: -754.298449740009 },
        { x: 269.036990255835, y: -811.968767257886 },
        { x: 288.703900529577, y: -864.957616883101 },
        { x: 346.574092011032, y: -819.472449577362 },
        { x: 561.792817266574, y: -757.752558425257 },
        { x: 416.189494712069, y: -797.974081795417 },
        { x: 493.01390171979, y: -788.08435804123 },
        { x: 508.54360580934, y: -909.816547787191 },
        { x: 532.519851136141, y: -840.1483879825 },
        { x: 582.16978440343, y: -908.414159338851 },
        { x: 569.48568763064, y: -803.49572530398 },
        { x: 348.016986928335, y: -753.670522028011 },
        { x: 380.359277578181, y: -893.171895411852 },
        { x: 298.140782421946, y: -788.541013757746 },
        { x: 437.117135684028, y: -846.386030444943 },
        { x: 407.796933648097, y: -882.554687104535 },
        { x: 583.300562734128, y: -835.962093455333 },
        { x: 451.866364572244, y: -874.760784785949 },
        { x: 481.535958622744, y: -806.049041069224 },
        { x: 381.639316611332, y: -760.973102685084 },
        { x: 365.380833160425, y: -833.038652025463 },
        { x: 314.702001596795, y: -774.823461090601 },
        { x: 585.019718428477, y: -855.799829759091 },
        { x: 562.321422325454, y: -924.448726917063 },
        { x: 256.424569423513, y: -754.464465377522 },
        { x: 342.468517794756, y: -789.071658219939 },
        { x: 591.103618122441, y: -754.048752755393 },
        { x: 573.114333774913, y: -904.792727446515 },
        { x: 235.530175093985, y: -814.083529552321 },
        { x: 458.778275134329, y: -878.533767894501 },
        { x: 473.700642920443, y: -795.915579907095 },
        { x: 540.720153465155, y: -926.287776463175 },
        { x: 542.95483402408, y: -846.453776341085 },
        { x: 412.942571107239, y: -813.221759064068 },
        { x: 464.655408093919, y: -822.862180425963 },
        { x: 326.406905202542, y: -909.138241411782 },
        { x: 375.017192656964, y: -847.874541369802 },
        { x: 575.053823925095, y: -820.786333702739 },
        { x: 619.175649559065, y: -904.78829321236 },
        { x: 504.730451751457, y: -881.421422425582 },
        { x: 244.16069337404, y: -895.294550847775 },
        { x: 581.892478089954, y: -758.166951287944 },
        { x: 256.756197191045, y: -857.198884279473 },
        { x: 507.068343767885, y: -894.127976343909 },
        { x: 521.145395228408, y: -824.744668920986 },
        { x: 340.657311834699, y: -910.76770323239 },
        { x: 575.775157396818, y: -900.983391182364 },
        { x: 448.814532304743, y: -779.839499129332 },
        { x: 410.85745356445, y: -753.405265872935 },
        { x: 260.2992925321, y: -928.923812439655 },
        { x: 305.830169609493, y: -832.418607711928 },
        { x: 408.121074223043, y: -915.30700897702 },
        { x: 527.953635277181, y: -769.543525445145 },
        { x: 472.480490803811, y: -859.839296718704 },
        { x: 367.37211320866, y: -864.687549252636 },
        { x: 495.373067148886, y: -897.433728995024 },
        { x: 266.443545510406, y: -830.976544726534 },
        { x: 525.622663657945, y: -819.411950822286 },
        { x: 392.830651184224, y: -917.833589656341 },
        { x: 298.686810698013, y: -791.322318415793 },
        { x: 376.542639415372, y: -886.377568812404 },
        { x: 480.930019258612, y: -847.284596417891 },
        { x: 304.135137143689, y: -870.908399805079 },
        { x: 422.700879863322, y: -852.87382297867 },
        { x: 612.033345881634, y: -788.672410757676 },
        { x: 493.449116382654, y: -879.172375659299 },
        { x: 337.586737316401, y: -895.370587074768 },
        { x: 582.201728507607, y: -861.475666181364 },
        { x: 602.16529439186, y: -855.290880101303 },
        { x: 480.98998202695, y: -831.483293529569 },
        { x: 332.812977960363, y: -918.826327507383 },
        { x: 329.102398464103, y: -919.557671744014 },
        { x: 375.289675805087, y: -899.37817811093 },
        { x: 376.621087356002, y: -922.765529030196 },
      ]
    },
    fromHourly:{

    },
    toHourly:{

    }
  }
  // [
  //   {
  //     x: 1,
  //     y: 2,
  //     count: 5,
  //     category: "test",
  //   },
  //   {
  //     x: 1,
  //     y: 4,
  //     count: 3,
  //     category:"test",
  //   },
  //   {
  //     x: 1,
  //     y: 5,
  //     count: 1,
  //     category:"test",
  //   },
  //   {
  //     x: 2,
  //     y: 3,
  //     count: 12,
  //     category:"test",
  //   },
  //   {
  //     x: 2,
  //     y: 4,
  //     count: 15,
  //     category:"test",
  //   },
  //   {
  //     x: 2,
  //     y: 5,
  //     count: 9,
  //     category:"test",
  //   },
  //   {
  //     x: 3,
  //     y: 4,
  //     count: 6,
  //     category:"test",
  //   },
  //   {
  //     x: 3,
  //     y: 6,
  //     count: 3,
  //     category:"test",
  //   },
  //   {
  //     x: 4,
  //     y: 5,
  //     count: 2,
  //     category:"test",
  //   },
  //   {
  //     x: 5,
  //     y: 6,
  //     count: 5,
  //     category:"test",
  //   },
  // ]

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
      console.log(arg)
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
    return ([this.usabilityByRobotTypeChart , this.utilizationByRobotTypeChart].includes(arg.sender) && this.robotTypeFilter && checkValue!= this.robotTypeFilter) ||
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
    this.refreshScatterCharts()
  }
  
  initAnalysis() {
   this.refreshScatterCharts()
    for (let i = 0; i < this.analysis.obstacleAll.data.length; i++) {
      let data = this.analysis.obstacleAll.data[i]      
      let waypointDistances = this.analysis.waypoint.data.map(w => {
        return {
          waypoint: w.category,
          distance: Math.sqrt((data.x - w.x) * (data.x - w.x) + (data.y - w.y) * (data.y - w.y))
        }
      })      
      let minDis = Math.min(...waypointDistances.map(w => w.distance))
      let closetWpCode = waypointDistances.filter(w => w.distance == minDis)[0]?.waypoint
      data.waypoint = closetWpCode
      for(let j = 0 ; j < this.analysis.waypoint.data.length ; j++){
        if(closetWpCode && this.analysis.waypoint.data[j].category == closetWpCode ){
          this.analysis.waypoint.data[j].count ++ //= this.analysis.waypoint.data[j].count ? this.analysis.waypoint.data[j].count + 1 : 0
          break
        }
      }
    }
  }

  refreshAnalysisScatter(e){
    if(this.analysis.obstacle.data[0]?.waypoint == e.category ){
      this.analysis.obstacle.data = []
    }else{
      this.analysis.obstacle.data = this.analysis.obstacleAll.data.filter(d=>d.waypoint == e.category)
    }
  }

  refreshScatterCharts() {
    [this.waypointObstacleChart].forEach(c => {
      if(c){
        this.refreshScatterChart(c.element?.nativeElement?.offsetWidth, c.element?.nativeElement?.offsetHeight)
      }
    })
  }
  

  refreshScatterChart(offsetWidth : number , offsetHeight : number){
    if( offsetWidth && offsetHeight){
      let minX = Math.min(... this.analysis.waypoint.data.map(d=>d.x))
      let maxY = Math.max(... this.analysis.waypoint.data.map(d=>d.y));
      let xRange = Math.max(... this.analysis.waypoint.data.map(d => d.x)) - minX
      let yRange = maxY - Math.min(... this.analysis.waypoint.data.map(d => d.y)) 
      let extraUnit =  xRange / offsetWidth > yRange / offsetHeight ? Math.ceil(xRange * 0.1) : Math.ceil(yRange * 0.1)
      this.analysis.waypoint.maxY = maxY + extraUnit
      this.analysis.waypoint.minX = minX - extraUnit

      if (xRange / offsetWidth > yRange / offsetHeight) {
        this.analysis.waypoint.maxX = Math.max(... this.analysis.waypoint.data.map(d => d.x)) + extraUnit
        this.analysis.waypoint.minY = this.analysis.waypoint.maxY - (this.analysis.waypoint.maxX - this.analysis.waypoint.minX) * (offsetHeight / offsetWidth) 
      } else {
        this.analysis.waypoint.minY = Math.min(... this.analysis.waypoint.data.map(d => d.y)) - extraUnit
        this.analysis.waypoint.maxX = this.analysis.waypoint.minX + (this.analysis.waypoint.maxY - this.analysis.waypoint.minY) * (offsetWidth / offsetHeight) 
      }       
    }
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