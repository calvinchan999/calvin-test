import { Text, Group} from "@progress/kendo-drawing";
import { LegendLabelsContentArgs, SeriesLabelsVisualArgs } from '@progress/kendo-angular-charts';
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
import { BehaviorSubject, from, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';


@Component({
  selector: 'app-arcs-charts',
  templateUrl: './arcs-charts.component.html',
  styleUrls: ['./arcs-charts.component.scss']
})
export class ArcsChartsComponent implements OnInit {
  year = new Date().getFullYear()
  location
  dropdownData = {types:[]}
  dropdownOptions = {
    types:[],
    years:[ {value : this.year , text : this.year.toString()}], 
    locations:[]
  }
  fullYearDataset = {}
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

  data : {type : 'COMPLETED'|'CANCELED'|'INCOMPLETE'|'DAILY'|'HOURLY_AVG'|'WEEKLY_AVG'|'ROBOT_TYPE' , category? : string , value? : number}[] = []
  constructor(  private util :GeneralUtil , public uiSrv : UiService , private dataSrv : DataService ) {
 
  }

  async ngOnInit() {
    this.initUsability()
  }

  async ngAfterViewInit() {
    await this.initDropDown()
    this.initUsability()
    await this.retreiveData()
    this.fetchData()
  }

  
  public async onSelectEnd(args: any) {
    // set the axis range displayed in the main pane to the selected range
    this.usability.daily.min = args.from;
    this.usability.daily.max = args.to;
    // stop the animations
    this.usability.daily.transitions = false;
    await this.retreiveData()
    await this.fetchData( this.usability.daily.min ,  this.usability.daily.max)
  }

  style = {
    textColor : '#FFFFFF',
    seriesColors: this.util.getConfigColors()
  }


  async initDropDown(){
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
  }


  async retreiveData( fromDate: Date = null, toDate: Date = null) {
    fromDate = fromDate ? fromDate : this.usability.daily.min
    toDate = toDate ? toDate : this.usability.daily.max
    let ticket = this.uiSrv.loadAsyncBegin()
    let frDateStr = `${fromDate.getFullYear()}-${(fromDate.getMonth() + 1).toString().padStart(2, '0')}-${(fromDate.getDate()).toString().padStart(2, '0')}`
    let toDateStr = `${toDate.getFullYear()}-${(toDate.getMonth() + 1).toString().padStart(2, '0')}-${(toDate.getDate()).toString().padStart(2, '0')}`
    this.data = await this.dataSrv.httpSrv.get(`api/analytics/usability/v1?fromDate=${frDateStr}&toDate=${toDateStr}`)
    if (fromDate.getFullYear() == toDate.getFullYear() && fromDate.getMonth() == 0 && fromDate.getDate() == 1 &&
          ( (toDate.getMonth() == 11 && toDate.getDate() == 31) || 
            (toDate.getFullYear() == new Date().getFullYear() && toDate.getMonth() == new Date().getMonth() && toDate.getDate() == new Date().getDate())
          )
       ) {
      this.fullYearDataset[fromDate.getFullYear().toString()] = JSON.parse(JSON.stringify(this.data))
    }
    this.uiSrv.loadAsyncDone(ticket)
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
    let daysPassedInYear = Math.ceil((new Date().getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < daysPassedInYear; i++) {
      this.usability.daily.categories.push(date);
      this.usability.daily.data.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
    let lastMonthSameDay = new Date(new Date().getFullYear(), new Date().getMonth() - 1 , new Date().getDate())
    this.usability.daily.min =  this.usability.daily.categories[fromDate ? this.daysIntoYear(fromDate) - 1: 0]
    let tmpMax = this.usability.daily.categories[toDate ? this.daysIntoYear(toDate) - 1 : this.usability.daily.categories.length - 1]
    this.usability.daily.max =  tmpMax ? tmpMax : this.usability.daily.categories[this.usability.daily.categories.length - 1]

    this.usability.daily.navigatorStep = Math.floor(this.usability.daily.categories.length / 12);

    for (let i = 0; i < 24; i++) {
      this.usability.hourlyAvg.data.push(0)
    }
  }
  
  fetchData(fromDate: Date = null, toDate: Date = null) {    
    this.initUsability(fromDate , toDate)
    this.data = this.data.filter(r=>r.type != 'DAILY').concat(this.fullYearDataset[this.year.toString()].filter(r=>r.type == 'DAILY'))
    this.data.forEach(r => {
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