import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { toODataString } from '@progress/kendo-data-query';
import { filter, take } from 'rxjs/operators';
import { CmMapDetailComponent } from 'src/app/common-components/cm-map/cm-map-detail/cm-map-detail.component';
import { CmMapFloorplanComponent } from 'src/app/common-components/cm-map/cm-map-floorplan/cm-map-floorplan.component';
import { DataService, MapJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { CmUserGroupComponent } from './cm-user-group/cm-user-group.component';
import { CmUserDetailComponent } from './cm-user-detail/cm-user-detail.component';
import { AuthService } from 'src/app/services/auth.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';


@Component({
  selector: 'app-cm-user',
  templateUrl: './cm-user.component.html',
  styleUrls: ['./cm-user.component.scss']
})
export class CmUserComponent implements OnInit {
@ViewChild('table') ucTableRef : TableComponent
@ViewChild('pixi') pixiElRef: Map2DViewportComponent
  constructor(public windowSrv: DialogService, public uiSrv : UiService , public http: RvHttpService , private changeDectector : ChangeDetectorRef,
              private dataSrv : DataService , private ngZone : NgZone, public authSrv : AuthService , public util : GeneralUtil) { 
              this.tabs = this.tabs.filter(t=>this.authSrv.hasRight(t.functionId.toUpperCase()) && (t.id!='passwordPolicy' || this.util.arcsApp))
              this.selectedTab = this.tabs[0].id
  }
  selectedTab = 'user'
  gridSettings = { //consider to move them into a json file
    user : {
      functionId:"USER",
      apiUrl:"api/user/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", fixed : true },
        { title: "#", type: "button", id: "edit", icon : 'k-icon k-i-edit iconButton' , fixed : true},
        { title: "User Alias", id: "userCode", width: 50 },
        { title: "User Name", id: "name", width: 150 },
        { title: "User Group", id: "userGroupName", width: 150 },
      ],
    },
    usergroup:{
      functionId:"USERGROUP",
      apiUrl:"api/user/usergroup/page/v1",
      columns: [
        { title: "", type: "checkbox", id: "select", fixed : true },
        { title: "#", type: "button", id: "edit", icon : 'k-icon k-i-edit iconButton' , fixed : true},
        { title: "User Group Code", id: "userGroupCode", width: 50 },
        { title: "User Group Name", id: "name", width: 150 }
      ],
    }
  }
                
  tabs = [
    // {id: 'site' , label : 'Site'}, //testing ARCS
    // {id: 'building' , label : 'Building'}, //testing ARCS
    {id: 'user' , label : 'User' , functionId : this.gridSettings.user.functionId},
    {id: 'usergroup' , label : 'User Group' , functionId : this.gridSettings.usergroup.functionId},
    {id: 'passwordPolicy' , label : 'Password Policy' , functionId : 'PASSWORD_POLICY'}
  ]

  columnDef = this.gridSettings.user.columns
  data = [ ]
  tableDisabledButtons = {new : false , action : true}
  isTableLoading = false
  tabletObjs = {
    maps:[],
    floorplans:[],
    shapes:[],
  }
  
  selectedMapId = null
  selectedFloorplanId = null
  initialDataset = null
  get initialShapes() {
    return this.initialDataset?.shapes
  }
  get primaryKey(){
    return this.selectedTab == 'user' ? 'userCode' : (this.selectedTab == 'usergroup' ? 'userGroupCode' : null)
  }

  ngOnInit(){

  }

  async ngAfterViewInit() {
      this.onTabChange(this.selectedTab)
      // this.selectedTab = 'user'
      //this.columnDef = this.columnsDefsMap[this.selectedTab]
      // this.loadData()
  }

  onTabChange(id) {
    //PENDING : bug fix - shapes missing when change from floorplan view to map view and back to floorplan view again 
        this.selectedTab = id
        this.data = []
        if(this.selectedTab != 'passwordPolicy'){
          this.columnDef = this.gridSettings[id]['columns']
        }
        this.changeDectector.detectChanges()
      // this.loadData()
  }

  
  async loadData(criteria = undefined){
    if(this.ucTableRef){
      this.ucTableRef.retrieveData()
    }
  }

  showDetail(evt = null){
    const idCompMap = {
      user : CmUserDetailComponent,
      usergroup : CmUserGroupComponent
    }
    const window : DialogRef = this.uiSrv.openKendoDialog({
      content: idCompMap[this.selectedTab] ,   
      preventAction: () => true
    });
    const content = window.content.instance;
    content.parent = this
    content.parentRow = evt?.row
    content.windowRef = window
    // content.id = evt ? evt.row[this.primaryKey] : null
    window.result.subscribe(()=> this.loadData())
  }

  async delete(){
    if (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))) {
      return
    }
    let urlMapping = {
      user : 'api/user/v1' ,
      usergroup: 'api/user/userGroup/v1' ,
    }
   
    let resp = await this.dataSrv.deleteRecordsV2(urlMapping[this.selectedTab] ,   this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
  }

}
