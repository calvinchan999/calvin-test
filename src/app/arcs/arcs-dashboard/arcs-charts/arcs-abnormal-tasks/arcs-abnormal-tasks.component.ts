import { Component, OnInit , HostBinding } from '@angular/core';
import { SeriesLabelsVisualArgs } from '@progress/kendo-angular-charts';
import { Group, Text } from '@progress/kendo-drawing';
import { DataService } from 'src/app/services/data.service';
import { EnumNamePipe, UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ArcsChartsComponent } from '../arcs-charts.component';


@Component({
  selector: 'app-arcs-abnormal-tasks',
  templateUrl: './arcs-abnormal-tasks.component.html',
  styleUrls: ['./arcs-abnormal-tasks.component.scss']
})

export class ArcsAbnormalTasksComponent implements OnInit {
  dialogRef
  data = []
  total
  parent : ArcsChartsComponent
  selectedTab = 'summary'
  taskState = 'failed'
  fromDate 
  toDate
  tabs=[
    { id: 'summary', label: 'Summary' },
    { id: 'detail', label: 'Detail' }
  ]
  gridSettings = {
    failed:{
      functionId:"TASK",
      apiUrl:"api/task/failed/page/v1",
      defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'createdDateTime'}]},
      columns:[
        { title: "Description", id: "name", width: 100 },
        { title: "Assigned To", id: "robotCode", width: 50 },
        { title :"Aborted Reason" , id : "reasonCode" , width : 50},
        { title :"Reason Remarks" , id : "reasonMessage" , width : 100},
        { title: "Created Date", id: "createdDateTime",  type: "date" , width: 50 },
      ]
    },
    canceled: {
      functionId: "TASK",
      apiUrl: "api/task/canceled/page/v1",
      defaultState: { skip: 0, take: 15, sort: [{ dir: 'desc', field: 'createdDateTime' }] },
      columns: [
        { title: "Description", id: "name", width: 100 },
        { title: "Assigned To", id: "robotCode", width: 50 },
        { title: "Cancel Reason", id: "reasonCode", width: 50 },
        { title: "Reason Remarks", id: "reasonMessage", width: 100 },
        { title: "Created Date", id: "createdDateTime", type: "date", width: 50 },
      ]
    }
  }

  summary = {
    data: {
      reason: [],
      robot_type: [],
      daily: []
    },
    categories: {
      daily: []
    },
    style: {
      textColor: '#FFFFFF',
      seriesColors: this.util.getConfigColors()
    },

    labelVisual: (arg: SeriesLabelsVisualArgs) => {
      // arg.options.set("font" , "20px Airal")
      let ret = arg.createVisual();
      let mainText : Text = <any>(<Group>ret).children.filter(c => typeof c?.['chartElement'] === typeof new Text(undefined, undefined))[0]; //(c?.['chartElement']) instanceof Text
      // (<Text>mainText).options.set("font" , "20px Arial");
      (<Text>mainText).content(arg.dataItem.category);
      (<Group>ret).remove((<Group>ret).children.filter(c => typeof c?.['Path'])[0])
      let subText = new Text((arg.percentage * 100).toFixed(2) + '%', [(<Text>mainText).position().x, (<Text>mainText).position().y + 25], { font: `10px Arial`, fill: { color: '#BBBBBB' } });
      (<Group>ret).append(subText)
      return ret;
    }
  }

  @HostBinding('class') cssClass = 'dialog-content '

  constructor(public uiSrv : UiService , public dataSrv : DataService , public util : GeneralUtil) { }
  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.cssClass += this.taskState + '-tasks'
    Object.keys(this.gridSettings).forEach(k=>{
      this.gridSettings[k].defaultState['filter'] = {
        filters : [{field : 'createdDateTime' , operator : 'gte' , value : this.fromDate} , {field : 'createdDateTime' , operator : 'lte' , value : this.toDate} ],
        logic : 'and'
      }
    })
    var ddl = await this.dataSrv.getDropLists(['taskFailReason' , 'taskCancelReason'])
    this.gridSettings.failed.columns.filter(c => c.id == 'reasonCode')[0]['dropdownOptions'] =  ddl.option['taskFailReason']
    this.gridSettings.canceled.columns.filter(c => c.id == 'reasonCode')[0]['dropdownOptions'] =  ddl.option['taskCancelReason']
    this.gridSettings = JSON.parse(JSON.stringify(this.gridSettings))
    this.initSummaryCategories()
    this.refreshSummary()
    this.uiSrv.loadAsyncDone(ticket)
  }

  initSummaryCategories(){
    let date = new Date(this.fromDate.getTime());
    let to = new Date(this.toDate.getTime());
    let ticks = Math.ceil((to.getTime() - date.getTime()) / (1000 * 3600 * 24))
    for (let i = 0; i < ticks + 1 ; i++) {
      this.summary.categories.daily.push(date);
      this.summary.data.daily.push(0);
      let newDate = new Date()
      newDate.setTime(date.getTime() + 86400000)
      date = newDate
    }
  }
  
  async refreshSummary() {
    let ticket = this.uiSrv.loadAsyncBegin()
    var data : {type : string , category : string , value : number}[] =  await this.dataSrv.httpSrv.get(`api/analytics/task/v1?state=${this.taskState.toUpperCase()}&fromDate=${this.util.getSQLFmtDateStr(this.fromDate)}&toDate=${this.util.getSQLFmtDateStr(this.toDate)}`) 
    Object.keys(this.summary.data).forEach(k=>{
      if(k=="daily"){
        data.filter(d=>d.type == k.toUpperCase()).forEach(r=>{
          let splitedDateString = r.category.split("-")
          let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) - 1)
          let index = this.summary.categories.daily.filter(d=>d.getTime() == date.getTime()).map(d=>this.summary.categories.daily.indexOf(d))[0]
          this.summary.data.daily[index] = Number(this.util.trimNum(r.value, 0))
        })
      }else{
        this.summary.data[k] = data.filter(d => d.type == k.toUpperCase()).map(r => {
          return {
            type: r.type,
            category: this.uiSrv.translate(new EnumNamePipe().transform(r.category)),
            value: Number(this.util.trimNum(r.value, 0))
          }
        })
      }
    })
    this.summary.data = JSON.parse(JSON.stringify(this.summary.data))
    this.uiSrv.loadAsyncDone(ticket)
  }
}
