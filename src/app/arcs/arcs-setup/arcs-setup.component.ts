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
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { ArcsSetupBuildingComponent } from './arcs-setup-building/arcs-setup-building.component';
import { ArcsSetupExportMapComponent } from './arcs-setup-export/arcs-setup-export-map/arcs-setup-export-map.component';
import { ArcsSetupImportMapComponent } from './arcs-setup-import/arcs-setup-import-map/arcs-setup-import-map.component';
import { ArcsSetupPointTypeComponent } from './arcs-setup-point-type/arcs-setup-point-type.component';
import { ArcsSetupRobotComponent } from './arcs-setup-robot/arcs-setup-robot.component';
import { ArcsSetupSiteComponent } from './arcs-setup-site/arcs-setup-site.component';
import { ArcsSetupTypeComponent } from './arcs-setup-type/arcs-setup-type.component';

@Component({
  selector: 'app-arcs-setup',
  templateUrl: './arcs-setup.component.html',
  styleUrls: ['./arcs-setup.component.scss']
})
export class ArcsSetupComponent implements OnInit {
  @ViewChild('table') tableElRef: TableComponent
  @ViewChild('pixi') pixiElRef: DrawingBoardComponent
  constructor(public windowSrv: DialogService, public dataSrv : DataService, public uiSrv: UiService, public http: RvHttpService, private location : Location, private router : Router,
              private changeDectector: ChangeDetectorRef, private route : ActivatedRoute, private util: GeneralUtil, private ngZone: NgZone , private authSrv : AuthService) { 
      this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(this.gridSettings[t.id].functionId?.toUpperCase()))
      this.selectedTab = this.route.snapshot.paramMap.get('selectedTab') ? this.route.snapshot.paramMap.get('selectedTab') : this.tabs[0].id
      Object.keys(this.tableCustomButtons).forEach(k=> {
        this.tableCustomButtons[k].forEach(btn=>{
          if(!this.authSrv.hasRight(btn?.functionId)){
            delete this.tableCustomButtons[k]
          }
        })
      })
  }
  
  tabs = [
    { id: 'robot', label: 'Robot' },
    { id: 'site', label: 'Site'},
    { id: 'building', label: 'Building'},
    { id: 'floorplan', label: 'Floor Plan' },
    { id: 'map', label: 'Map' },
    { id: 'pointType', label: 'Waypoint Type'},
    { id: 'log', label: 'Event Log' , authorized : false},
  ]
  selectedTab = 'floorplan' 
  tableCustomButtons = {
    map:[{id : 'importMap' , label : 'Import' , icon : 'import' , disabled : false  ,  functionId : 'MAP_IMPORT' }]
  }
  // ,{id : 'exportMap' , label : 'Export' , icon : 'export' , disabled : false  }

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
      ].concat(this.dataSrv.arcsDefaultBuilding ? [{ title: "Building", id: "buildingName", width: 200 }] : []).concat(
        <any>[{ title: "Default", id: "defaultPerBuilding", width: 50 , dropdownOptions:[{text : "Yes" , value : true},{text : "No" , value : false}] }]
      )
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
    this.route.params.pipe(takeUntil(this.$onDestroy)).subscribe((params)=>{
      if(params?.selectedTab){
        this.onTabChange(params?.selectedTab)
      }
    })
    let ddl = await this.dataSrv.getDropLists(['types' , 'subTypes'])
    this.dropdownData.types = ddl.data['types'];
    this.dropdownData.subTypes = ddl.data['subTypes'];
    let newGridSettings = JSON.parse(JSON.stringify(this.gridSettings))
    newGridSettings.robot.columns.filter(c=>c.id == 'robotType')[0]['dropdownOptions'] = ddl.option['types']
    newGridSettings.robot.columns.filter(c=>c.id == 'robotSubType')[0]['dropdownOptions'] = ddl.option['subTypes']
    this.gridSettings = newGridSettings
  }


  async ngAfterViewInit() {
    this.onTabChange(this.selectedTab)
  }

  onTabChange(id) {
    this.selectedTab = id
    // this.columnDef = this.gridSettings[id].columns`
    this.data = []
    this.changeDectector.detectChanges()
    this.router.navigate([this.router.url.split(";")[0]])
    // window.location.href = this.router.url.split(";")[0]
    // this.loadData()
  }

  async loadData(evt = null) {
    await this.tableElRef?.retrieveData()

    //PENDING : filter tableCustomButtons by user acess


    // if(this.selectedTab == 'site' && this.tableElRef?.data.length > 0){
    //   let original = JSON.parse(JSON.stringify(this.tableDisabledButtons))
    //   let tmp = JSON.parse(original)
    //   tmp['new'] = true
    //   this.tableDisabledButtons = tmp
    // }
    // this.uiSrv.loadAsyncDone(ticket)
  }

  showDetail(evt = null , id = null) {
    const idCompMap = {
      importMap : ArcsSetupImportMapComponent,
      exportMap : ArcsSetupExportMapComponent,      
      robot:ArcsSetupRobotComponent,
      type:ArcsSetupTypeComponent,
      site: ArcsSetupSiteComponent,
      building: ArcsSetupBuildingComponent,
      map:CmMapDetailComponent,
      floorplan:CmMapFloorplanComponent,
      action : CmActionComponent,
      pointType : ArcsSetupPointTypeComponent
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
      pointType : 'api/customization/pointType/v1'
    }
   
    let resp = await this.dataSrv.deleteRecordsV2(urlMapping[this.selectedTab] ,   this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
  }
}
