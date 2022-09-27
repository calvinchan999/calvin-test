import { Text, Group} from "@progress/kendo-drawing";
import { ChartComponent, LegendLabelsContentArgs, SeriesLabelsVisualArgs } from '@progress/kendo-angular-charts';
import { ChangeDetectorRef, Component, NgZone, OnInit, Input , ViewChild , ElementRef , TemplateRef } from '@angular/core';
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
import { BehaviorSubject, from, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { mixin } from "pixi-viewport";
import { TooltipDirective } from "@progress/kendo-angular-tooltip";
import { DatePipe } from '@angular/common'
import { Template } from "@angular/compiler/src/render3/r3_ast";

const Utilization_Status_Types = ['charging' , 'idle' , 'executing' , 'hold']
@Component({
  selector: 'app-arcs-charts',
  templateUrl: './arcs-charts.component.html',
  styleUrls: ['./arcs-charts.component.scss']
})

export class ArcsChartsComponent implements OnInit {
  @ViewChild('navigatorChart') navigatorChart : ChartComponent
  @ViewChild('tooltipFr') tooltipFr : TooltipDirective
  @ViewChild('tooltipTo') tooltipTo : TooltipDirective
  @ViewChild('frDateTpl') frDateTpl : TemplateRef<any>
  @ViewChild('toDateTpl') toDateTpl : TemplateRef<any>
  frDateTplView
  @Input() set chartType(t){
    let orginalType = this._chartType
    this._chartType = t  
    if(orginalType){
      this.ngAfterViewInit()
    }
  }
  _chartType : "usability" | "utilization"
  get chartType(){
    return this._chartType
  }
  year = new Date().getFullYear()
  location
  dropdownData = {types:[]}
  dropdownOptions = {
    types:[],
    years:[ {value : this.year , text : this.year.toString()}], 
    locations:[]
  }

  fullYearDataset = {
    usability : {},
    utilization : {}
  }

  usability : {
    total: number,
    completed: number,
    canceled: number,
    incomplete: number,
    robotType: {
      //   return `${args.dataItem.category} \n ${(args.percentage * 100).toFixed(2)}%`;
      // },
      labelVisual : any
      data: any[],
      centerText: string
    },
    hourlyAvg: {
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
    }
  }

  usabilityData : {type : 'COMPLETED'|'CANCELED'|'INCOMPLETE'|'DAILY'|'HOURLY_AVG'|'WEEKLY_AVG'|'ROBOT_TYPE' , category? : string , value? : number}[] = []
  utilizationData: { type: 'ROBOT' | 'DAILY' | 'ROBOT_TYPE' , category? : string , charging : number , idle : number , executing : number , hold : number , total: number}[] = []

  utilization : {
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
      }
      min: any,
      max: any,
    },
    robotType: {
      labelContent: any //(arg : LegendLabelsContentArgs)=> arg.value > 0 ? arg.value + '%' : '',
      categories: any[],
      data: {
        charging: any[],
        idle: any[],
        executing:any[],
        hold:any[]
      }
    },
    robot: {
      charging: number,
      idle: number,
      executing: number,
      hold: number
    }[],
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

  constructor(public datepipe: DatePipe ,  private util :GeneralUtil , public uiSrv : UiService , private dataSrv : DataService ) {

  }

  async ngOnInit() {
    // this.init()
  }

  async ngAfterViewInit() {
    this.year = new Date().getFullYear()
    await this.initDropDown()
    this.init()
    this.refreshChart()
  }

  init() {  
    this.initUsability()
    this.initUtilization()
  }

  fetchData( fromDate: Date = null, toDate: Date = null){
    if(this._chartType == 'usability'){
      this.fetchUsability(fromDate , toDate) 
    }else if(this._chartType == 'utilization'){
      this.fetchUtilization(fromDate , toDate) 
    }
  }

  getSelectedDateRange(){
    let fr = null
    let to = null
    if(this._chartType == 'usability'){
      fr = this.usability.daily.min
      to = this.usability.daily.max
    }else if(this._chartType == 'utilization'){
      fr = this.utilization.daily.min
      to = this.utilization.daily.max
    }
    return {fromDate : fr , toDate : to}
  }

  public async onSelectStart(){
    this.tooltipFr.template = this.frDateTpl
    this.tooltipTo.template = this.toDateTpl
    this.dateRangeToolTip.from.handleEl = this.navigatorChart.surfaceElement.nativeElement.getElementsByClassName("k-left-handle")[0]
    this.dateRangeToolTip.to.handleEl = this.navigatorChart.surfaceElement.nativeElement.getElementsByClassName("k-right-handle")[0]
    this.tooltipFr.show( this.dateRangeToolTip.from.handleEl )
    this.tooltipTo.show( this.dateRangeToolTip.to.handleEl )
  }

  public async onSelect(evt){
    this.dateRangeToolTip.from.content = this.datepipe.transform(evt.from , 'dd MMM')
    this.dateRangeToolTip.to.content  = this.datepipe.transform(evt.to , 'dd MMM')
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
    this.refreshChart(args.from , args.to)

  }

  style = {
    textColor : '#FFFFFF',
    seriesColors: this.util.getConfigColors()
  }


  async initDropDown(){
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
  }

  initYearDropDown(firstYear : number ){
    this.dropdownOptions.years = []
    for(let i = firstYear ; i <= new Date().getFullYear() ; i ++){
      this.dropdownOptions.years.push({value : i  , text : i.toString()})
    }
  }

  refreshDateRange() {
    this.usability.daily.min = new Date(this.year, 0, 1)
    this.utilization.daily.min = new Date(this.year, 0, 1)
    if(this.year == new Date().getFullYear()){
      this.usability.daily.max = new Date()
      this.utilization.daily.max = new Date()
    }else{
      this.utilization.daily.max = new Date(this.year, 11, 31)
      this.usability.daily.max = new Date(this.year, 11, 31)
    }
  }

  async refreshChart(fr = null, to = null) {
    await this.retreiveData(fr , to)
    this.fetchData(fr , to)
  }

  async retreiveData( fromDate: Date = null, toDate: Date = null) {
    let isInit = fromDate == null && toDate == null
    fromDate = fromDate ? fromDate : this.getSelectedDateRange().fromDate
    toDate = toDate ? toDate : this.getSelectedDateRange().toDate    
    let ticket = this.uiSrv.loadAsyncBegin()
    let frDateStr = `${fromDate.getFullYear()}-${(fromDate.getMonth() + 1).toString().padStart(2, '0')}-${(fromDate.getDate()).toString().padStart(2, '0')}`
    let toDateStr = `${toDate.getFullYear()}-${(toDate.getMonth() + 1).toString().padStart(2, '0')}-${(toDate.getDate()).toString().padStart(2, '0')}`
    let data = []
    if(this._chartType == 'usability'){
      data = await this.dataSrv.httpSrv.get(`api/analytics/usability/v1?fromDate=${frDateStr}&toDate=${toDateStr}`)
      this.usabilityData = JSON.parse(JSON.stringify(data))
    }else if(this._chartType == 'utilization'){
      data =  await this.dataSrv.httpSrv.get(`api/analytics/utilization/v1?fromDate=${frDateStr}&toDate=${toDateStr}`) 
      this.utilizationData = JSON.parse(JSON.stringify(data))
    }
    if (fromDate.getFullYear() == toDate.getFullYear() && fromDate.getMonth() == 0 && fromDate.getDate() == 1 && ((
        toDate.getMonth() == 11 && toDate.getDate() == 31) ||
        (toDate.getFullYear() == new Date().getFullYear() && toDate.getMonth() == new Date().getMonth() && toDate.getDate() == new Date().getDate())
      )) {
      this.fullYearDataset[this._chartType][fromDate.getFullYear().toString()] = JSON.parse(JSON.stringify(data))
      if(this.chartType == 'utilization' && isInit){
        let tmpDate = toDate.getMonth() == 0 ?  new Date(toDate.getFullYear() , 0 , 1) : new Date(toDate.getFullYear() , toDate.getMonth() , toDate.getDate());
        tmpDate.setMonth(tmpDate.getMonth()-1);
        this.onSelectEnd({from : tmpDate , to : toDate})
      }
    }
    let firstYear = data.filter(r=>r.type == 'FIRST_YEAR')[0]?.category
    if(firstYear){
      this.initYearDropDown(Number(firstYear))
    }
    this.uiSrv.loadAsyncDone(ticket)
  }
  
  initUtilization(fromDate: Date = null  , toDate : Date = null) {
    this.utilization = {
      totalRobotHours: 0,
      totalExecutingHours : 0,
      daily: {
        transitions: false,
        navigatorStep: 365 / 12,
        categories: [],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: [],
        },
        min: null,
        max: null
      },
      robot:[],
      robotType: {
        labelContent: (arg: LegendLabelsContentArgs) => arg.value > 0 ? arg.value + '%' : '',
        categories: [],
        data: {
          charging: [],
          idle: [],
          executing: [],
          hold: []
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
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ?  new Date() : new Date(this.year + 1 , 0 , 1) 
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear; i++) {
      this.utilization.daily.categories.push(date);
      Utilization_Status_Types.forEach(t=>{
        this.utilization.daily.data[t].push(0);
      })
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    // let lastMonthSameDay = new Date(new Date().getFullYear(), new Date().getMonth() - 1 , new Date().getDate())
    // this.utilization.daily.min =  this.utilization.daily.categories[fromDate ? this.daysIntoYear(fromDate) - 1: 0]
    // let tmpMax = this.utilization.daily.categories[toDate ? this.daysIntoYear(toDate) - 1 : this.utilization.daily.categories.length - 1]
    // this.utilization.daily.max =  tmpMax ? tmpMax : this.utilization.daily.categories[this.utilization.daily.categories.length - 1]
    this.utilization.daily.min =  fromDate ? fromDate : this.utilization.daily.categories[0]
    this.utilization.daily.max =  toDate ? toDate : this.utilization.daily.categories[ this.utilization.daily.categories.length - 1]
    this.utilization.daily.categories.pop()
    this.utilization.daily.navigatorStep = Math.floor(this.utilization.daily.categories.length / 12);
  }

  initUsability(fromDate: Date = null  , toDate : Date = null) {
    this.usability = {
      total: null,
      completed: null,
      canceled: null,
      incomplete: null,
      robotType: {
        // labelContent : (args: LegendLabelsContentArgs) => {
        //   return `${args.dataItem.category} \n ${(args.percentage * 100).toFixed(2)}%`;
        // },
        labelVisual: (arg: SeriesLabelsVisualArgs) => {
          let ret = arg.createVisual();
          let mainText = (<Group>ret).children.filter(c => typeof c?.['chartElement'] === typeof new Text(undefined, undefined))[0]; //(c?.['chartElement']) instanceof Text
          (<Text>mainText).content(arg.dataItem.category);
          (<Group>ret).remove((<Group>ret).children.filter(c => typeof c?.['Path'])[0])
          let subText = new Text((arg.percentage * 100).toFixed(2) + '%', [(<Text>mainText).position().x, (<Text>mainText).position().y + 15], { font: `10px Arial`, fill: { color: '#BBBBBB' } });
          (<Group>ret).append(subText)
          return ret;
        },
        data: [],
        centerText: ''
      },
      hourlyAvg: {
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
        transitions: false,
        navigatorStep: 365 / 12,
        min: 0,
        max: 0
      }
    }
    this.usability.weeklyAvg.categories = Object.values(this.usability.weeklyAvg.categoriesMap)
    let date = new Date(this.year, 0, 1);
    let to = this.year == new Date().getFullYear() ?  new Date() : new Date(this.year  + 1 , 0 , 1) 
    let daysPassedInYear = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear; i++) {
      this.usability.daily.categories.push(date);
      this.usability.daily.data.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    // let lastMonthSameDay = new Date(new Date().getFullYear(), new Date().getMonth() - 1 , new Date().getDate())
    this.usability.daily.min =  fromDate ? fromDate : this.usability.daily.categories[0]
    this.usability.daily.max =  toDate ? toDate : this.usability.daily.categories[ this.usability.daily.categories.length - 1]
    this.usability.daily.navigatorStep = Math.floor(this.usability.daily.categories.length / 12);
    this.usability.daily.categories.pop()
    for (let i = 0; i < 24; i++) {
      this.usability.hourlyAvg.data.push(0)
    }
  }
  
  fetchUtilization(fromDate: Date = null, toDate: Date = null) {    
    this.initUtilization(fromDate , toDate)
    this.utilizationData = this.utilizationData.filter(r=>r.type != 'DAILY').concat(this.fullYearDataset.utilization[this.year.toString()].filter(r=>r.type == 'DAILY'))
    this.utilizationData.forEach(r => {
      if (r.type == 'DAILY') {
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) - 1))
        Utilization_Status_Types.forEach(t=> this.utilization.daily.data[t][index] = this.getRoundedValue(r[t]))       
      }else if(r.type == 'ROBOT'){
        r['utilPercent'] = this.util.trimNum(r.executing * 100 / r.total , 2) + '%'
        this.utilization.robot.push(r)
        this.utilization.totalExecutingHours += r.executing
        this.utilization.totalRobotHours += r.total
      }else if(r.type == 'ROBOT_TYPE'){
        let category = this.uiSrv.translate(<DropListType[]>this.dropdownData.types.filter(t => t.enumName == r.category)[0]?.description)
        this.utilization.robotType.categories.push(category)
        Utilization_Status_Types.forEach(t=> this.utilization.robotType.data[t][this.utilization.robotType.categories.length - 1] = this.getRoundedValue(r[t] * 100 / r.total))       
      }
    });
    let sortedUtilByTypes = this.utilizationData.filter(r=>r.type == 'ROBOT_TYPE').sort((a,b) => b.executing / b.total -  a.executing / a.total)
    // sortedUtilByTypes = [] //sortedUtilByTypes.slice(0 , 1 )
    for (let i = 0; i < Math.min(3, sortedUtilByTypes.length); i++) {
      let r = sortedUtilByTypes[i]
      let category = this.uiSrv.translate(<DropListType[]>this.dropdownData.types.filter(t => t.enumName == r.category)[0]?.description)
      this.utilization.total['type' + (i + 1)] = { robotType: category, executing: r.executing, total: r.total }
    }
    // this.utilization.totalExecutingHours = this.utilizationData.filter(r=>r.type == 'ROBOT').reduce((acc , inc) => acc + inc.executing , 0)
  }

  fetchUsability(fromDate: Date = null, toDate: Date = null) {    
    this.initUsability(fromDate , toDate)
    this.usabilityData = this.usabilityData.filter(r=>r.type != 'DAILY').concat(this.fullYearDataset.usability[this.year.toString()].filter(r=>r.type == 'DAILY'))
    this.usabilityData.forEach(r => {
      if (r.type == 'COMPLETED') {
        this.usability.completed = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'INCOMPLETE') {
        this.usability.incomplete = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'CANCELED') {
        this.usability.canceled = this.getRoundedValue(r.value , 0)
      } else if (r.type == 'DAILY') {
        let splitedDateString = r.category.split("-")
        let index = this.daysIntoYear(new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) - 1))
        this.usability.daily.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'HOURLY_AVG') {
        this.usability.hourlyAvg.data[Number(r.category)] = this.getRoundedValue(r.value)
      } else if (r.type == 'WEEKLY_AVG') {
        let index = Object.keys(this.usability.weeklyAvg.categoriesMap).indexOf(r.category?.toUpperCase())
        this.usability.weeklyAvg.data[index] = this.getRoundedValue(r.value)
      } else if (r.type == 'ROBOT_TYPE') {
        let category = this.uiSrv.translate(<DropListType[]>this.dropdownData.types.filter(t => t.enumName == r.category)[0]?.description)
        this.usability.robotType.data.push({ category: category , value: this.getRoundedValue(r.value) })
      }
    })
    this.usability.total = this.usability.completed + this.usability.incomplete + this.usability.canceled
    this.usability.robotType.centerText =  this.usability.total.toString() + ' \n ' + this.uiSrv.translate('Tasks')
  }

  getRoundedValue(value : number , decimalPlace : number = 2){
    return Number(this.util.trimNum(value , decimalPlace))
  }
  
  daysIntoYear(date) {
    return (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 24 / 60 / 60 / 1000;
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