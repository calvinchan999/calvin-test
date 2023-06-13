import { ChangeDetectorRef, Component, ComponentRef, Input, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogRef, DialogService, WindowRef } from '@progress/kendo-angular-dialog';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import { filter, take, takeUntil } from 'rxjs/operators';
import { DataService} from 'src/app/services/data.service';
import { DropListAction, DropListDataset, DropListLocation, FloorPlanDataset, RobotMaster, ShapeJData, JTask, ActionParameter, TaskStateOptions } from 'src/app/services/data.models';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { TranslatePipe, UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { ListviewComponent, listViewFocusChangeEvent } from 'src/app/ui-components/listview/listview.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CmTaskJobActionComponent } from './cm-task-job-action/cm-task-job-action.component';
import { CmTaskJobParametersComponent } from './cm-task-job-parameters/cm-task-job-parameters.component';
import { of, Subject } from 'rxjs';
import { AuthService } from 'src/app/services/auth.service';
import { TabStripComponent } from '@progress/kendo-angular-layout';
import { ConfigService } from 'src/app/services/config.service';
import { PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { MapService } from 'src/app/services/map.service';

@Component({
  selector: 'app-cm-task-job',
  templateUrl: './cm-task-job.component.html',
  styleUrls: ['./cm-task-job.component.scss']
})
export class CmTaskJobComponent implements OnInit {
  $onDestroy = new Subject()
  @ViewChild('tabstrip') tabstrip : TabStripComponent
  @ViewChild('listview') listview : ListviewComponent
  @ViewChild('mapContainer') pixiElRef : Map2DViewportComponent
  constructor(public util: GeneralUtil, public uiSrv: UiService, public dialogService: DialogService, public ngZone: NgZone, public httpSrv: RvHttpService, public mapSrv : MapService,
    public changeDetector: ChangeDetectorRef, private dataSrv: DataService, public dialogSrv: DialogService, public authSrv: AuthService , public configSrv : ConfigService) {
    this.jobListDef = this.jobListDef.filter(d => d.id != 'floorPlanCode' || !this.util.standaloneApp)
    // this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }
  @Input() parent 
  @Input() readonly = false
  @Input() isTemplate = false
  @Input() isExecuteTemplate = false
  get pk(){
    return this.isTemplate ? 'missionId' : 'taskId'
  }
  @Input() set code(v){
    this.frmGrp.controls[this.pk].setValue(v)
  }
  get code(){
    return this.frmGrp.controls[this.pk].value
  }

  frmGrp = new FormGroup({
    taskId: new FormControl({value: '', disabled: true} , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    missionId: new FormControl('' , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    robotCode : new FormControl(null),
    robotType : new FormControl(null),
    robotSubtype : new FormControl(null),
    name: new FormControl(null ,Validators.required),
    modifiedDateTime: new FormControl(null),
    floorPlanCode: new FormControl(null),
    state : new FormControl(null),
    reasonCode : new FormControl(null),
    reasonMessage : new FormControl(null)
  })

  frmGrp2 = new FormGroup({
    loop: new FormControl(1)
  })

  dialogRef : DialogRef
  dropdownData : DropListDataset = {
    sites:[],
    buildings:[],
    floorplans:[],
    locations :[],
    actions :[],
    types:[],
    subTypes:[],
    robots : []
  }

  dropdownOptions ={
    sites:[],
    buildings:[],
    floorplans:[],
    locations :[],
    actions :[],
    navigationMode :[],
    types:[],
    subTypes:[],    
    robots : [],
    taskState : [],
    reason : []
  }

  selectedFloorPlanCode 

  loadingTicket
  actionViewMode = 'list'
  actionRowCfg = { parentRowKey: 'actionProperties', detailRowLabelKey: 'parameterName', detailRowValueKey: 'value' }
  jobListDef = [
    { id: 'drag' , type: 'drag',title: '',  width: 5 },
    { id: 'seq',  type: 'seq' , title: '#', width: 5 },
    { id: 'floorPlanCode', title: 'Floor Plan', width: 30 , type : 'dropdown' },
    { id: 'pointCode', title: 'Location', width: 15 , type : 'dropdown'},
    { id: 'actionAlias', title: 'Action', width: 20 , type : 'dropdown', notNull: true , translateOption : true},
    { id: 'navigationMode', title: 'Navigation Mode', width: 20 , type : 'dropdown',  notNull: true  , translateOption : true , hidden :  this.configSrv.dbConfig.DISABLE_PATH_FOLLOWING || this.configSrv.disabledModule_SA.pathFollowing},
    { id: 'orientation', title: 'Orientation', width: 10 , type : 'checkbox' },
    { id: this.actionRowCfg.parentRowKey , type: 'button', title: 'Parameters', width: 10, class: 'k-icon mdi mdi-text-box-search-outline',
      newRow: {id: ''}
    },
    { id: 'remove', type: 'button', action: 'remove', title: '', width: 5, class: 'k-icon mdi mdi-close-thick',
      newRow: {
        id: 'add', type: 'button', action: 'add', class: 'k-icon mdi mdi-check-bold'
      }
    }
  ]

  jobListData : FlattenedTaskItem[] = []
  actionNewRow : FlattenedTaskItem  = {}

  isTableLoading = false
  // subscriptions = []
  floorplanStore = {}
  pixiObjs = {
    points : [],
    lines : [],
    arrowsData:[],
    arrowContainer : null,
  }

  mapObj : {steps : {planCode? : string , label? : string , icon ? : any}[] , currentStep :number , enable : boolean , dijkstra: {} , path : any } = {
    steps:[],
    currentStep : 0,
    enable:true,
    dijkstra:{},
    path:null,
  }

  validatePathFollowing = true
  compRef : ComponentRef<any>
  robotInfo : RobotMaster
  get isCreate(){
    return this.parentRow == null || this.parentRow == undefined
  }
  parentRow
  defaultRobotType = null

  //TBD : POLLING / SIGNALR AUTO REFRESH TASK STATUS
  ngOnInit(): void {
    this.readonly = (!this.isTemplate && !this.isExecuteTemplate && this.parentRow) || this.readonly || !this.authSrv.hasRight(this.isTemplate ?(this.isCreate? "TASK_TEMPLATE_EDIT" : "TASK_TEMPLATE_ADD") : "TASK_ADD")
    if(this.util.standaloneApp){
       ['robotCode', 'robotType' , 'robotSubtype'].forEach(k=> delete this.frmGrp.controls[k])
    }
    if(!this.isExecuteTemplate){
      delete this.frmGrp.controls[this.isTemplate ? 'taskId' : 'missionId']
    }
    // this.isCreate = !this.id
    this.jobListDef = this.jobListDef.filter(d => (d.id != 'remove' || !this.readonly)) 
    
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>{
        this.frmGrp.controls[k].disable()
      })
    }
  }

  async ngAfterViewInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    if(!this.util.arcsApp){
      this.robotInfo = await this.dataSrv.getRobotMaster()
    }
    await this.initDropDown()
    if (!this.isCreate) {
      await this.loadData(this.parentRow[this.pk])
    } else {
      this.refreshGridLocationOptions_SA()
    }
    if(this.util.arcsApp || this.robotInfo){
      this.uiSrv.loadAsyncDone(ticket)
    } 

  }

  
  ngOnDestroy(){
    this.$onDestroy.next()
  }


  async loadData(missionId) {
    let ticket = this.uiSrv.loadAsyncBegin()
    let data : JTask = await this.httpSrv.get((this.isTemplate ? "api/task/mission/v1/" : "api/task/v1/") + missionId.toString())
    // data.state  = 'CANCELED'
    // data.reasonCode = 'WRONG_TASK'
    // data.reasonMessage = `Incorrectly created task`
    if(this.util.arcsApp){
      if (data.state == 'CANCELED') {
        this.dropdownOptions.reason = (await this.dataSrv.getDropList('taskCancelReason')).options
      } else if (data.state == 'FAILED') {
        this.dropdownOptions.reason = (await this.dataSrv.getDropList('taskFailReason')).options
      }
    }
    this.util.loadToFrmgrp(this.frmGrp, data)
    if (this.util.standaloneApp) {
      this.frmGrp.controls['floorPlanCode'].setValue(data.taskItemList[0].movement.floorPlanCode)
      this.selectedFloorPlanCode = this.frmGrp.controls['floorPlanCode'].value
      this.refreshGridLocationOptions_SA()
    }
    this.listview.loadData(this.jobListDataMassage(false, null, this.getFlattenedData(data)))
    this.uiSrv.loadAsyncDone(ticket)
  }

  getFlattenedData(data: JTask) : FlattenedTaskList{
    let ret = []
    data.taskItemList.forEach(t => {
      t.actionList.forEach(a =>{
        let taskItem : FlattenedTaskItem = {
          floorPlanCode : t.movement.floorPlanCode,
          pointCode : t.movement.pointCode,
          navigationMode : t.movement.navigationMode,
          actionAlias : a.alias,        
          actionProperties : this.dropdownData.actions.filter(dda => dda.alias == a.alias)[0]?.parameterList.map(p=>{return {
            struct: p,
            parameterName : p.name,
            value : a.properties[p.parameterCode]
          }}),
          orientation : !t.movement.orientationIgnored
        } 
        ret.push(taskItem)
      })
    });
    return ret
  }  

  async initDropDown(){
    //let dropListData = await this.dataSrv.getDropLists(<any>(['floorplans' , 'actions', 'locations'].concat(this.util.arcsApp ? ['sites','buildings'] : [])))
    let dropListData = await this.dataSrv.getDropLists(<any>(['floorplans' , 'actions', 'locations' ].concat(<any> this.util.arcsApp ? ['types' , 'subTypes' , 'robots'] : [])))
    this.dropdownData = <any> dropListData.data
    this.dropdownOptions = JSON.parse(JSON.stringify(<any> dropListData.option))
    this.dropdownOptions.navigationMode = [{value :'AUTONOMY' , text:'Automatic'}, {value :'PATH_FOLLOWING' , text:'Path Follow'}]
    // this.dropdownData.actions = this.dropdownData.actions
    // this.dropdownOptions.actions = this.dropdownOptions.actions
    this.dropdownOptions.taskState = TaskStateOptions
    let tableColOptMap = {
      actionAlias : 'actions',
      pointCode : 'locations',
      navigationMode : 'navigationMode'
    }
    if(!this.util.standaloneApp){
      tableColOptMap['floorPlanCode'] = 'floorplans'
    }
    Object.keys(tableColOptMap).forEach(k=> this.jobListDef.filter(d => d['id'] == k)[0]['options'] = this.dropdownOptions[tableColOptMap[k]])
    if(!this.parentRow && this.defaultRobotType){
      this.frmGrp.controls['robotType'].setValue(this.defaultRobotType)
      this.refreshRobotOptions()
    }
  }


  cleanseAllRows(){
    this.cleanseRow(this.actionNewRow)
    this.jobListData.forEach(r=>this.cleanseRow(r))
    // this.refreshGridNewRow()
  }

  refreshGridLocationOptions_ARCS(evt){
    if(evt.id == 'pointCode'){
      let options = this.dataSrv.getDropListOptions('locations', this.dropdownData.locations , {floorPlanCode : evt.row['floorPlanCode']})
      if(evt.row == this.actionNewRow){
        this.setColumnDefNewRowProperty('pointCode', 'options', options)
      }else{
        evt.options = options;
      }
    }
  }

  async onFloorplanChange_SA(evt){
    if(this.jobListData.length > 0 && !await this.uiSrv.showConfirmDialog('Are you sure to clear all action entries?')){
      this.selectedFloorPlanCode = evt.previousValue
      return
    }
    this.refreshGridLocationOptions_SA()
    this.jobListData = []
    if(this.actionViewMode == 'map'){  
      this.refreshMapView()
    }
  }

  refreshRobotOptions(){
    if(!this.parentRow){
      this.dropdownOptions.robots = this.dataSrv.getDropListOptions('robots',this.dropdownData.robots , this.frmGrp.controls['robotType'].value ? {robotType : this.frmGrp.controls['robotType'].value}: null)
      if(!this.dropdownOptions.robots.map(v=>v.value).includes(this.frmGrp.controls['robotCode'].value)){
        this.frmGrp.controls['robotCode'].setValue(null)
      }
    }
  }

  refreshRobotType(){
     if(this.frmGrp.controls['robotCode'].value){
      this.frmGrp.controls['robotType'].setValue(this.dropdownData.robots.filter(r=>r.robotCode == this.frmGrp.controls['robotCode'].value)[0]?.robotType)
     }    
  }
  
  getActionDropListData(row){
    let pointType = this.dropdownData.locations.filter(l=>l.floorPlanCode == row?.floorPlanCode &&  l.pointCode == row?.pointCode)[0]?.pointType
    let robotType = this.frmGrp.controls['robotType']?.value ? this.frmGrp.controls['robotType'].value : this.dropdownData.robots?.filter(r=> r.robotCode == this.frmGrp.controls['robotCode'].value)[0]?.robotType
    return this.dropdownData.actions.filter(a => {
      if((this.frmGrp.controls['robotType']?.value && 
          (a.allowedRobotTypes && !a.allowedRobotTypes.includes(robotType))) || 
          (pointType && (a.allowedPointTypes && !a.allowedPointTypes.includes(pointType)))){
        return false
      }else {
        return true
      }
    })
  }

  refreshActionDropdown(evt: { options: { value: string, text: string }[], row: any } , defs = null) { 
    let options = this.dataSrv.getDropListOptions('actions', this.getActionDropListData(evt.row))
    if (defs) {
      let col = defs.filter(c=>c['id'] == 'actionAlias')[0]
      col['newRow'] = [null , undefined].includes(col['newRow']) ? JSON.parse(JSON.stringify(col)) : col['newRow']
      col['newRow']['options'] = options
    } else if (evt.row == this.actionNewRow) {
      this.setColumnDefNewRowProperty('actionAlias', 'options', options)
    } else {
      evt.options = options
    }
  }

  refreshGridLocationOptions_SA(){
    if(this.util.standaloneApp){
      let options = this.dataSrv.getDropListOptions( 'locations', this.dropdownData.locations , {floorPlanCode : this.selectedFloorPlanCode}) 
      this.jobListDef.filter(d => d.id == 'pointCode')[0]['options'] = options
      this.setColumnDefNewRowProperty('pointCode', 'options', options)
    }
  }
  
  refreshGridNavigationOption(evt : listViewFocusChangeEvent){
    if(!this.validatePathFollowing){
      return
    }
    // let prevRow = this.getPrevLocRow(evt.row)
    // evt.disabled = this.forceAutoNavigation(evt.row['pointCode'] , prevRow?.['pointCode'] , evt.row['floorPlanCode'] )
  }

  async refreshActionParameter(row:FlattenedTaskItem = this.actionNewRow , originalActionAlias = null) {
    let hasDefinedParam = row.actionProperties?.filter(r => ![null, undefined].includes(r.value)).length > 0
    if (row != this.actionNewRow && hasDefinedParam &&
      !await this.uiSrv.showConfirmDialog(this.uiSrv.translate("Are you sure to change the action and clear the defined parameters ?"))
    ) {
      row.actionAlias = originalActionAlias
      return
    }
    if (row.actionAlias) {
      let ddlActionData = this.dropdownData.actions.filter(a=>a.alias == row.actionAlias)[0]
      if (ddlActionData) {
        row.actionProperties = ddlActionData.parameterList.map(param => {
          let ret = { struct : param, parameterName: param.name , value : null}
          let defaultValue : any =  param.defaultValue;
          defaultValue = param?.parameterType == 'NUMBER' ? Number(defaultValue):  defaultValue
          defaultValue = param?.parameterType  == 'BOOLEAN' ? defaultValue == 'true' : defaultValue
          ret.value = defaultValue === undefined ? null : defaultValue
          return ret
        })     
      }else{
        delete row.actionProperties
      }
    } else if(!row.actionAlias ){
      delete row.actionProperties
    }
  }

  setColumnDefNewRowProperty(columnId : string, key :string, value :any){
    let def = this.jobListDef.filter(c=>c['id'] == columnId)[0]
    def['newRow'] = [null , undefined].includes(def['newRow']) ? JSON.parse(JSON.stringify(def)) : def['newRow']
    def['newRow'][key] = value
  }

  cleanseRow(row : FlattenedTaskItem ){
    if(this.util.arcsApp){
      let validPointCodes = this.dropdownData.locations.filter(o => o.floorPlanCode == row.floorPlanCode).map(s => s.pointCode);
      if( !validPointCodes.includes(row.pointCode)){
        if(row.pointCode!=null){
          this.listview?.setAnimatedBackground(row , 'pointCode')
        }
        row.pointCode = null
      }
    }
  }

  getPrevLocRow(row = null){ // get the lastest action which is at different location & return its row in jobList
    row = row == this.actionNewRow ? null  :row
    return this.jobListData.filter(r=> ![null,undefined].includes(r.pointCode) && (row == null || this.jobListData.indexOf(r) < this.jobListData.indexOf(row))).
                            sort((a,b)=>(b['seq'] - a['seq']))[0]
  }

  addRow(){
    let row : FlattenedTaskItem = JSON.parse(JSON.stringify(this.actionNewRow))
    row['seq'] = this.jobListData.length + 1 ;
    let prevRow : FlattenedTaskItem  = this.getPrevLocRow();
    if(prevRow && prevRow.pointCode == row.pointCode){
      row.floorPlanCode = null
      row.pointCode = null
      row.orientation = prevRow.orientation
    }else if(!prevRow && ( !(this.util.standaloneApp ? (this.selectedFloorPlanCode) : row.floorPlanCode) || !row.pointCode)){
        this.listview.setNewRowError(this.uiSrv.translate('Please select location'))
        return
    }
    row.navigationMode =  row.navigationMode ?  row.navigationMode  : 'AUTONOMY'
    row.actionAlias = row.actionAlias  ? row.actionAlias : null
    this.jobListData.push(row) 
    this.jobListData = JSON.parse(JSON.stringify(this.jobListData)) // refresh grid , trigger change detection
    this.actionNewRow.actionAlias = null
    this.actionNewRow.actionProperties = []
    this.cleanseRow(this.actionNewRow)
    // this.refreshFormNavigationOption()
  }

  showActionDetailDialog(evt){
    let compMap = {}
    let row : FlattenedTaskItem  = evt.row
    let convertType = (value , type)=>{
      if(type=='NUMBER'){
        return Number(value)
      }else if(type == 'BOOLEAN'){
        return value == 'true' || value == true
      }else{
        return value?.toString()
      }
    }
    //this.getParamLabel(evt.row) //make sure user can add parameter (parameter with null value has been clenased when calling the function get submit dataset)
    compMap[this.actionRowCfg.parentRowKey] = CmTaskJobParametersComponent 
    this.ngZone.run(()=>{
      const dialog = this.uiSrv.openKendoDialog({
        content: compMap[evt.id] ,
      });
      const comp  = dialog.content.instance;
      comp.dialogRef = dialog
      comp.parent = this
      comp.row = row
      this.jobListDataMassage(true, comp.row)
      comp.actionName = this.dropdownData.actions.filter(a=>a.alias == row.actionAlias)[0]?.name
      comp.rowSummary = this.listview?.getRowSummary({ floorPlanCode: row.floorPlanCode, pointCode:  row.pointCode })
      row.actionProperties?.forEach(d=>
        d[this.actionRowCfg.detailRowValueKey] = convertType(d[this.actionRowCfg.detailRowValueKey] ,d.struct.parameterType)
      )
      this.jobListDataMassage(false)
      dialog.result.subscribe(()=>this.jobListData = JSON.parse(JSON.stringify(this.jobListData)))//force tooltip to refresh
    })    
  }

  validateFloorplan(){
    if(this.util.arcsApp){
      let invalidIndex = this.jobListData.filter(d=> (this.jobListData.indexOf(d) == 0 && !d.floorPlanCode) ||(d.floorPlanCode != null && d.pointCode == null)).map(d => this.jobListData.indexOf(d))[0]
      if(invalidIndex != null && invalidIndex !=undefined){
        this.tabstrip.selectTab(0)
        setTimeout(()=>  this.listview.setErrors(invalidIndex, 'pointCode' , 'Please select location'))
        return false
      }
      return true 
    }else{
      return  this.dropdownOptions.floorplans.map(o=>o.value).includes(this.selectedFloorPlanCode)
    }
  }

  async validate() {
    //TBD with Row With Floorplan but no waypoint selected
    if(!this.util.validateFrmGrp(this.frmGrp)){
      return false
    }
    if(!this.validateFloorplan()){
      this.uiSrv.showWarningDialog("Invalid Floor Plan")
      return false
    }

    if( !this.listview.validate()){
      return false
    }
    
    let actionParamRegexMatch = true
    let data = this.jobListDataMassage(true,null,JSON.parse(JSON.stringify(this.jobListData)))
    if(this.jobListData.length == 0){
      this.uiSrv.showMsgDialog("Please input at least 1 action")
      return false
    }

    for(let i = 1 ; i < data.length ;i++){
      let row : FlattenedTaskItem = data[i]
      if(row.pointCode == null || row.pointCode == undefined){
        this.tabstrip.selectTab(0)
        setTimeout(()=> this.listview.setErrors(i, 'pointCode' , 'Please select location'))
        return false
      }
      
      if(row?.actionAlias && !this.getActionDropListData(row).map(r=>r.alias).includes(row?.actionAlias)){
        this.listview.setErrors(i, 'actionAlias', 'Action not match with the selected robot type / location')
        return false
      }

      if(row.actionProperties?.length > 0){
        row.actionProperties.forEach(p=>{
            if(p.struct &&  p.struct.regex.length > 0 &&  !new RegExp(p.struct.regex).test(p.value)){
              let msg = `Invalid action parameter setting (Must match Regex [${p.struct.regex}])`
              if(actionParamRegexMatch){
                this.uiSrv.showMsgDialog(msg)
              }
              this.listview.setErrors(i, this.actionRowCfg.parentRowKey, msg)
              actionParamRegexMatch = false
              return
            }    
        })      
      }      
    }    
    return actionParamRegexMatch && this.util.validateFrmGrp(this.frmGrp)
  }

  getSubmitDataset() : JTask{
    let getActionProperties = (r : FlattenedTaskItem)=>{
      let ret2 = {}
      r.actionProperties?.forEach(p=> ret2[p.struct.parameterCode] = p.value)
      return ret2
    }
    let body : JTask = {
      taskItemList: (this.jobListDataMassage()).map((r)=>{
        return {
          actionListTimeout: 0,
          movement: {
            floorPlanCode : r.floorPlanCode,
            pointCode: r.pointCode,
            waypointName : r.pointCode,
            navigationMode: this.configSrv.disabledModule_SA.pathFollowing || this.configSrv.dbConfig.DISABLE_PATH_FOLLOWING ?  "AUTONOMY" : r.navigationMode ,
            orientationIgnored: !r.orientation,
            fineTuneIgnored: true
          },
          actionList: r.actionAlias ? [
            {
              alias : r.actionAlias,
              properties: getActionProperties(r)              
            }
          ] : []
        }
      })
    }

    Object.keys(this.frmGrp.controls).forEach(k=> body[k] = this.frmGrp.controls[k].value)

    for(let i = 1 ; i < body.taskItemList.length ; i++ ){
      if(body.taskItemList[i] && body.taskItemList[i].movement.pointCode == body.taskItemList[i - 1].movement.pointCode && body.taskItemList[i].movement.floorPlanCode == body.taskItemList[i - 1].movement.floorPlanCode ){
        body.taskItemList[i - 1].actionList = body.taskItemList[i - 1].actionList.concat(JSON.parse(JSON.stringify(body.taskItemList[i].actionList)))
        body.taskItemList = body.taskItemList.filter(itm => itm != body.taskItemList[i])
        i = i -1
      }
    }
    return body
  }

  checkNoChanges() : boolean{
   return false
  }

  async onClose(prompt = true){
    if(this.uiSrv.isTablet){
      if(this.parent.selectedTab == 'add'){
        this.parent.selectTabProgramatically('jobs')
      }
      this.parent.vcRef?.remove()
      this.parent.vcRef?.insert(this.parent.listViewRef)
      await this.parent.loadData()

      setTimeout(()=>{
        this.parent.tabletListScrollTo(this.code)
        this.parent.destroyTabletTaskJobComp()
      })
    }else if( this.readonly || !prompt || this.checkNoChanges() || await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }
  
  async saveToDB(){
    this.tabstrip.selectTab(0)
    setTimeout(async()=>{
      if(!await this.validate()){
        return
      }
      let ds = this.getSubmitDataset()
      let url = ((this.isTemplate && !this.isExecuteTemplate )? "api/task/mission/v1" : (`api/task/v1${this.util.arcsApp || !this.frmGrp2.controls['loop'].value ? '' : ('/' + this.frmGrp2.controls['loop'].value)}`))
      if ((await this.dataSrv.saveRecord( url , ds , this.frmGrp , this.isCreate || this.isExecuteTemplate)).result == true) {
        this.parent.loadData()
        this.onClose(false)
      }
      this.jobListDataMassage(false)
    })
  }



  getFloorfloorPlanCodeBypointCode(ptCode){
    return this.dropdownData.locations.filter(l => l.pointCode == ptCode)[0].floorPlanCode
  }

 
  jobListDataMassage(fillupLocation = true , row : FlattenedTaskItem = null , rows : FlattenedTaskList = this.jobListData){
    let getReferenceRow = (r : FlattenedTaskItem )=>{
      let idx = Math.max.apply(null , rows.filter(r2=>rows.indexOf(r2) < rows.indexOf(r) && r2.floorPlanCode && r2.pointCode).map(r2=>rows.indexOf(r2)))
      return rows[idx]
    }
    if(fillupLocation){
      rows.forEach(r=>r.floorPlanCode =  this.util.standaloneApp ?this.selectedFloorPlanCode : r.floorPlanCode )
      rows.filter(r => (row == null || row == r) && (!this.util.arcsApp || [null , undefined].includes(r.floorPlanCode)) && [null , undefined].includes(r.pointCode)).forEach(r => {
        var ref = getReferenceRow(r)
        r.pointCode = ref?.pointCode
        r.floorPlanCode = ref?.floorPlanCode
        r.navigationMode =  ref?.navigationMode
        r.orientation = ref?.orientation
      })
    }else{
      rows.filter(r=>(row==null || row == r) && r.pointCode == getReferenceRow(r)?.pointCode && r.floorPlanCode == getReferenceRow(r)?.floorPlanCode).forEach(r=>{
        r.pointCode = null;
        r.floorPlanCode = null;
        r.navigationMode =  getReferenceRow(r)?.navigationMode
        r.orientation =  getReferenceRow(r)?.orientation
      })
    }
    rows.forEach(r=> r.navigationMode = r.navigationMode ? r.navigationMode : "AUTONOMY")
    return rows
 }


  // v * * * map view * * * v

  actionViewModeChanged(evt){
    let orginalViewMode = this.actionViewMode
    this.actionViewMode = evt.index == 1 ? 'map' : 'list'
    if(this.actionViewMode == 'map'){
      if(orginalViewMode =='list' && !this.validateFloorplan()){
        evt.preventDefault()
      }
      this.initMapViewStepper()
      this.jobListDataMassage(false)
      setTimeout(async ()=>{
          // this.pixiElRef.reset()
          if(this.pixiElRef){
            this.selectedFloorPlanCode = this.jobListData.filter(r=>r.floorPlanCode)[0]?.floorPlanCode ?  this.jobListData.filter(r=>r.floorPlanCode)[0]?.floorPlanCode  : this.selectedFloorPlanCode
            this.pixiElRef.initDone$.subscribe(async () => {
              this.refreshMapView()
           })     
          }
      })
    }else{
      if(this.selectedFloorPlanCode){
        this.refreshGridLocationOptions_SA()
      }
      this.jobListDataMassage(false)
    }
  }

  get selectedFloorPlanData() {
    return this.floorplanStore[this.selectedFloorPlanCode]
  }

  async refreshMapView() {
    if(this.validateFloorplan()){
      setTimeout(async()=>{
        await this.getFloorplanDs(this.selectedFloorPlanCode)
        await this.pixiElRef.loadDataset(this.floorplanStore[this.selectedFloorPlanCode], true, true)
        this.refreshMapDrawings()
      })
      return
    } 
  }

  async getFloorplanDs(fpCode : string) : Promise<FloorPlanDataset>{
    if(!this.floorplanStore[fpCode]){
      this.floorplanStore[fpCode] = await this.mapSrv.getFloorPlan(fpCode) 
    }
    return this.floorplanStore[fpCode.toString()]
  }

  onMapPointSelected(pixiPt : PixiWayPoint) {
    this.ngZone.run(() => {
      if (!this.pixiElRef) {
        return
      }
      this.pixiElRef._ngPixi.viewport.pausePlugin('wheel')
      const dialog = this.uiSrv.openKendoDialog({
        content: CmTaskJobActionComponent,
      });
      const actionComp: CmTaskJobActionComponent = dialog.content.instance;
      actionComp.readonly = this.readonly
      actionComp.dialogRef = dialog
      actionComp.locationCode = pixiPt.text
      actionComp.frmGrp.controls['floorPlanCode'].setValue(this.selectedFloorPlanCode)
      actionComp.frmGrp.controls['pointCode'].setValue(pixiPt.code)
      actionComp.parent = this
      actionComp.gr = pixiPt
      actionComp.actionListData = this.jobListData.filter(r => (r.floorPlanCode == this.selectedFloorPlanCode || this.getPrevLocRow(r)?.floorPlanCode == this.selectedFloorPlanCode) && 
                                                               (r.pointCode == pixiPt.code || ([null, undefined].includes(r.pointCode) && this.getPrevLocRow(r)?.pointCode == pixiPt.code)))
      actionComp.dropdownData = JSON.parse(JSON.stringify(this.dropdownData))
      actionComp.dropdownOptions = JSON.parse(JSON.stringify(this.dropdownOptions))
      dialog.result.subscribe(() => {
        this.jobListData = this.jobListDataMassage(false)
        this.pixiElRef._ngPixi.viewport.resumePlugin('wheel')
        setTimeout(() => {
          this.refreshMapDrawings()
        })
      })
    })
  }

  initMapViewStepper() { //init Stepper
    if(this.validateFloorplan()){
      let floorPlanCodes = this.jobListData.filter(r => r.floorPlanCode != null && r.floorPlanCode != undefined).map(r => r.floorPlanCode)
      this.mapObj.steps = []
      floorPlanCodes.forEach(fid => {
        if ((this.mapObj.steps.length == 0 || this.mapObj.steps[this.mapObj.steps.length - 1].planCode != fid) && this.dropdownData.floorplans.filter(r => r.floorPlanCode == fid).length > 0) {
          this.mapObj.steps.push({ planCode: fid, label: this.dropdownData.floorplans.filter(r => r.floorPlanCode == fid)[0].name})
        }
      })
      if(this.util.arcsApp && !this.readonly){
        this.mapObj.steps.push({ label: this.uiSrv.translate('new'), icon: 'add' })
      }
      if ([null, undefined].includes(this.selectedFloorPlanCode)) {
        this.selectedFloorPlanCode = floorPlanCodes.length > 0 ? floorPlanCodes[0] : this.dropdownData.floorplans[0]?.floorPlanCode
      }
    }
  }

  getAggregatedActions() : { floorPlanCode : string , pointCode : string , navigationMode : 'PATH_FOLLOWING' | 'AUTONOMOUS' }[] {
    let ret : {floorPlanCode : string , pointCode : string , navigationMode : string}[] = []
    this.jobListData.forEach(j => {
      if (ret.length == 0 || (!( ret[ret.length - 1].floorPlanCode == j.floorPlanCode && ret[ret.length - 1].pointCode == j.pointCode) && ![undefined, null].includes(j.pointCode))) {
        ret.push({ floorPlanCode : j.floorPlanCode , pointCode: j.pointCode, navigationMode: j.navigationMode })
      }
    })
    return <any>ret
  }

  refreshMapDrawings() { //TBR : mouseover animation function should be provided in drawing board

      // let tmpPIXI = new PixiCommonGeometry()
      let actionLocations = this.getAggregatedActions()
      this.pixiElRef.module.task.drawTaskPaths(actionLocations)
    
  }
}

type FlattenedTaskList = FlattenedTaskItem[]
type FlattenedTaskItem = {
  floorPlanCode? : string
  pointCode ? : string
  actionAlias? : string 
  navigationMode? : string
  actionListTimeout?: number 
  actionProperties? : {
    struct : ActionParameter
    value : any
    parameterName : string
  }[]
  orientation? : boolean
}

  // forceAutoNavigation(loc, prevLoc, fp) {
  //   return ![null, undefined].includes(prevLoc) && ([null, undefined].includes(loc) || loc == prevLoc || !this.definedPathReachable(loc, prevLoc, fp))
  // }