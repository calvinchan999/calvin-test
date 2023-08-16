import { Location } from '@angular/common';
import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Route, Router } from '@angular/router';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { Subject} from 'rxjs';
import { filter, take , takeUntil} from 'rxjs/operators';
import { CmActionComponent } from 'src/app/common-components/cm-action/cm-action.component';
import { CmMapDetailComponent } from 'src/app/common-components/cm-map/cm-map-detail/cm-map-detail.component';
import { CmMapFloorplanComponent } from 'src/app/common-components/cm-map/cm-map-floorplan/cm-map-floorplan.component';
import { AuthService } from 'src/app/services/auth.service';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ArcsSetupBuildingComponent } from './arcs-setup-building/arcs-setup-building.component';
import { ArcsSetupExportFloorplanComponent } from './arcs-setup-export/arcs-setup-export-floorplan/arcs-setup-export-floorplan.component';
import { ArcsSetupExportMapComponent } from './arcs-setup-export/arcs-setup-export-map/arcs-setup-export-map.component';
import { ArcsSetupImportFloorplanComponent } from './arcs-setup-import/arcs-setup-import-floorplan/arcs-setup-import-floorplan.component';
import { ArcsSetupImportMapComponent } from './arcs-setup-import/arcs-setup-import-map/arcs-setup-import-map.component';
import { ArcsSetupPointTypeComponent } from './arcs-setup-point-type/arcs-setup-point-type.component';
import { ArcsSetupRobotCoopComponent } from './arcs-setup-robot-coop/arcs-setup-robot-coop.component';
import { ArcsSetupRobotComponent } from './arcs-setup-robot/arcs-setup-robot.component';
import { ArcsSetupSiteComponent } from './arcs-setup-site/arcs-setup-site.component';
import { ArcsSetupTypeComponent } from './arcs-setup-type/arcs-setup-type.component';
import { ArcsSetupFloorplan3dComponent } from './arcs-setup-floorplan3d/arcs-setup-floorplan3d.component';
import { MqService } from 'src/app/services/mq.service';
import { MapService } from 'src/app/services/map.service';
import { RouteService } from 'src/app/services/route.service';

@Component({
  selector: 'app-arcs-setup',
  templateUrl: './arcs-setup.component.html',
  styleUrls: ['./arcs-setup.component.scss']
})
export class ArcsSetupComponent implements OnInit {
  @ViewChild('table') tableElRef: TableComponent
  @ViewChild('pixi') pixiElRef: Map2DViewportComponent
  constructor( public routeSrv : RouteService , public mapSrv : MapService, public mqSrv : MqService, public windowSrv: DialogService, public dataSrv : DataService, public uiSrv: UiService, public http: RvHttpService, private location : Location, private router : Router,
              private changeDectector: ChangeDetectorRef, private route : ActivatedRoute, private util: GeneralUtil, private ngZone: NgZone , private authSrv : AuthService) { 
      this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.hasRight(this.gridSettings[t.id].functionId?.toUpperCase()))
      // this.selectedTab = this.route.snapshot.paramMap.get('selectedTab') ? this.route.snapshot.paramMap.get('selectedTab') : this.tabs[0].id
      
      Object.keys(this.tableCustomButtons).forEach(k=> {
        this.tableCustomButtons[k].forEach(btn=>{
          if(!this.authSrv.hasRight(btn?.functionId)){
            this.tableCustomButtons[k] = this.tableCustomButtons[k].filter(b=> b!=btn)
          }
        })
      })
  }
  
  tabs = [
    { id: 'robot', label: 'Robot' , authorized : true},
    { id: 'site', label: 'Site'},
    { id: 'building', label: 'Building'},
    { id: 'floorplan', label: 'Floor Plan' },
    { id: 'map', label: 'Map' },
    // { id: 'robotCoop' , label : 'Robot Collaboration'},
    { id: 'pointType', label: 'Waypoint Type'},
    // { id: 'synclog', label: 'Data Sync Log' },
    // { id: 'log', label: 'System Log' , authorized : false},
  ]
  set selectedTab (tab : string){
    this._selectedTab = tab
    this.routeSrv.refreshQueryParam( { selectedTab: this.selectedTab })
  }
  _selectedTab 
  get selectedTab(){
    return this._selectedTab
  }

  tableCustomButtons = {
    map:[{id : 'importMap' , label : 'Import' , icon : 'import' , disabled : false  ,  functionId : 'MAP_IMPORT' }  , {id : 'exportMap' , label : 'Export' , icon : 'export' , disabled : false ,  functionId : 'MAP_EXPORT' }],
    floorplan:[{id : 'importFloorplan' , label : 'Import' , icon : 'import' , disabled : false  ,  functionId : 'FLOORPLAN_IMPORT' } ,  {id : 'exportFloorplan' , label : 'Export' , icon : 'export' , disabled : false ,  functionId : 'FLOORPLAN_EXPORT'}]
  }


  gridSettings = { //consider to move them into a json file
    building : {
      functionId:"BUILDING",
      apiUrl:"api/building/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Building Code", id: "buildingCode", width: 50 },
        { title: "Building Name", id: "name", width: 200 },
        { title: "Default", id: "defaultPerSite", width: 50 , dropdownOptions:[{text : "Yes" , value : true},{text : "No" , value : false}]},
      ],
    },
    pointType: {
      functionId:"GUI_POINT_TYPE",
      apiUrl:"api/customization/pointType/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Point Type Code", id: "code", width: 50 },
        { title: "Point Type Name", id: "name", width: 200 },
      ],
    },
    robot: {
      functionId:"ROBOT",
      apiUrl:"api/robot/page/v1",
      columns: [
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "robotCode", width: 50 },
        { title: "Robot Base", id: "robotBase", width: 50 },
        { title: "Robot Name", id: "name", width: 150 },
        { title: "Type", id: "robotType", width: 80 },
        { title: "Sub Type", id: "robotSubType", width: 80 },
      ],
    },
    site: {
      functionId:"SITE",
      apiUrl:"api/site/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "siteCode", width: 50 },
        { title: "Site Name", id: "name", width: 200 }
      ]
    },
    floorplan: {
      functionId:"FLOORPLAN",
      apiUrl:"api/map/plan/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "floorPlanCode", width: 50 },
        { title: "Floor Plan Name", id: "floorPlanName", width: 200 },       
      ].concat(this.mapSrv.defaultBuilding ? [{ title: "Building", id: "buildingName", width: 200 }] : []).concat(
        <any>[{ title: "Default", id: "defaultPerBuilding", width: 50 , dropdownOptions:[{text : "Yes" , value : true},{text : "No" , value : false}] }]
      ).concat(<any>[
        { title: "", type: "button", id: "floorplan3d", width: 80, icon: 'mdi mdi-video-3d', fixed: true , matTooltip : 'Edit 3D Model' },
        { title: "", type: "button", id: "alert", width: 80, icon: 'mdi mdi-exclamation-thick', fixed: true , ngIf: true , matTooltip : 'alertMsg' }
      ])
    },
    map: {
      functionId:"MAP",
      apiUrl:"api/map/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 50, fixed: true },
        { title: "#", type: "button", id: "edit", width: 50, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "mapCode", width: 50 },
        { title: "Robot Base", id: "robotBase", width: 50 },
        { title: "Map Name", id: "mapName", width: 200 },
        { title: "Floor Plan", id: "floorPlanName", width: 150 },
      ]
    },
    // synclog:{
    //   functionId:"SYNC_LOG",
    //   apiUrl:"api/sync/log/page/v1",
    //   defaultState: {skip: 0 , take: 15 , sort:[{dir: 'desc' , field: 'startDateTime'}]},
    //   columns: [
    //     { title: "Operation", id: "dataSyncType", width: 100 , type:'pipe' , pipe :'enum' },
    //     { title: "Record Type", id: "objectType", width: 100 , dropdownOptions:this.dataSrv.objectTypeDropDownOptions},
    //     { title: "Robot Code", id: "robotCode", width: 150 },
    //     { title: "Record Code", id: "objectCode", width: 200 },        
    //     { title: "Start Time", id: "startDateTime", type: "date" , width: 200 },
    //     { title: "End Time", id: "endDateTime", type: "date" , width: 200 },
    //     { title: "Status", id: "dataSyncStatus", width: 150 , type:'pipe' , pipe :'enum' }
    //   ]
    // },
    robotCoop: {
      functionId:"ROBOT",
      apiUrl: null,
      columns: [
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Event Trigger", id: "eventName", width: 50 },
        { title: "Robot Type", id: "robotType", width: 50 ,  dropdownOptions:[{text : "Patrol" , value : 'PATROL'}] },
        { title: "Operation Name", id: "name", width: 200 }
      ],
    },
  }

  data = []
  tableDisabledButtons = { new: false, action: true }
  isTableLoading = false
  dropdownData = {types:[] , subTypes : []}
  dropdownOptions = {
    types:[],
    years:[], 
    locations:[],
    subTypes : []
  }

  selectedMapId = null
  initialDataset = null
  $onDestroy = new Subject()
  get initialShapes() {
    return this.initialDataset?.shapes
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }
  
  async ngOnInit() {
      this.selectedTab = this.routeSrv.queryParams.value && this.tabs.map(t=>t.id).includes(this.routeSrv.queryParams.value?.selectedTab) ? 
                            this.routeSrv.queryParams.value?.selectedTab : 
                            this.tabs[0]?.id
      this.tableElRef?.retrieveData()
    
    // if(this.routeSrv.queryParams.value?.selectedTab && this.tabs.map(t=>t.id).includes(this.routeSrv.queryParams.value?.selectedTab)){
    //   if(['floorplan'].includes(this.routeSrv.queryParams.value.selectedTab)){
    //     t
    //     this.onTabChange(this.routeSrv.queryParams.value?.selectedTab)
    //     this.tableElRef?.retrieveData()
    //   }
    // }
    // this.route.queryParams.pipe(takeUntil(this.$onDestroy)).subscribe((params)=>{
    //   if(this.routeSrv.queryParams.value?.selectedTab && this.tabs.map(t=>t.id).includes(this.routeSrv.queryParams.value?.selectedTab)){
    //     if(['floorplan'].includes(params.selectedTab)){
    //       this.onTabChange(params?.selectedTab)
    //       this.tableElRef?.retrieveData()
    //     }
    //   }
    // })
    let ddl = await this.dataSrv.getDropLists(['types' , 'subTypes'])
    this.dropdownData.types = ddl.data['types'];
    this.dropdownData.subTypes = ddl.data['subTypes'];
    let newGridSettings = JSON.parse(JSON.stringify(this.gridSettings))
    newGridSettings.robot.columns.filter(c=>c.id == 'robotType')[0]['dropdownOptions'] = ddl.option['types']
    newGridSettings.robot.columns.filter(c=>c.id == 'robotSubType')[0]['dropdownOptions'] = ddl.option['subTypes']
    this.gridSettings = newGridSettings
  }


  async ngAfterViewInit() {
    // this.onTabChange(this.selectedTab)
  }

  // onTabChange(id) {
  //   this.selectedTab = id
  //   // this.columnDef = this.gridSettings[id].columns`
  //   this.data = []
  //   this.changeDectector.detectChanges()
  //   // this.router.navigate([this.router.url.split(";")[0]])
  //   // if(id == 'robotCoop'){
  //   //   this.TEST_RobotCollaboration()
  //   // }
  //   // window.location.href = this.router.url.split(";")[0]
  //   // this.loadData()
  // }

  async loadData(evt = null) {
    await this.tableElRef?.retrieveData()
  }

  showDetail(evt = null , id = null) {
    const idCompMap = {
      robotCoop : ArcsSetupRobotCoopComponent ,
      importFloorplan : ArcsSetupImportFloorplanComponent,
      exportFloorplan : ArcsSetupExportFloorplanComponent,
      importMap : ArcsSetupImportMapComponent,
      exportMap : ArcsSetupExportMapComponent,      
      robot:ArcsSetupRobotComponent,
      type:ArcsSetupTypeComponent,
      site: ArcsSetupSiteComponent,
      building: ArcsSetupBuildingComponent,
      map:CmMapDetailComponent,
      floorplan:CmMapFloorplanComponent,
      action : CmActionComponent,
      pointType : ArcsSetupPointTypeComponent,
      floorplan3d : ArcsSetupFloorplan3dComponent
    }
    const dialog: DialogRef = this.uiSrv.openKendoDialog({
      content: idCompMap[id ? id : this.selectedTab],
      preventAction: () => true
    });
    const content = dialog.content.instance;
    content.parent = this
    content.windowRef = dialog
    content.dialogRef = dialog
    content.parentRow = evt ? evt.row : null
    dialog.result.subscribe(() => this.loadData())
  }

  async delete() {
    if (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))) {
      return
    }
    let urlMapping = {
      robot : 'api/robot/v1' ,
      action: 'api/robot/action/v1' ,
      type:'api/robot/type/v1' , 
      site: 'api/site/v1' , 
      building: 'api/building/v1' , 
      floorplan: 'api/map/plan/v1' , 
      map:'api/map/v1' , 
      pointType : 'api/customization/pointType/v1',
    }

   
    let resp = await this.dataSrv.deleteRecords(urlMapping[this.selectedTab] ,   this.tableElRef.selectedData)
    if (resp == true) {
      this.loadData()
    }
  }

  async onGridDataChanged(){ //get alert by sql seems like a more elegant way but may lead to performance issue? rather have delay for showing alert? 
    if(this.tableElRef && this.selectedTab == 'floorplan'){
      await this.mapSrv.updateOutSyncFloorPlanList() // after updating floor plan this will be triggered so that header notification can be updated
      this.tableElRef.myData =  JSON.parse(JSON.stringify(this.tableElRef.myData.map(d=> {
        let alertFloorPlan = this.mqSrv.outSyncFloorPlans.filter(a=>a.floorPlanCode == d.floorPlanCode)[0]
        if (alertFloorPlan) {
          d['alert'] = true
          d['alertMsg'] = this.uiSrv.translate(`Please update the floor plan for map [$mapCode] of robot bases [$robotBases]`).
            replace('$mapCode', alertFloorPlan.mapCode).
            replace('$robotBases', alertFloorPlan.robotBases.join(' , '))
        }
         return d
      })))
    }
  }


  // testRobotCoopLocalStorageKey = 'robotCoop'
  // TEST_RobotCollaboration() {
  //   if(!localStorage.getItem(this.testRobotCoopLocalStorageKey)){
  //     localStorage.setItem(this.testRobotCoopLocalStorageKey , `[{"eventCode":"peopleCount","eventName":"People Count","robotType":"PATROL","name":"Dispatch concierge robot when guest arrive","rules":[{"name":"1","filters":[{"field":"peopleCount","title":"People Count","editor":"number","operators":["lt","gt","eq"]}],"filterValues":{"logic":"and","filters":[{"operator":"eq","value":1,"field":"peopleCount"}]},"missionId":"C-01"},{"name":"3+","filters":[{"field":"peopleCount","title":"People Count","editor":"number","operators":["lt","gt","eq"]}],"filterValues":{"logic":"and","filters":[{"operator":"gt","value":3,"field":"peopleCount"}]},"missionId":"C-02"}]},{"eventCode":"ieq","eventName":"Air Quality","robotType":"PATROL","name":"Dispatch disinfection robot when IEQ is low","rules":[{"name":"particle pollution","filters":[{"field":"pm10","title":"PM 10","editor":"number","operators":["lt","gt","eq"]},{"field":"pm25","title":"PM 2.5","editor":"number","operators":["lt","gt","eq"]},{"field":"tvoc","title":"TVOC","editor":"number","operators":["lt","gt","eq"]},{"field":"co2","title":"Carbon Dioxide","editor":"number","operators":["lt","gt","eq"]},{"field":"co","title":"Carbon Monoxide","editor":"number","operators":["lt","gt","eq"]},{"field":"o3","title":"Ozone","editor":"number","operators":["lt","gt","eq"]},{"field":"no","title":"Nitrogen Dioxide","editor":"number","operators":["lt","gt","eq"]}],"filterValues":{"logic":"and","filters":[{"operator":"gt","value":300,"field":"pm10"},{"operator":"gt","value":400,"field":"pm25"}]},"missionId":"D-01"},{"name":"tvoc pollution","filters":[{"field":"pm10","title":"PM 10","editor":"number","operators":["lt","gt","eq"]},{"field":"pm25","title":"PM 2.5","editor":"number","operators":["lt","gt","eq"]},{"field":"tvoc","title":"TVOC","editor":"number","operators":["lt","gt","eq"]},{"field":"co2","title":"Carbon Dioxide","editor":"number","operators":["lt","gt","eq"]},{"field":"co","title":"Carbon Monoxide","editor":"number","operators":["lt","gt","eq"]},{"field":"o3","title":"Ozone","editor":"number","operators":["lt","gt","eq"]},{"field":"no","title":"Nitrogen Dioxide","editor":"number","operators":["lt","gt","eq"]}],"filterValues":{"logic":"and","filters":[{"operator":"gt","value":1000,"field":"tvoc"}]},"missionId":"D-02"}]}]`)
  //   }
  //   let tableData  = [
  //     { eventCode: "ieq", eventName: "Air Quality", robotType : 'PATROL'},
  //     { eventCode: "peopleCount", eventName: "People Count", robotType : 'PATROL'}
  //   ]
  //   let data = JSON.parse(localStorage.getItem(this.testRobotCoopLocalStorageKey))
  //   data.forEach(d=>tableData.filter(d2=>d2.eventCode == d.eventCode)[0]['name'] = d.name)
  //   this.tableElRef.data = tableData
  // }
  
}
