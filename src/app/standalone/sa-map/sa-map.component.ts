import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { ButtonGroup } from '@progress/kendo-angular-buttons';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { toODataString } from '@progress/kendo-data-query';
import { filter, take } from 'rxjs/operators';
import { CmMapDetailComponent } from 'src/app/common-components/cm-map/cm-map-detail/cm-map-detail.component';
import { CmMapFloorplanComponent } from 'src/app/common-components/cm-map/cm-map-floorplan/cm-map-floorplan.component';
import { AuthService } from 'src/app/services/auth.service';
import { DataService, JMap, MapJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';


@Component({
  selector: 'app-sa-map',
  templateUrl: './sa-map.component.html',
  styleUrls: ['./sa-map.component.scss']
})
export class SaMapComponent implements OnInit {
@ViewChild('table') ucTableRef : TableComponent
@ViewChild('pixi') pixiElRef: DrawingBoardComponent
@ViewChild('mapDetailComp') mapDetailComp : CmMapDetailComponent
@ViewChild('floorplanComp') floorplanComp : CmMapFloorplanComponent
@ViewChild('buttonGroup') buttonGroupRef : ButtonGroup
  constructor(public windowSrv: DialogService, public uiSrv : UiService , public http: RvHttpService , public changeDectector : ChangeDetectorRef,
              private dataSrv : DataService , private ngZone : NgZone ,private authSrv : AuthService , public util : GeneralUtil) { 

                this.tabs = this.tabs.filter(t=>this.authSrv.userAccessList.includes(t.id.toUpperCase()))
                this.selectedTab = this.tabs[0].id
 }
  tabs = [
    // {id: 'site' , label : 'Site'}, //testing ARCS
    // {id: 'building' , label : 'Building'}, //testing ARCS
    {id: 'floorplan' , label : 'Floor Plan'},
    {id: 'map' , label : 'Map'},
  ]
  selectedTab = 'floorplan'
  columnsDefsMap = {
    site: [],
    building: [],
    floorplan: [
      { title: "", type: "checkbox", id: "select", width: 15, fixed: true },
      { title: "#", type: "button", id: "edit", width: 15, icon: 'k-icon k-i-edit iconButton', fixed: true },
      { title: "Code", id: "floorPlanCode", width: 50 },
      { title: "Floor Plan Name", id: "name", width: 200 },
      // { title: "Floor Plan File Name", id: "planFileName", width: 200 },
    ],
    map: [
      { title: "", type: "checkbox", id: "select", width: 50, fixed: true },
      { title: "#", type: "button", id: "edit", width: 50, icon: 'k-icon k-i-edit iconButton', fixed: true },
      { title: "Code", id: "mapCode", width: 50 },
      { title: "Map Name", id: "mapName", width: 200 },
      // { title: "Site", id: "siteName", width: 200 },
      // { title: "Building", id: "buildingName", width: 150 },
      { title: "Floor Plan", id: "floorPlanName", width: 150 },
    ],
  }
  columnDef = this.columnsDefsMap.floorplan
  data = [ ]
  tableDisabledButtons = {new : false , action : true}
  isTableLoading = false
  tabletObjs = {
    maps:[],
    floorplans:[],
    shapes:[]
  }
  addingMap = false
  editingFpKeySet = null
  selectedMapKeySet = null
  selectedFloorplanCode = null
  initialDataset = null
  me = this
  canAddFloorplan = false
  editingMapKeySet = null
  noMap = false
  noFloorplan = false

  get initialShapes() {
    return this.initialDataset?.shapes
  }

  ngOnInit(){
    this.canAddFloorplan = this.authSrv.hasRight("FLOORPLAN_ADD")
    if(this.uiSrv.isTablet && this.authSrv.hasRight('MAP_ADD')){
      this.tabs = this.tabs.concat({ id: 'scan', label: 'Scan' })
    }
  }

  async ngAfterViewInit() {
    if(!this.uiSrv.isTablet){
      this.onTabChange(this.selectedTab)
      // this.selectedTab = 'floorplan'
      // this.columnDef = this.columnsDefsMap[this.selectedTab]
      // this.loadData()
    } else {
      this.pixiElRef.initDone$.subscribe(async() => {
        await this.refreshTabletList();     
        this.onTabChange(this.selectedTab)
      })
      this.pixiElRef.init()
    }
  }

  async refreshTabletList(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let tmpDropList = await this.dataSrv.getDropLists(['maps','floorplans'])
    this.tabletObjs.maps = tmpDropList.data['maps']
    this.tabletObjs.floorplans = tmpDropList.data['floorplans']
    this.noMap = this.tabletObjs.maps.length == 0
    this.noFloorplan = this.tabletObjs.floorplans.length == 0
    this.uiSrv.loadAsyncDone(ticket)
  }

  async onTabChange(id, force = false , autoGetId = true) {
    if ((this.selectedTab == 'scan' || this.editingMapKeySet || this.editingFpKeySet ) && (!force && !await this.uiSrv.showConfirmDialog(this.uiSrv.translate("Do you want to quit without saving ?")))) {
      this.selectTabProgramatically(this.selectedTab)
      return
    }
    this.editingMapKeySet = null
    this.editingFpKeySet = null
    this.selectedTab = id
    setTimeout(()=> this.addingMap = this.selectedTab == 'scan')
    // if (id == 'scan' this.mapDetailComp) {   

    // }

    if(!this.uiSrv.isTablet){      
      this.data = []
      this.columnDef = this.columnsDefsMap[id]
      this.changeDectector.detectChanges()
      // this.loadData()
    }else{
      setTimeout(()=>{
        if (this.selectedTab == 'map') {
          this.selectedMapKeySet = autoGetId || ! this.selectedMapKeySet ? this.getActiveMapKeySet() : this.selectedMapKeySet
          this.showMap()
        } else if (this.selectedTab == 'floorplan') {
          this.selectedFloorplanCode = autoGetId || ! this.selectedFloorplanCode ? this.getActiveFloorplanCode() : this.selectedFloorplanCode
          this.showFloorplan()
        } else if (this.selectedTab == 'scan') {
          setTimeout(() => {
            this.mapDetailComp.parent = this
          })
        }
      })
    }
  }

  selectTabProgramatically(tabId){
    let idx = this.tabs.map(t=>t.id).indexOf(tabId)
    this.selectedTab = tabId
    for (let i = 0; i <= 2; i++) { //Any other better methods from kendo??
      Array.from(this.buttonGroupRef.buttons)[i].selected = i == idx
    }
  }

  getActiveMapKeySet(){
    //PENDING : get current mapId from API
    return {mapCode : this.tabletObjs.maps[0]['mapCode'] , robotBase : this.tabletObjs.maps[0]['robotBase']}
  }

  getActiveFloorplanCode(){
    //PENDING : get current planId from API
    return this.tabletObjs.floorplans[0]['floorPlanCode']
  }
  
  async loadData(criteria = undefined){
    if(this.ucTableRef){
      this.ucTableRef.retrieveData()
    }
  }

  showDetail(evt = null){
    const idCompMap = {
      map : CmMapDetailComponent,
      floorplan : CmMapFloorplanComponent
    }
    const window : DialogRef = this.uiSrv.openKendoDialog({
      content: idCompMap[this.selectedTab] ,   
      preventAction: () => true
    });
    const content = window.content.instance;
    content.parent = this
    content.windowRef = window
    content.parentRow =  evt?.row
    window.result.subscribe(()=> this.loadData())
  }

  async delete(){
    if(!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))){
      return
    }
    let resp = await this.dataSrv.deleteRecordsV2( this.selectedTab == 'map' ? 'api/map/v1' : 'api/map/plan/v1',   this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
  }

  // v *** for tablet mode *** v

  async showMap(){
    await this.pixiElRef.reset()
    let ticket = this.uiSrv.loadAsyncBegin()
    let data : JMap = await this.dataSrv.httpSrv.get('api/map/v1/' + this.selectedMapKeySet['mapCode'] + '/' +this.selectedMapKeySet['robotBase'])
    await this.pixiElRef.loadToMainContainer(data.base64Image , undefined , undefined , undefined, undefined, true)
    let origin = this.pixiElRef.calculateMapOrigin(data.originX , data.originY , data.imageHeight / this.util.config.METER_TO_PIXEL_RATIO, this.util.config.METER_TO_PIXEL_RATIO)
    this.pixiElRef.setMapOrigin(origin[0] , origin[1])
    this.uiSrv.loadAsyncDone(ticket)
    // this.pixiElRef.loadMapObject((await this.dataSrv.getMapDs([this.selectedMapId])).maps[0] , false)
  }


  async showFloorplan(){
    if (!this.pixiElRef || this.pixiElRef.mainContainerId == this.selectedFloorplanCode) {
      return
    }
    this.pixiElRef.loadFloorPlanDatasetV2(await this.dataSrv.getFloorPlanV2(this.selectedFloorplanCode),true , true)
  }
  // ^ *** for tablet mode *** ^
}
