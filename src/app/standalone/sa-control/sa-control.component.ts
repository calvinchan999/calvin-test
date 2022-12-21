import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { DialogRef, DialogService, WindowRef } from '@progress/kendo-angular-dialog';
import { takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { CmActionComponent } from 'src/app/common-components/cm-action/cm-action.component';
import { AuthService } from 'src/app/services/auth.service';
import { ActionParameter, DataService, DropListAction, DropListMap, signalRType } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ConfigService } from 'src/app/services/config.service';

@Component({
  selector: 'app-sa-control',
  templateUrl: './sa-control.component.html',
  styleUrls: ['./sa-control.component.scss']
})
export class SaControlComponent implements OnInit , OnDestroy  {
  @ViewChild('table') actionTableRef : TableComponent

  readonly = {
    controls : false,
    robot: false
  }

  optionObj = {
    type : null ,
    title: '',
    safetyZone:{
      mode:"NORMAL"
    },
    maxSpeed:{
      limit : 1
    }
  }

  safetyZoneOptions = [
    { value: 'NORMAL', text: 'Normal' },
    { value: 'MINIMUM', text: 'Minimum' },
    { value: 'CUSTOM_1', text: 'Custom 1' },
    { value: 'CUSTOM_2', text: 'Custom 2' }
  ]

  constructor(public authSrv : AuthService, public uiSrv : UiService, public windowSrv: DialogService, private util : GeneralUtil , private router : Router,
              private httpSrv : RvHttpService, public dataSrv:DataService , private route : ActivatedRoute , public configSrv : ConfigService) { 
    if(this.uiSrv.isTablet){
      this.tabs = [
        {id: 'controls' , label : 'Controls', functionId : 'CONTROLS'},
        {id: 'robot' , label : 'Robot' , functionId : 'ROBOT'},
        {id: 'log' , label : 'Event Log', functionId : 'ROBOT'}
      ]
    }
    this.readonly.controls = !this.authSrv.hasRight("CONTROLS_EDIT")
    this.readonly.robot = !this.authSrv.hasRight("ROBOT_EDIT")
    this.tabs = this.tabs.filter(t=>this.authSrv.hasRight(t.functionId.toUpperCase()))
    this.selectedTab = this.route.snapshot.paramMap.get('selectedTab') ? this.route.snapshot.paramMap.get('selectedTab') : this.tabs[0].id
  }

  $onDestroy = new Subject()
  
  selectedTab = ''
  tabs = [
    {id: 'controls' , label : 'Controls', functionId : 'CONTROLS'},
    {id: 'robot' , label : 'Robot', functionId : 'ROBOT'},
    {id: 'log' , label : 'Event Log', functionId : 'ROBOT'}
  ]
  showMap = false
  data = []
  id

  frmGrpRobot = new FormGroup({
    robotId: new FormControl(null),
    robotCode: new FormControl('', Validators.required),
    name: new FormControl(''),
    robotTypeName:new FormControl(''),
    robotType: new FormControl(null),
    robotStatus: new FormControl(null),
    robotIPAddress: new FormControl(null),

    robotMaxSpeed: new FormControl(null),
    robotSafetyZone: new FormControl(null),
  })

  // frmGrpType = new FormGroup({
  //   type : new FormControl(null),
  //   code: new FormControl(''),
  //   status: new FormControl(null),
  //   subtype: new FormControl(''),
  //   actionIds: new FormControl(null),
  // })

  // v * * * table * * * v
  columnDef = [
    { title: "#", type: "button", id: "edit", width: 20 , icon : 'k-icon k-i-edit iconButton' , fixed:true},
    { title: "Alias", id: "actionAlias", width: 150 },
    { title: "Action Description", id: "actionName", width: 150 },
    { title: "Type", id: "typeNames", width: 50 },
    // { title: "Alias", id: "actionAlias", width: 150 },
    { title: "Clazz", id: "actionClass", width: 150 },
  ]
  tableDisabledButtons = {new : false , action : true}
  isTableLoading = false
  dropdownData = {
    // sites : [],
    types:[]
    // floors:[]
  }

  dropdownOptions = {
    // sites : [],
    types:[]
    // floors:[]
  }



  // ^ * * * table * * * ^

  ngOnInit() {
    this.route.params.pipe(takeUntil(this.$onDestroy)).subscribe(params => {
      if (params?.selectedTab) {
        this.onTabChange(params?.selectedTab)
      }
    });
    this.initDropdown()
    this.onTabChange(this.selectedTab)
  }

  onButtonClicked(id){
    console.log(id)
  }

  
  onTabChange(id) {
    this.selectedTab = id
    this.data = []
    this.loadData()
    this.router.navigate([this.router.url.split(";")[0]])
    // this.columnDef = this.columnsDefsMap[id]
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  async initDropdown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let safetyZoneAction : DropListAction = (await this.dataSrv.getDropLists(["actions"]))?.data?.['actions']?.filter((a:DropListAction)=> a.alias == 'SAFETY_ZONE_CHANGE')[0];
    if(safetyZoneAction){
      let enumList  = safetyZoneAction.parameterList.filter((a:ActionParameter)=>a.parameterCode == 'mode')[0]?.enumList
      if(enumList){
        this.safetyZoneOptions = enumList.map(e=>{return{text: e.label , value : e.value}})
      }
    } 
    // ["types"].forEach(k=>{
    //   this.dropdownData[k] = dropdownObj.data[k]
    //   this.dropdownOptions[k] = dropdownObj.option[k]
    // })
    this.uiSrv.loadAsyncDone(ticket)
  }
  
  showActionDetail(evt = null){
    const window : DialogRef = this.uiSrv.openKendoDialog({content: CmActionComponent , preventAction:()=>true});
    const content = window.content.instance;
    content.parent = this
    content.windowRef = window
    content.id = evt ? evt.row?.['actionId'] : null
    window.result.subscribe(()=> this.loadData())
  }

  async loadData() {
    let ticket = this.uiSrv.loadAsyncBegin()
    if(this.selectedTab == 'robot'){
      let data = await this.httpSrv.get("api/robot/v1")
      this.util.loadToFrmgrp(this.frmGrpRobot , data)
    }else if(this.selectedTab == 'type'){
      
    }else if(this.selectedTab == 'action'){
      this.actionTableRef?.retrieveData()
    }
    this.uiSrv.loadAsyncDone(ticket)
  }

  async saveToDB(){
    if((this.selectedTab == 'robot' && !this.util.validateFrmGrp(this.frmGrpRobot))){
      return
    }
    
    if(this.selectedTab == 'robot'){
      if ((await this.dataSrv.saveRecord( "api/robot/v1" , this.frmGrpRobot.value)).result == true) {
        this.loadData()
      }
    }else if(this.selectedTab == 'type'){
      
    }
  }

  
  async sendSafetyZoneRequestToRV(){
    if( await this.httpSrv.rvRequest('PUT','baseControl/v1/safetyZone/' + this.optionObj.safetyZone.mode, undefined,true, "Set Safety Zone")){
      this.optionObj.type = null
      this.optionObj.title = null
    }
  }

  
  async sendMaxSpeedRequestToRV(){
    if( await this.httpSrv.rvRequest('PUT','baseControl/v1/speed/' + this.optionObj.maxSpeed.limit, undefined,true, "Set Maximum Speed")){
      this.optionObj.type = null
      this.optionObj.title = null
    }
  }
}
