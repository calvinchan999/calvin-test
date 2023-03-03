import { Component, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { FilterExpression } from "@progress/kendo-angular-filter";
import { TabStripComponent } from '@progress/kendo-angular-layout';
import { CompositeFilterDescriptor } from "@progress/kendo-data-query";
import { DataService, dropListType } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-setup-robot-coop',
  templateUrl: './arcs-setup-robot-coop.component.html',
  styleUrls: ['./arcs-setup-robot-coop.component.scss']
})
export class ArcsSetupRobotCoopComponent implements OnInit {
  windowRef
  parent
  parentRow
  @ViewChild('tabstrip') tabstrip : TabStripComponent
  @ViewChild("template", { static: true })
  selectedTabIndex = 0
  public template: TemplateRef<any>;
  frmGrp = new FormGroup({
    eventName: new FormControl('Air Quality'),
    name: new FormControl('Dispatch disinfection robot when IEQ is low'),
    robotType: new FormControl(null)
  })
  dropdownData = {
    types:[],
    missions: []
  }

  dropdownOptions = {
    types:[] ,     
    missions: []
  }
  
  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }

  async ngOnInit() {
    await this.initDropdown()
    this.frmGrp.controls['robotType'].setValue('PATROL')
  }

  ngAfterViewInit(){
    this.addRule()
  }
  
  async initDropdown() {
    let ticket = this.uiSrv.loadAsyncBegin()
    let types : dropListType []  = ["types" , "missions"]
    let actionDropObj = await this.dataSrv.getDropLists(types);
    types.forEach(k => {
      this.dropdownData[k] = actionDropObj.data[k]
      this.dropdownOptions[k] = actionDropObj.option[k]
    })
    // let missionDDL =  await this.dataSrv.getDropList('missions')
    // this.dropdownData.missions = missionDDL.data
    this.dropdownOptions.missions = [
      {value : "D-01", text : "Peform Spraying"},
      {value : "D-02", text : "Activate Filter"}
    ]
    this.uiSrv.loadAsyncDone(ticket)
  }

  filters: FilterExpression[] = [
    {
      field: "pm10",
      title: "PM 10",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },  
    {
      field: "pm25",
      title: "PM 2.5",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
    {
      field: "tvoc",
      title: "TVOC",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
    {
      field: "co2",
      title: "Carbon Dioxide",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
    {
      field: "co",
      title: "Carbon Monoxide",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
    {
      field: "o3",
      title: "Ozone",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
    {
      field: "no",
      title: "Nitrogen Dioxide",
      editor: "number",
      operators: [ "lt" , "gt" , "eq"],
    },
  ];

  defaultFilterValue: CompositeFilterDescriptor = {
    logic: "and",
    filters: [],
  };

  rules : {name : string ,filters : FilterExpression[] , filterValues : CompositeFilterDescriptor , missionId : string  }[] = []

  addRule(){
    // this.tabstrip.selectTab(0)
    this.rules.push({
      name : 'Rule ' + (this.rules.length  + 1 ),
      filters : JSON.parse(JSON.stringify(this.filters)),
      filterValues : JSON.parse(JSON.stringify(this.defaultFilterValue)),
      missionId : null
    })    
    this.selectedTabIndex = this.rules.length - 1 
    this.rules = JSON.parse(JSON.stringify(this.rules))
    // this.tabstrip.selectTab(0)
    // this.tabstrip.selectTab( this.selectedTabIndex)
    // this.tabstrip.ngOnInit()
  }

 
  onFilterChange( value: CompositeFilterDescriptor): void {

  }

  async onClose() {
    if (await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')) {
      this.windowRef.close()
    }
  }

  async saveToDB(){
    this.windowRef.close()
    this.uiSrv.showNotificationBar("Save Successful" , 'success' , undefined , undefined, true)
    
    // if(!await this.validate()){
    //   return
    // }

    // if((await this.dataSrv.saveRecord("api/robot/v1"  , await this.getSubmitDataset(), this.frmGrp , false)).result){      
    //   this.windowRef.close()
    // }
  }

}
