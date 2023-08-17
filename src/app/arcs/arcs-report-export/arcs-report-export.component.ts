import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DropListFloorplan, DropListRobot, DropListRobotEventType, DropListRobotType } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-arcs-report-export',
  templateUrl: './arcs-report-export.component.html',
  styleUrls: ['./arcs-report-export.component.scss']
})
export class ArcsReportExportComponent implements OnInit {

  constructor(public uiSrv : UiService , public dataSrv : DataService) { }
  dropdownData : {
    robots:DropListRobot[],
    types : DropListRobotType[],
    robotEventTypes : DropListRobotEventType[],
    floorplans : DropListFloorplan[],
  }
  dropdownOptions = {
    reportType : [{value :  'robot_event' , text : 'Event History'} , {value : 'task' , text : 'Task History'} , {value : 'utilization' , text : 'Utilization'} ]
  }

  reportType = this.dropdownOptions.reportType[0]?.value

  cfg : {[key: string] : { filters : {} , layout : {uc :string , key : string , optionType ? : string , text? : string}[]}} = {
    robot_event : {
      filters : {
        robotCode : null,
        eventType : null,
        floorPlanCode : null,
        eventDateTimeFrom : null,
        eventDateTimeTo : null,
      },
      layout : [
        {uc : 'datetime' , key : 'eventDateTimeFrom' , text :"From Date" },
        {uc : 'datetime' , key : 'eventDateTimeTo' , text :"To Date" },
        {uc : 'dropdown' , key : 'robotCode' , optionType : 'robots' , text :"Robot" },
        {uc : 'dropdown' , key : 'eventType' , optionType : 'robotEventTypes'  , text :"Event Type" },
        {uc : 'dropdown' , key : 'floorPlanCode' , optionType : 'floorplans'  , text :"Floor Plan"  },
      ]     
    },
    task : {
      filters  :{      
        robotCode : null,
        robotType : null,
        createdDateTimeFrom : null,
        createdDateTimeTo : null
      },
      layout : [
        {uc : 'datetime' , key : 'createdDateTimeFrom' , text :"From Date" },
        {uc : 'datetime' , key : 'createdDateTimeTo' , text :"To Date" },
        {uc : 'dropdown' , key : 'robotCode' , optionType : 'robots', text :"Robot" },
        {uc : 'dropdown' , key : 'robotType' , optionType : 'types', text :"Robot Type" },
      ],
    },
    utilization : {
      filters  :{     
        robotCode : null,
        utilizationDateTimeFrom : null,
        utilizationDateTimeTo : null
      }, 
      layout :  [
        {uc : 'datetime' , key : 'utilizationDateTimeFrom' , text :"From Date"  },
        {uc : 'datetime' , key : 'utilizationDateTimeTo' , text :"To Date" },
        {uc : 'dropdown' , key : 'robotCode' , optionType : 'robots' , text :"Robot" },
      ]
    }
  }

  

  async ngOnInit() {
    const DDL = await this.dataSrv.getDropLists(['robots', 'robotEventTypes', 'types', 'floorplans'])
    Object.keys(DDL.option).forEach(k => this.dropdownOptions[k] = JSON.parse(JSON.stringify(DDL.option[k])))
    this.dropdownData = JSON.parse(JSON.stringify(DDL.data)) 
  }

  async genReport(){
    this.dataSrv.exportReport(this.reportType , this.cfg[this.reportType].filters)
  }

}
