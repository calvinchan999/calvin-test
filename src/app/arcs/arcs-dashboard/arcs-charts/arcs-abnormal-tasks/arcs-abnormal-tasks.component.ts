import { Component, OnInit , HostBinding, ViewChild } from '@angular/core';
import { HighlightVisualArgs, SeriesLabelsVisualArgs, SeriesVisualArgs } from '@progress/kendo-angular-charts';
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
  @ViewChild('robotTypeDonut') robotTypeDonut
  @ViewChild('reasonDonut') reasonDonut
  @ViewChild('robotBar') robotBar
  dialogRef
  data = []
  total
  parent : ArcsChartsComponent
  selectedTab = 'summary'
  taskState = 'failed'
  fromDate 
  toDate
  robotType
  robotCode
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
        { title: "Robot Type", id: "robotTypeFilter", width: 50 },
        { title :"Aborted Reason" , id : "reasonCode" , width : 50},
        { title :"Reason Remarks" , id : "reasonMessage" , width : 100},
        { title: "Created Date", id: "createdDateTime",  type: "date" , width: 60 },
      ]
    },
    canceled: {
      functionId: "TASK",
      apiUrl: "api/task/canceled/page/v1",
      defaultState: { skip: 0, take: 15, sort: [{ dir: 'desc', field: 'createdDateTime' }] },
      columns: [
        { title: "Description", id: "name", width: 100 },
        { title: "Assigned To", id: "robotCode", width: 50 },
        { title: "Robot Type", id: "robotTypeFilter", width: 50 },
        { title: "Cancel Reason", id: "reasonCode", width: 50 },
        { title: "Reason Remarks", id: "reasonMessage", width: 100 },
        { title: "Created Date", id: "createdDateTime", type: "date", width: 60 },
      ]
    }
  }

  dateRangeDesc = null

  summary = {
    total : 0,
    data: {
      reason: [],
      robot_type: [],
      daily: [],
      robot:[]
    },
    categories: {
      daily: [],
      robot:[]
    },
    style: {
      textColor: '#FFFFFF',
      seriesColors: this.util.getConfigColors(),
      labelVisual : (arg: SeriesLabelsVisualArgs) => {
        let ret = arg.createVisual();
        let mainText = (<Group>ret).children.filter(c => typeof c?.['chartElement'] === typeof new Text(undefined, undefined))[0];
        if(arg.sender == this.robotTypeDonut || arg.sender == this.reasonDonut){
          (<Text>mainText).content(arg.dataItem.category);
          let subTextContent = `${(arg.percentage * 100).toFixed(2)}%`;
          (<Group>ret).remove((<Group>ret).children.filter(c => typeof c?.['Path'])[0])
          let subText = new Text(subTextContent, [(<Text>mainText).position().x, (<Text>mainText).position().y + 15], { font: `11px Arial`, fill: { color: '#BBBBBB' } });
          (<Group>ret).append(subText)
        }else{
          (<Text>mainText).content(arg.value);
        }
        if ((arg.sender == this.robotTypeDonut && this.parent.isDimmed(arg, (<Text>mainText).content())) || (arg.sender == this.robotBar && this.robotCode && this.robotCode != arg.value)) {
          ret.options.set('opacity', this.parent.style.dimOpacity)
        }
        return ret;
      },    
      highlightVisual : (arg: SeriesVisualArgs)=>{
        let ret = arg.createVisual();
        if((this.robotType && arg.sender == this.robotTypeDonut && arg.dataItem.robotType!= this.robotType) || (arg.sender == this.robotBar && this.robotCode && this.robotCode != arg.category) ){
          ret.options.set('opacity' , this.parent.style.dimOpacity)
        }
        return ret;
      }
    }
  }


  @HostBinding('class') cssClass = 'dialog-content '

  constructor(public uiSrv : UiService , public dataSrv : DataService , public util : GeneralUtil) { }
  async ngOnInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    this.cssClass += this.taskState + '-tasks'
    Object.keys(this.gridSettings).forEach(k=>{
      this.gridSettings[k].defaultState['filter'] = {
        filters : [{field : 'createdDateTime' , operator : 'gte' , value : this.fromDate} , {field : 'createdDateTime' , operator : 'lte' , value : new Date(this.toDate.getTime() + 86400000)} ].
                  concat(this.robotType? [{field : 'robotTypeFilter' , operator : 'eq' , value : this.robotType}]: []).
                  concat(this.robotCode? [{field : 'robotCode' , operator : 'eq' , value : this.robotCode}]: []) ,
        logic : 'and'
      }
    });
    var ddl = await this.dataSrv.getDropLists(['taskFailReason' , 'taskCancelReason' , 'types'])
    this.gridSettings.failed.columns.filter(c=>c.id == 'robotTypeFilter')[0]['dropdownOptions'] = ddl.option['types']
    this.gridSettings.canceled.columns.filter(c=>c.id == 'robotTypeFilter')[0]['dropdownOptions'] = ddl.option['types']
    this.gridSettings.failed.columns.filter(c => c.id == 'reasonCode')[0]['dropdownOptions'] =  ddl.option['taskFailReason']
    this.gridSettings.canceled.columns.filter(c => c.id == 'reasonCode')[0]['dropdownOptions'] =  ddl.option['taskCancelReason']
    this.gridSettings = JSON.parse(JSON.stringify(this.gridSettings))
    this.refreshSummary()
    this.uiSrv.loadAsyncDone(ticket)
  }

  initSummaryCategories(){
    this.summary.data = {
      reason: [],
      robot_type: [],
      daily: [],
      robot:[]
    }
    this.summary.categories = {
      daily: [],
      robot:[]
    }
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
    this.initSummaryCategories()
    let ticket = this.uiSrv.loadAsyncBegin()
    var data : {type : string , category : string , value : number}[] =  await this.dataSrv.httpSrv.get(`api/analytics/task/v1?state=${this.taskState.toUpperCase()}&fromDate=${this.util.getSQLFmtDateStr(this.fromDate)}&toDate=${this.util.getSQLFmtDateStr(this.toDate)}${this.robotType ? `&robotType=${this.robotType}` : ''}${this.robotCode ? `&robotCode=${this.robotCode}` : ''}`) 
    let filteredRobotData = this.robotCode && data.filter(r => r.type == 'ROBOT' && r.category == this.robotCode).length == 0 ? [{ type: 'ROBOT', category: this.robotCode, value: 0 }] : []
    data = data.filter(r => r.type != 'ROBOT').concat((data.filter(r => r.type == 'ROBOT').sort((a, b) => b.value - a.value)).concat((<any>filteredRobotData)))
    Object.keys(this.summary.data).forEach(k=>{
      data.filter(d=>d.type == k.toUpperCase()).forEach(r=>{
        if(k=="daily"){
            let splitedDateString = r.category.split("-")
            let date = new Date(Number(splitedDateString[0]), Number(splitedDateString[1]) - 1, Number(splitedDateString[2]) )
            let index = this.summary.categories.daily.filter(d=>d.getTime() == date.getTime()).map(d=>this.summary.categories.daily.indexOf(d))[0]
            this.summary.data.daily[index] = Number(this.util.trimNum(r.value, 0))
        }else if(k == "robot"){
            this.summary.data.robot.push(Number(this.util.trimNum(r.value, 0)))
            this.summary.categories.robot.push(r.category)
        }else {
          this.summary.data[k].push(
            {
              type: r.type,
              robotType : k == 'robot_type'?  r.category : undefined,
              category: this.uiSrv.translate(new EnumNamePipe().transform(r.category)),
              value: Number(this.util.trimNum(r.value, 0))
            }
          )
        }
      })
    
    })
    this.summary.total = this.summary.data.robot_type.filter(d=>!this.parent.robotTypeFilter || d.robotType == this.parent.robotTypeFilter ).reduce((acc, i) => acc + i.value, 0)
    this.summary.data = JSON.parse(JSON.stringify(this.summary.data))
    this.uiSrv.loadAsyncDone(ticket)
  }
}
