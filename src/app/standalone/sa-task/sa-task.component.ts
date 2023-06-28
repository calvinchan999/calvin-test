import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ChangeDetectorRef, Component, ComponentFactoryResolver, ComponentRef, OnInit, TemplateRef, ViewChild, ViewContainerRef, ViewRef } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ButtonGroup } from '@progress/kendo-angular-buttons';
import { DialogRef, DialogService} from '@progress/kendo-angular-dialog';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import { filter, skip, take } from 'rxjs/operators';
import { CmTaskJobComponent } from 'src/app/common-components/cm-task/cm-task-job/cm-task-job.component';
import { AuthService } from 'src/app/services/auth.service';
import { DropListFloorplan, DropListMap } from 'src/app/services/data.models';
import { DataService } from 'src/app/services/data.service';
import { MapService } from 'src/app/services/map.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';

@Component({
  selector: 'app-sa-task',
  templateUrl: './sa-task.component.html',
  styleUrls: ['./sa-task.component.scss']
})
export class SaTaskComponent implements OnInit {
  @ViewChild('viewContainer', {read: ViewContainerRef}) vcRef : ViewContainerRef
  @ViewChild('tabletListTemplate') listTplRef : TemplateRef<any>
  @ViewChild('table') tableRef: TableComponent
  @ViewChild('buttonGroup') buttonGroupRef : ButtonGroup
  @ViewChild('virtualScrollViewport') virtualScrollViewport : CdkVirtualScrollViewport
  listViewRef : ViewRef
  tabletTaskDetailCompRef : ComponentRef<CmTaskJobComponent>
  tabletRowHeight = 122
  constructor(public windowSrv: DialogService, public uiSrv: UiService, public httpSrv: RvHttpService, private changeDectector: ChangeDetectorRef, public mapSrv : MapService,
              private resolver : ComponentFactoryResolver, private dataSrv: DataService, public dialogSrv: DialogService, public authSrv : AuthService) { 
                let tmpMap = {
                  jobs : 'TASK',
                  template : 'TASK_TEMPLATE'
                }
                this.tabs = this.tabs.filter(t=>this.authSrv.userAccessList.includes(tmpMap[t.id].toUpperCase()))
                this.selectedTab = this.tabs[0].id
              }
  tabs = [
    { id: 'jobs', label: 'Task' },
    { id: 'template', label: 'Template' },
  ]
  selectedTab = 'jobs'
  tableButtons = { new: this.selectedTab != 'completed', action: this.selectedTab != 'completed' }
  columnsDefsMap = {
    jobs:[
      { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton' , fixed : true  },
      { title: "Order No.", id: "taskId", width: 50 },
      { title: "Description", id: "name", width: 100 },
      { title: "Status", id: "state", width: 20 , dropdownOptions:[{text : "Pending" , value : "WAITING"} , {text : "Executing" , value : "EXECUTING"},{text : "Completed" , value : "SUCCEEDED"} , {text : "Canceled" , value : "CANCELED"} , {text : "Failed" , value : "FAILED"},] },
      { title: "Completion Date", id: "endDateTime",  type: "date" , width: 50 },
      { title: "Created Date", id: "createdDateTime",  type: "date" , width: 50 },
      { title: "", type: "button", id: "cancel", width: 20, icon: 'cancel-butoon mdi mdi-close-thick iconButton' , fixed : true , ngIf: true },
    ],
    template: [
      { title: "", type: "checkbox", id: "select", width: 30 ,fixed : true },
      { title: "#", type: "button", id: "edit", width: 30, icon: 'k-icon k-i-edit iconButton' , fixed : true  },
      { title: "Template Code", id: "missionId", width: 50 },
      { title: "Floor Plan", id: "floorPlanCode", width: 50 , dropdownType : 'floorplans'},
      { title: "Description", id: "name", width: 100 },
      { title: "", type: "button", id: "execute", width: 80, icon: 'add-button k-icon k-i-play iconButton' , fixed : true  },
    ],
  }
  
  columnDef = this.columnsDefsMap.jobs
  data = []
  tableDisabledButtons = { new: false, action: true }
  isTableLoading = false
  tabletObjs = {
    tabs : [
      { id: 'jobs', label: 'Task' },
      { id: 'template', label: 'Template' },
      { id: 'add', label: 'Add' },
    ],
    maps: [],
    pageSize : 10,
    layout: {
      template: {
        buttons: [ { id: 'templateDetail', label: '', icon:'mdi mdi-chevron-right' , class : 'detail' } , { id: 'addTask', label: 'Add Task', icon: 'mdi mdi-clipboard-plus' }],
        headers: [{ id: 'name' }],
        details: [
          { label: 'Template Code', id: 'taskTemplateCode' }
        ]
      },
      jobs: {
        buttons: [ { id: 'taskDetail', label: '', icon:'mdi mdi-chevron-right' , class : 'detail' }],
        headers: [{ label: 'Order No.', id: 'taskId' } , { id: 'name' }],
        details: [
           { label: "Status", id: "state" }, { label: 'Completion Date', id: 'endDateTime' , type : 'date' } 
        ]
      },
    },
  }
  templateId
  taskId
  me = this
  get primaryKey(){
    return this.selectedTab == 'template' ? 'taskTemplateId' : (this.selectedTab == 'jobs' ? 'taskId' : null)
  }

  // completed: {
  //   headers: [{ id: 'name' }, { id: 'completeTime' }],
  //   details: [
  //     [{ label: 'Start Point', id: 'from' }, { label: 'End Point', id: 'to' }], [{ label: 'Action', id: 'type' }]
  //   ]
  // },

  ngOnInit() {
    // this.robotSrv.data.taskActive.pipe(skip(1)).subscribe(()=>{
    //   if(this.tableRef){
    //     this.tableRef.retrieveData()
    //   }
    // })
  }

  ngAfterViewInit(){
    this.listViewRef =  this.vcRef.createEmbeddedView(this.listTplRef)
    this.onTabChange(this.selectedTab)
    // if(this.uiSrv.isTablet){
    //   this.onTabChange(this.selectedTab)
    // }
  }

  
 
  async showDetail(evt = null){
    if( this.selectedTab == 'template'  && evt?.column == 'execute'){
      let activeFloorPlan = await this.mapSrv.getStandaloneActiveFloorPlan();
      if(activeFloorPlan.floorPlanCode != evt?.row.floorPlanCode){
        this.uiSrv.showNotificationBar(`Selected task template not match with current floor plan (${activeFloorPlan.name ? activeFloorPlan.name : activeFloorPlan.floorPlanCode}) `,'warning')
        return
      }
    }
    let dialog : DialogRef = this.uiSrv.openKendoDialog({content: CmTaskJobComponent , preventAction:()=>true});
    const content = dialog.content.instance;
    content.dialogRef = dialog
    content.isTemplate = this.selectedTab == 'template' 
    content.isExecuteTemplate = evt?.column == 'execute'
    content.parent = this
    content.parentRow = evt?.row
    content.id = evt ? (evt.row[this.primaryKey]) : null
    content.readonly = this.selectedTab == 'jobs' && content.id != null;
    dialog.result.subscribe(()=>{
      this.loadData()
    })
  }

  async delete(){
    if(!await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Are you sure to delete the selected items?'))){
      return
    }
    let resp = await this.dataSrv.deleteRecords('api/task/mission/v1',   this.data.filter(r => r['select'] == true))
    if (resp == true) {
      this.loadData()
    }
    // let ids = this.data.filter(r=>r['select'] == true).map(r=>r[this.primaryKey])
    // if( await this.dataSrv.deleteRecords(this.selectedTab == 'template' ? "api/task/mission/v1" : 'api/task/v1', ids)){
    //   this.loadData()
    // }    
  }

  async loadData() { //default page : refresh if have existing data , else retrieve 1st page
    if(this.selectedTab == 'add'){

    }else if(this.uiSrv.isTablet){
      let ticket = this.uiSrv.loadAsyncBegin()
      let tmpData = await this.httpSrv.get(this.getDataUrl() + `?page=1&pageSize=${ this.data?.length > 0 ?  this.data.length : this.tabletObjs.pageSize}`) 
      this.data =  JSON.parse(JSON.stringify(tmpData)).sort((a, b)=> (b['taskId'])?.toString() - (a['taskId'])?.toString())
      this.uiSrv.loadAsyncDone(ticket)
    }else{
      await this.tableRef?.retrieveData()
    }
    // let resp = await this.httpSrv.get(this.selectedTab == 'template'? "api/task/template/v1" :  "api/task/template/v1" , state)
    // if(this.selectedTab == 'template'){
    //   this.data = resp
    // }else{
    //   this.data = []
    // }
  }

  tabletListScrollTo(primaryKey){
    let idx = this.data.filter(r => r[this.primaryKey] == primaryKey).map(r => this.data.indexOf(r))[0]
    if(idx){
      this.virtualScrollViewport.scrollToOffset(idx * this.tabletRowHeight)
    }  
  }

  async loadMore(){
    let page = Math.floor(this.data.length/this.tabletObjs.pageSize) + 1
    this.data = this.data.concat( await this.httpSrv.get(this.getDataUrl() + `?page=${page}&pageSize=${this.tabletObjs.pageSize}`))
  }

  getDataUrl(){
    return (this.selectedTab == 'template'? "api/task/mission/page/v1" :  "api/task/page/v1" )
  }


  async onTabChange(id) {
    // let orgSelectedIdx =this.tabletObjs.tabs.map(t=>t['id']).indexOf(this.selectedTab)
    if((this.selectedTab == 'add' || (this.selectedTab == 'template'  && this.tabletTaskDetailCompRef)) && 
       (!await this.uiSrv.showConfirmDialog(this.uiSrv.translate("Do you want to quit without saving ?")))){
        this.selectTabProgramatically(this.selectedTab)
      // for (let i = 0; i <= 2; i++) { //Any other better methods from kendo??
      //   Array.from(this.buttonGroupRef.buttons)[i].selected = i == orgSelectedIdx
      // }
      return 
    }
    this.destroyTabletTaskJobComp()
    this.selectedTab = id
    this.tableButtons = { new: id != 'completed', action: id == 'template' }
    this.columnDef = this.columnsDefsMap[id]
    // this.data = []
    this.changeDectector.detectChanges()
    if(this.uiSrv.isTablet){
      if(['jobs','template'].includes(this.selectedTab)){
        this.vcRef.insert(this.listViewRef)
      }else{
        this.initTabletSaTaskJobComp(null)
      }
      this.data = null
      this.loadData()
    }
    // this.loadData()
  }

  // *** v For Tablet *** v

  buttonClick(row, evtId) {
    this.taskId = null
    this.templateId = null
    let evtIdPkMap = {
      templateDetail : 'taskTemplateId',
      taskDetail : 'taskId',
      addTask: 'taskTemplateId',
    }
    if(evtId == 'templateDetail' || evtId == 'taskDetail' || evtId == 'addTask'){
      this.initTabletSaTaskJobComp(row , evtId == 'addTask' )
    }
  }

  initTabletSaTaskJobComp(row , isExecuteTpl = false){
    this.vcRef.detach()
    const factory = this.resolver.resolveComponentFactory(CmTaskJobComponent)
    const compRef = this.vcRef.createComponent(factory)
    this.tabletTaskDetailCompRef = compRef;
    this.tabletTaskDetailCompRef.instance.isTemplate = this.selectedTab == 'template'
    this.tabletTaskDetailCompRef.instance.readonly =  this.selectedTab == 'jobs'
    this.tabletTaskDetailCompRef.instance.isExecuteTemplate = isExecuteTpl
    this.tabletTaskDetailCompRef.instance.parent = this
    this.tabletTaskDetailCompRef.instance.parentRow = row
    if(isExecuteTpl){
      this.selectTabProgramatically('add')
    }
  }

  selectTabProgramatically(tabId){
    let idx = ['jobs' , 'template' , 'add'].indexOf(tabId)
    this.selectedTab = tabId
    for (let i = 0; i <= 2; i++) { //Any other better methods from kendo??
      Array.from(this.buttonGroupRef.buttons)[i].selected = i == idx
    }
  }

  destroyTabletTaskJobComp(){
    this.tabletTaskDetailCompRef?.destroy()
    this.tabletTaskDetailCompRef = null
  }
}
