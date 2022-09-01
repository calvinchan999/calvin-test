import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { filter, take } from 'rxjs/operators';
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
  constructor(public windowSrv: DialogService, public dataSrv : DataService, public uiSrv: UiService, public http: RvHttpService, private changeDectector: ChangeDetectorRef,
    private util: GeneralUtil, private ngZone: NgZone , private authSrv : AuthService) { 
      this.tabs = this.tabs.filter(t=> t.authorized === false || this.authSrv.userAccessList.includes(this.gridSettings[t.id].functionId?.toUpperCase()))
      this.selectedTab = this.tabs[0].id
  }
  tabs = [
    { id: 'robot', label: 'Robot' },
    { id: 'building', label: 'Building'},
    { id: 'floorplan', label: 'Floor Plan' },
    { id: 'map', label: 'Map' },
    { id: 'pointType', label: 'Waypoint Type' , authorized : true},
  ]
  selectedTab = 'floorplan' 

  gridSettings = { //consider to move them into a json file
    building : {
      functionId:"BUILDING",
      apiUrl:"api/location/building/page/v1",
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

    type: {
      apiUrl:"api/robot/type/v1/page",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "typeCode", width: 50 },
        { title: "Type", id: "typeName", width: 80 },
        { title: "Sub Type", id: "subTypeName", width: 80 },
        { title: "Actions Count", id: "typeActionsCount", width: 50 },
      ]
    },
    site: {
      apiUrl:"api/locations/site/v1/page",
      columns: [
        { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
        { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "locationCode", width: 50 },
        { title: "Site Name", id: "locationName", width: 200 },
        { title: "Site File Name", id: "imgDisplayName", width: 200 },
        { title: "Effective", id: "default", width: 50 }
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
    action: {
      apiUrl:"api/robot/action/v1/page",
      columns: [
        { title: "", type: "checkbox", id: "select", fixed: true },
        { title: "#", type: "button", id: "edit", width: 20, icon: 'k-icon k-i-edit iconButton', fixed: true },
        { title: "Code", id: "actionCode", width: 50 },
        { title: "Action Description", id: "actionName", width: 150 },
        { title: "Type", id: "typeNames", width: 50 },
        { title: "Alias", id: "actionAlias", width: 150 },
        { title: "Clazz", id: "actionClass", width: 150 },
      ]
    }
  }

  // columnDef = this.gridSettings.building.columns
  data = []
  tableDisabledButtons = { new: false, action: true }
  isTableLoading = false
  dropdownData = {types:[]}
  dropdownOptions = {
    types:[],
    years:[], 
    locations:[]
  }

  selectedMapId = null
  initialDataset = null
  get initialShapes() {
    return this.initialDataset?.shapes
  }
  
  async ngOnInit() {
    let ddl = await this.dataSrv.getDropList('types')
    this.dropdownData.types = ddl.data;
    let newGridSettings = JSON.parse(JSON.stringify(this.gridSettings))
    newGridSettings.robot.columns.filter(c=>c.id == 'robotType')[0]['dropdownOptions'] = ddl.options
    this.gridSettings = newGridSettings
  }


  async ngAfterViewInit() {
    this.onTabChange(this.selectedTab)
  }

  onTabChange(id) {
    this.selectedTab = id
    // this.columnDef = this.gridSettings[id].columns
    this.data = []
    this.changeDectector.detectChanges()
    // this.loadData()
  }

  async loadData(evt = null) {
    this.tableElRef?.retrieveData()
    // this.uiSrv.loadAsyncDone(ticket)
  }

  showDetail(evt = null) {
    const idCompMap = {
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
      content: idCompMap[this.selectedTab],
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
      site: 'api/locations/site/v1' , 
      building: 'api/location/building/v1' , 
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
