import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { filter, retry, take } from 'rxjs/operators';
import { DataService, DropListBuilding, DropListMap, JFloorPlan, JMap, MapJData, ShapeJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent,   radRatio} from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import * as PIXI from 'pixi.js';
import { TabStripComponent } from '@progress/kendo-angular-layout';
import { AuthService } from 'src/app/services/auth.service';
import { SaMapComponent } from 'src/app/standalone/sa-map/sa-map.component';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';
import { trimAngle } from 'src/app/utils/math/functions';
import { Observable, of } from 'rxjs';
import { PixiGraphicStyle , DRAWING_STYLE} from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import { PixiEditableMapImage, PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';

@Component({
  selector: 'app-cm-map-floorplan',
  templateUrl: './cm-map-floorplan.component.html',
  styleUrls: ['./cm-map-floorplan.component.scss']
})
export class CmMapFloorplanComponent implements OnInit {
  readonly = false
  @ViewChild('pixi') pixiElRef : Map2DViewportComponent
  @ViewChild('pixiContainer') pixiContainer : ElementRef
  @ViewChild('container') mainContainer : ElementRef
  @ViewChild('tabStrip') tabStripRef : TabStripComponent
  @HostBinding('class') customClass = 'setup-map'

  constructor(public util : GeneralUtil, public uiSrv : UiService , public windowSrv: DialogService, public ngZone : NgZone,
              public httpSrv : RvHttpService  , private dataSrv : DataService , public authSrv : AuthService) { 
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
    this.showWaypointType = this.authSrv.hasRight("FLOORPLAN_POINT_TYPE")
  }
  frmGrp = new FormGroup({
    floorPlanCode: new FormControl('' , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(''),
    fileName: new FormControl(null),
    defaultPerBuilding : new FormControl(false),
    siteCode: new FormControl(null),
    buildingCode: new FormControl(null),
    modifiedDateTime: new FormControl(null),
  })
  // initialDataset = null
  // get initialFloorPlan(){
  //   return this.initialDataset?.['floorPlan']
  // }
  locationDataMap = new Map()
  windowRef
  @Input()parent : SaMapComponent
  dropdownData :{ maps? : DropListMap [] , buildings? : DropListBuilding[]} = {
    // sites : [],
    maps:[],
    buildings :[],
    // floors:[]
  }

  dropdownOptions = {
    // sites : [],
    maps:[],
    buildings :[],
    // floors:[]
  }

  // selectedMapIds = []
  mapsStore = new Map<string , JMap[]>()
  selectedPixiShape = null 
  pk = 'planId'
  @Input()set id(v){
    // this.code = v
  }
  get id(){
    return this.code
  }

  loadingTicket
  subscriptions = []
  selectedTab = 'maps'
  tabs = ['maps', 'locations']
  pixiMapBorders = []
  mapCode: string = null
  showWaypointType = false
  mapTree: {
    data: { mapCode: string, name: string, robotBases: { robotBase: string, name: string }[] }[],
    isExpanded : any ,
    addExpandedKeys: any ,
    removeExpandedKeys: any ,
    refreshExpandedKeys: any ,
    checkedKeys : any[],
    expandedKeys :  any[],
  } = {
    data : [],
    isExpanded : (dataItem: any , index: string) => {return this.mapTree.expandedKeys.includes(index)},
    addExpandedKeys :  (evt: any) => this.mapTree.expandedKeys = this.mapTree.expandedKeys.filter((k) => k !== evt.index).concat(evt.index),
    removeExpandedKeys :  (evt: any) => this.mapTree.expandedKeys =  this.mapTree.expandedKeys.filter((k) => k !== evt.index),
    refreshExpandedKeys :() =>  this.mapTree.expandedKeys = this.mapTree.data.filter(d=> d.mapCode == this.mapCode).map(d=>this.mapTree.data.indexOf(d).toString()),
    checkedKeys : [],
    expandedKeys : [],
  }


  @Input() parentRow = null
  get isCreate(){
    return this.parentRow == null
  }
  get code():string{
    return this.parentRow?.floorPlanCode
  }
 
  ngOnInit(): void {
    this.readonly = this.readonly || !this.authSrv.hasRight(this.id ? "FLOORPLAN_EDIT" : "FLOORPLAN_ADD")
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k=>this.frmGrp.controls[k].disable())
    }
    
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubsribe())
  }


  async ngAfterViewInit(){
    await this.initDropDown()
    this.pixiElRef.initDone$.subscribe(async () => {
      if (this.id) {
        await this.loadData(this.id)
        // setTimeout(()=>this.testResourcePost())
      } 
      this.frmGrp.controls['fileName']['uc'].textbox.input.nativeElement.disabled = true
      this.uiSrv.loadAsyncDone(this.loadingTicket)

    })

    this.pixiElRef.init()
  }

  async loadData(id){
    let ticket = this.uiSrv.loadAsyncBegin()
    let data : JFloorPlan = await this.httpSrv.get("api/map/plan/v1/" + id.toString())
    // data = JSON.parse(testDs4)
    this.mapCode = data.mapList[0]?.mapCode
    this.mapTree.refreshExpandedKeys()
    await this.pixiElRef.loadDataset(data, undefined, undefined, false)
    if (this.mapCode) {
      await this.getMapsData(this.mapCode)
      await this.loadMapsToPixi(this.mapCode, false)
    }
    // this.mapsStore.set(this.mapCode , JSON.parse(JSON.stringify(data.mapList)))
    // for (let i = 0; i < this.mapsStore.get(this.mapCode).length; i++) {
    //   let pixiMap = await this.pixiElRef.loadMapV2(this.mapsStore.get(this.mapCode)[i])
    //   if (!this.readonly && i == data.mapList.length - 1) {
    //     this.pixiElRef.selectGraphics(pixiMap)
    //   }
    // } 
    this.util.loadToFrmgrp(this.frmGrp ,  data);
    (<any>this.pixiElRef.viewport.allPixiWayPoints).concat((<any>this.pixiElRef.viewport.allPixiPaths)).forEach(gr=>gr.visible = this.selectedTab == 'locations');
    // (<any>this.pixiElRef.allPixiPoints).concat((<any>this.pixiElRef.allPixiArrows)).forEach(gr=>this.pixiElRef.removeGraphics(gr))
    // JSON.parse(RNR_1110).forEach(w => {
    //   this.add_UserTrainingWaypoint(w['name'].toUpperCase(), w['x'], w['y'] , w['angle'])
    // })
    this.uiSrv.loadAsyncDone(ticket);
  }
  
  async tabletClose(planId){
    this.parent.editingFpKeySet = false
    setTimeout(async()=>{
      await this.parent.refreshTabletList();
      this.parent.selectedFloorplanCode = planId
      this.parent.onTabChange('floorplan', true ,  !planId)
    })
  }

  async initDropDown(){
    let ticket = this.uiSrv.loadAsyncBegin()
    this.dropdownData.maps = <any>(await this.dataSrv.getDropList('maps')).data
    let excludeMapCodes = this.dropdownData.maps.filter(m=>m.floorPlanCode != null && m.floorPlanCode != this.code).map(m=>m.mapCode)
    this.dropdownData.maps = this.dropdownData.maps.filter(m=> !excludeMapCodes.includes(m.mapCode))
    this.dropdownOptions.maps = this.dataSrv.getDropListOptions('maps',this.dropdownData.maps) 
    if(this.util.arcsApp){
      let buildingDDL = await this.dataSrv.getDropList('buildings')
      this.dropdownData.buildings = <any>buildingDDL.data
      this.dropdownOptions.buildings = buildingDDL.options
      
      let tmpObj = this.util.getGroupedListsObject(this.dropdownData.maps , 'mapCode')
      this.mapTree.data = Object.keys(tmpObj).map(k => {
        return {
          mapCode: k,
          name: k,
          robotBases: tmpObj[k].map((v: DropListMap) => {
            return {
              robotBase: v.robotBase,
              name: `[${v.robotBase}] ${v.name}`,
              mapCode: v.mapCode,
              alert: !v.floorPlanCode && this.dropdownData.maps.filter(m => m.floorPlanCode == this.code && m.mapCode == v.mapCode).length > 0
            }
          }),
        }
      })
    }
    this.uiSrv.loadAsyncDone(ticket)
  }



  async onPointUnselected(gr : PixiWayPoint){
    if(this._validatingWaypointName){
      return
    }
    if (!await this.validateWaypointName(gr.text , gr)) {
      this.pixiElRef.viewport.mode = null      
      this.pixiElRef.viewport.selectedGraphics =  gr     
      setTimeout(()=>{
        gr.focusInput()
      })
    }
    // else if(this.uiSrv.isTablet && unselect){
    //   this.pixiElRef.viewport.selectedGraphics = null
    // } 
  }

  _validatingWaypointName = false
  async validateWaypointName(code, gr) {
    this._validatingWaypointName = true
    let ret = true
    if (!code || code.toString().trim() == '' || this.pixiElRef.viewport.allPixiWayPoints.filter(g => g.code == code && g != gr).length > 0) {
      await this.uiSrv.showMsgDialog(!code || code.toString().trim() == '' ? 'Please enter location name' : `Location Name Duplicated [${code}]`)
      ret = false
    } else if (!new RegExp(/^[A-Z0-9-_]+$/).test(code)) {
      await this.uiSrv.showMsgDialog(this.uiSrv.translate("Invalid Waypoint Name {code}. Only Underscore , Dash and Upper Case Alphanumeric are accepted").replace('{code}' , code))
      ret = false
    }else if(code.length > 50){
      await this.uiSrv.showMsgDialog(this.uiSrv.translate("Waypoint name length must not exceeds 50 characters"))
      ret = false
    }
    this._validatingWaypointName = false
    return ret
  }

  async validate() {
    for (let i = 0; i < this.pixiElRef.viewport.allPixiWayPoints.length ; i++) {
      if (! await this.validateWaypointName(this.pixiElRef.viewport.allPixiWayPoints[i].text, this.pixiElRef.viewport.allPixiWayPoints[i])) {
        return false
      }
    }
    // let outOfBoundShapes = this.pixiElRef.getSubmitDataset().outOfBoundShapes
    // let ds = this.pixiElRef.getSubmitDatasetV2()
    // let outOfBoundShapesV2 = {}
    // ds.mapList.forEach(m=>{
    //   outOfBoundShapesV2[m.robotBase] = ds.pointList.filter(p=>!m.pointList.map(mp=>mp.pointCode).includes(p.pointCode))
    // })
    // var invalidRobotBase = Object.keys(outOfBoundShapesV2).filter(k=>(<any> outOfBoundShapesV2[k]).length > 0)[0] 
    // if(this.mapCode && invalidRobotBase){
    //   this.uiSrv.showMsgDialog(
    //     this.uiSrv.translate('Way point [point] out of bound for robot base [robotBase]')
    //     .replace('[point]' , outOfBoundShapesV2[invalidRobotBase][0].pointCode)
    //     .replace('[robotBase]',invalidRobotBase)
    //   )
    //   // this.changeTab('locations')
    // }
    return true //|| !invalidRobotBase 
  }

  getSubmitDataset() {
    let ret = new JFloorPlan();
    let pixiDs = this.pixiElRef.getDataset(this.frmGrp.controls['floorPlanCode'].value)
    Object.keys(this.frmGrp.controls).forEach(k=>ret[k] = this.frmGrp.controls[k].value)
    Object.keys(pixiDs).forEach(k => {
      ret[k] = pixiDs[k]
    })
    ret.mapList.forEach(m => m.base64Image = null); //to reduce data traffic
    return ret   
  }

  // checkNoChanges() : boolean{
  //   return JSON.stringify(this.initialDataset) == JSON.stringify(this.getSubmitDataset())
  // }

  async onClose(){    
    if( this.readonly || await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      if(this.uiSrv.isTablet){
        this.tabletClose(null)
      }else{
        this.windowRef.close()
      }
    }
  }

  async saveToDB(){
    if(!this.util.validateFrmGrp(this.frmGrp) || !await this.validate()){
      return 
    }       
    let ds = this.getSubmitDataset()
    if((await this.dataSrv.saveRecord("api/map/plan/v1"  , ds , {"floorPlan" : this.frmGrp} , this.isCreate)).result == true){
      if(this.uiSrv.isTablet){
        this.tabletClose(this.id)
      }else{
        this.windowRef.close()
      }
    }
  }

  async onMapCodeSelected() {
    let originalTab = this.selectedTab
    await this.changeTab('maps')
    this.pixiElRef.removeMaps();
    this.pixiMapBorders.forEach(b=>this.pixiElRef.mainContainer.removeChild(b))
    this.pixiMapBorders = []
    if(this.mapCode){
      await this.getMapsData(this.mapCode)
      await this.loadMapsToPixi()
      this.pixiElRef.robotBasesOptions = this.mapsStore.get(this.mapCode).map(m=>{return {value : m.robotBase , text : m.robotBase}})
      this.pixiElRef.viewport.allPixiWayPoints.forEach(p=>p.robotBases = this.mapsStore.get(this.mapCode).map(m=>m.robotBase))
    }   
    await this.changeTab(originalTab)
  }

  async loadMapsToPixi(mapCode : string = this.mapCode , select = true){
    let maps = this.mapsStore.get(this.mapCode)
    for (let i = 0; i < maps.length ; i++) {
      var map = await this.pixiElRef.loadMap(maps[i])
      if(select && !this.readonly && i == maps.length - 1){
        setTimeout(()=>{
          if(this.selectedTab == 'maps'){         
            this.pixiElRef.viewport.selectedGraphics = map 
          }else if(this.pixiElRef.selectedGraphics == map){
            this.pixiElRef.viewport.selectedGraphics = null
          }
        })
      }
      if (!this.readonly && i == maps.length - 1) {
        this.pixiElRef.viewport.selectedGraphics = map
      }
    } 
  }


  async getMapsData(code){
    if( Array.from(this.mapsStore.keys()).includes(code)){
      return
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    let resp = await this.httpSrv.get("api/map/v1/" + code )
    this.uiSrv.loadAsyncDone(ticket)
    this.mapsStore.set(code ,resp ) 
  }

  refreshselectedGraphics(dataItem : DropListMap){
    if(this.selectedTab == 'maps' &&  dataItem?.robotBase && this.pixiElRef.viewport.mapLayerStore[dataItem?.robotBase]){
      this.pixiElRef.viewport.selectedGraphics = this.pixiElRef.viewport.mapLayerStore[dataItem?.robotBase] 
      this.selectedPixiShape = this.pixiElRef.viewport.mapLayerStore[dataItem?.robotBase] 
    }
  }


  async changeTab(tab){
    let idx =  this.tabs.indexOf(tab)
    this.tabStripRef.selectTab(idx)
    await this.selectedTabChanged(tab) 
  }
  
  async selectedTabChanged(evt){
    if(evt==this.selectedTab){
      return
    }else{
      this.selectedTab = this.tabs[evt]

    }
    // this.pixiElRef.toggleRosMap(false)
    this.pixiElRef.viewport.selectedGraphics = null
    this.pixiElRef.hideButton =  this.selectedTab == 'maps' || this.readonly? {all : true} : { polygon : true , brush : true , line : true , export : true};
    this.mapTree.data.filter(m=>this.mapCode == m.mapCode).forEach(m=>{
      m.robotBases.forEach(b => this.toggleMapVisibility(<DropListMap>b, this.selectedTab == 'maps'))
    });
    // Object.values(this.pixiElRef.viewport.mapLayerStore).filter((v : PixiMapLayer) => v && v.ROS).forEach((c: PixiMapLayer) =>{
    //   c.interactive =  this.selectedTab == 'maps'
    //   c.ROS.alpha = this.selectedTab == 'maps' ? 0.5 : 0
    // });
    (<any>this.pixiElRef.viewport.allPixiWayPoints).concat((<any>this.pixiElRef.viewport.allPixiPaths)).forEach(gr=>gr.visible = this.selectedTab == 'locations')
    if(this.selectedTab == 'maps'){
      this.pixiMapBorders.forEach(g=>g.parent.removeChild(g))
      this.pixiMapBorders = []
      this.pixiElRef.viewport.selectedGraphics = this.selectedPixiShape ? this.selectedPixiShape : Object.values(this.pixiElRef.viewport.mapLayerStore)[0]

      Object.values(this.pixiElRef.viewport.mapLayerStore).forEach((m: PixiEditableMapImage) =>{
        m.interactive = true
        // if(m.border){
        //   m.border.visible = true
        // }
      })
    }else if(this.selectedTab == 'locations'){
      this.renderMapBordersOnPixi()
      Object.values(this.pixiElRef.viewport.mapLayerStore).forEach((m: PixiEditableMapImage) =>{
        m.interactive = false
        if(m.border){
          m.border.visible = false
        }
      })
    }
  }

  toggleMapVisibility(item : DropListMap , visible = undefined){
    let pixiMap : PixiEditableMapImage = this.pixiElRef?.viewport.mapLayerStore[item.robotBase]
    if(pixiMap){
      let originalVisible = pixiMap.ROS.alpha;
      visible = visible === undefined ? !originalVisible : visible
      if(originalVisible && this.pixiElRef?.selectedGraphics == pixiMap){
        this.pixiElRef.viewport.selectedGraphics = null
      }
      pixiMap.ROS.alpha = visible ? 0.5 : 0
      pixiMap.interactive = this.selectedTab == 'maps' && visible
    }
    item['hidden'] = !visible
  }

  renderMapBordersOnPixi(){
    this.pixiMapBorders.forEach(g=>g.parent.removeChild(g))
    this.pixiMapBorders = []
    Object.values(this.pixiElRef.viewport.mapLayerStore).forEach((m:PixiEditableMapImage)=>{
      let border = new PIXI.Graphics()
      this.pixiMapBorders.push(border)
      border.position.set(m.position.x , m.position.y)
      border.pivot.set(m.pivot.x , m.pivot.y)
      border.angle = m.angle
      border.scale.set(m.scale.x , m.scale.y);
      let pts = [[0,0] , [m.width / m.scale.x , 0] , [m.width / m.scale.x , m.height / m.scale.y] , [0 , m.height / m.scale.y]]
      let opt = new PixiGraphicStyle(border).set('lineColor' , DRAWING_STYLE.mouseOverColor )
      //########## new PixiCommon(m.viewport).getLines(pts.map(p=>new PIXI.Point(p[0] , p[1])) , opt , true , this.pixiElRef , m)
      this.pixiElRef.mainContainer.addChild(border)
    })  
  }

  async getPoseAndAddWaypoint_SA(){
    let resp: { x: number, y: number, angle : number , mapName: string } = await this.httpSrv.fmsRequest('GET', 'localization/v1/pose', undefined, false)
    if (this.mapCode != resp.mapName) {
      this.uiSrv.showMsgDialog('Current map not match with selected map')
    } else if (this.pixiElRef) {
      let map : PixiEditableMapImage = this.pixiElRef.viewport.mapLayerStore[this.mapCode]
      let mapPosition = { x: map.calculateMapX(resp.x), y: map.calculateMapY(resp.y) }
      let position = this.pixiElRef.mainContainer.toLocal(this.pixiElRef.viewport.mapLayerStore[this.mapCode].toGlobal(new PIXI.Point(mapPosition.x , mapPosition.y)))
      let gr = new PixiWayPoint(this.pixiElRef.viewport , undefined , new PixiGraphicStyle() , true)
      gr.position.set(position.x , position.y)

      if(gr.angleIndicator){
        let angle = 90 - resp.angle * radRatio + this.pixiElRef.viewport.mapLayerStore[resp.mapName].angle
        gr.angleIndicator.angle = trimAngle(angle)
      }
      this.pixiElRef.viewport.mode = null
      this.pixiElRef.viewport.selectedGraphics = gr
      gr.focusInput()
    }    
  }

  add_UserTrainingWaypoint(name , x , y , rad){ //for HKAA user training only
      let map : PixiEditableMapImage = <any>Object.values(this.pixiElRef.viewport.mapLayerStore)[0]
      // let origin = this.pixiElRef.getGuiOrigin(map)
      let mapPosition = { x: map.calculateMapX(x), y: map.calculateMapY(y) }
      let position = this.pixiElRef.mainContainer.toLocal((<any>map).toGlobal(mapPosition))
      let gr = new PixiWayPoint(this.pixiElRef.viewport , undefined , new PixiGraphicStyle() , true)
      gr.position.set(position.x , position.y)
      if(gr.angleIndicator){
        let angle = 90 - rad * 57.2958 + map.angle
        gr.angleIndicator.angle = trimAngle(angle)
      }
      gr.text = name
      this.pixiElRef.viewport.mode = null
      this.pixiElRef.viewport.selectedGraphics = gr
    // this.pixiElRef.onWayPointMouseDown(gr)
  }

}

const RNR_1110 = `
[
  {
    "id": 507,
    "name": "P3",
    "mapName": "10-17_RnR_warehouse",
    "x": 11.08719,
    "y": 0.10071,
    "angle": -0.04927062716638903
  },
  {
    "id": 508,
    "name": "HOME_2",
    "mapName": "10-17_RnR_warehouse",
    "x": -0.05748,
    "y": -0.03996,
    "angle": -3.109669469664443
  },
  {
    "id": 509,
    "name": "P1",
    "mapName": "10-17_RnR_warehouse",
    "x": 0.28147,
    "y": 0.70312,
    "angle": -0.06981314511709409
  },
  {
    "id": 510,
    "name": "P4",
    "mapName": "10-17_RnR_warehouse",
    "x": 3.16881,
    "y": 3.68867,
    "angle": 2.534603386689777
  },
  {
    "id": 511,
    "name": "P2",
    "mapName": "10-17_RnR_warehouse",
    "x": 5.25134,
    "y": 0.32662,
    "angle": -0.08799946942009712
  }
]
`
const HKAA_1110 = `
[
  {
    "id": 81,
    "name": "G29",
    "mapName": "aa_2022_1107",
    "x": -48.4131860859269,
    "y": 224.5536079844658,
    "angle": -2.88608334691888
  },
  {
    "id": 82,
    "name": "G30",
    "mapName": "aa_2022_1107",
    "x": -31.15699842385631,
    "y": 229.6553018000234,
    "angle": 0.24632676794803973
  },
  {
    "id": 83,
    "name": "G28",
    "mapName": "aa_2022_1107",
    "x": -13.66135371429824,
    "y": 160.0312385918187,
    "angle": 0.24767971403381447
  },
  {
    "id": 84,
    "name": "G27",
    "mapName": "aa_2022_1107",
    "x": -25.2155563361731,
    "y": 136.0282393482742,
    "angle": -2.923041162087549
  },
  {
    "id": 85,
    "name": "G25",
    "mapName": "aa_2022_1107",
    "x": -6.060370205616088,
    "y": 63.49129741616618,
    "angle": -2.911496080945027
  },
  {
    "id": 86,
    "name": "G26",
    "mapName": "aa_2022_1107",
    "x": 5.796341552157386,
    "y": 82.52715362929607,
    "angle": 0.23159271812473745
  },
  {
    "id": 87,
    "name": "G24",
    "mapName": "aa_2022_1107",
    "x": 27.08458500025414,
    "y": 4.138400195808729,
    "angle": 0.21489909923622508
  },
  {
    "id": 88,
    "name": "CHARGE",
    "mapName": "aa_2022_1107",
    "x": 1.551250269191875,
    "y": -1.291920739105948,
    "angle": -1.2570127115448217
  },
  {
    "id": 89,
    "name": "G23",
    "mapName": "aa_2022_1107",
    "x": 9.95125039436163,
    "y": -5.123126009999176,
    "angle": -2.926133199633175
  },
  {
    "id": 90,
    "name": "EXIT",
    "mapName": "aa_2022_1107",
    "x": 28.55343709017329,
    "y": -64.1610970135638,
    "angle": -1.33030798344777
  },
  {
    "id": 91,
    "name": "G12",
    "mapName": "aa_2022_1107",
    "x": 39.02010594731068,
    "y": -55.73243992748124,
    "angle": 0.21253048074951325
  },
  {
    "id": 92,
    "name": "G32",
    "mapName": "aa_2022_1107",
    "x": -50.92816998352235,
    "y": 297.1278926479058,
    "angle": 0.220585698615184
  },
  {
    "id": 93,
    "name": "G31",
    "mapName": "aa_2022_1107",
    "x": -65.27493337033336,
    "y": 281.3241726231862,
    "angle": -2.8991705597201105
  }
]
`
const EU_WP = `
[
  {
    "id": 397,
    "name": "Start_2",
    "mapName": "10-17_RnR_warehouse",
    "x": 2.966442440593669,
    "y": -2.601881595312494,
    "angle": 3.1386832871684316
  },
  {
    "id": 398,
    "name": "s6",
    "mapName": "10-17_RnR_warehouse",
    "x": 1.604409644227397,
    "y": -2.592617986020551,
    "angle": -0.015802750685484243
  },
  {
    "id": 399,
    "name": "s5",
    "mapName": "10-17_RnR_warehouse",
    "x": 1.070952183259701,
    "y": -2.582888729963694,
    "angle": 0
  },
  {
    "id": 400,
    "name": "s4",
    "mapName": "10-17_RnR_warehouse",
    "x": 0.5971677943805885,
    "y": -2.575685861570744,
    "angle": 0.004068449202977584
  },
  {
    "id": 401,
    "name": "s3",
    "mapName": "10-17_RnR_warehouse",
    "x": -0.4195532151842429,
    "y": -2.572572242533251,
    "angle": -0.008961971002202885
  },
  {
    "id": 402,
    "name": "s2",
    "mapName": "10-17_RnR_warehouse",
    "x": -0.9312842654664725,
    "y": -2.559664934136161,
    "angle": -0.005686118198676057
  },
  {
    "id": 403,
    "name": "s1",
    "mapName": "10-17_RnR_warehouse",
    "x": -1.44138350734446,
    "y": -2.55915335946914,
    "angle": -0.008830184227618967
  },
  {
    "id": 404,
    "name": "Start_1",
    "mapName": "10-17_RnR_warehouse",
    "x": -3.623490318352679,
    "y": -2.555565872695709,
    "angle": 0
  },
  {
    "id": 405,
    "name": "Home",
    "mapName": "10-17_RnR_warehouse",
    "x": -1.496059593877561,
    "y": -4.634977640577064,
    "angle": -0.013081180746831214
  },
  {
    "id": 406,
    "name": "charge",
    "mapName": "10-17_RnR_warehouse",
    "x": -7.34304315236259,
    "y": -4.70669707831617,
    "angle": 0.034175112926927084
  }
]`
// const EU_WP=`
// [
//   {"name" : "START_2" ,  "x": 2.966442440593669 , "y": -2.601881595312494} , 
//   {"name" : "S6" , "y": -2.592617986020551 , "x": 1.604409644227397},
//   {"name" : "S5" , "y": -2.582888729963694 , "x": 1.070952183259701},
//   {"name" : "S4" , "y": -2.575685861570744 , "x": 0.5971677943805885},
//   {"name" : "S3" , "y": -2.572572242533251 , "x": -0.4195532151842429},
//   {"name" : "S2" , "y": -2.559664934136161 , "x": -0.9312842654664725},
//   {"name" : "S1" , "y": -2.55915335946914 , "x": -1.44138350734446},
//   {"name" : "START_1" , "y": -2.555565872695709 , "x": -3.623490318352679},
//   {"name" : "HOME" , "y": -4.634977640577064 , "x": -1.496059593877561},
//   {"name" : "CHARGE" , "y": -7.34304315236259 , "x": -4.70669707831617}
// ]
// `

// const DEMO_5W_0915 = `
// [
//   {
//     "id": 55,
//     "name": "CHARGE",
//     "mapName": "5W_2022",
//     "x": 2.81752,
//     "y": 0.6439,
//     "angle": 2.9953526911763184
//   },
//   {
//     "id": 56,
//     "name": "WP-06",
//     "mapName": "5W_2022",
//     "x": 2.71187,
//     "y": -0.91716,
//     "angle": 2.9852995982794583
//   },
//   {
//     "id": 57,
//     "name": "WP-05",
//     "mapName": "5W_2022",
//     "x": 2.45829,
//     "y": -4.20544,
//     "angle": 2.9852995982794583
//   },
//   {
//     "id": 58,
//     "name": "WP-02",
//     "mapName": "5W_2022",
//     "x": 0.15933,
//     "y": -3.39817,
//     "angle": 2.9852995982794583
//   },
//   {
//     "id": 59,
//     "name": "WP-01",
//     "mapName": "5W_2022",
//     "x": 0.66337,
//     "y": -0.05947,
//     "angle": 2.9852995982794583
//   },
//   {
//     "id": 60,
//     "name": "WP-03",
//     "mapName": "5W_2022",
//     "x": -2.04111,
//     "y": 3.91715,
//     "angle": 2.9852995982794583
//   },
//   {
//     "id": 61,
//     "name": "WP-04",
//     "mapName": "5W_2022",
//     "x": -3.74078,
//     "y": -7.56897,
//     "angle": 2.9852995982794583
//   }
// ]
// `

// const DEMO_5W_0913 = `
// [
//   {
//     "id": 84,
//     "name": "G24",
//     "mapName": "AA_L5_Transfer",
//     "x": 123.3553900973949,
//     "y": 40.04168728900149,
//     "angle": -1.1321428938182323
//   },
//   {
//     "id": 85,
//     "name": "G12",
//     "mapName": "AA_L5_Transfer",
//     "x": 62.41089864618905,
//     "y": 6.289999441776351,
//     "angle": -1.0738282299776354
//   },
//   {
//     "id": 86,
//     "name": "G10",
//     "mapName": "AA_L5_Transfer",
//     "x": 20.60239200783864,
//     "y": -15.12429315481907,
//     "angle": -1.1071493491921236
//   },
//   {
//     "id": 87,
//     "name": "G11",
//     "mapName": "AA_L5_Transfer",
//     "x": 15.09519306663323,
//     "y": 1.424053173191934,
//     "angle": 2.038928141633175
//   },
//   {
//     "id": 88,
//     "name": "G11_LOCAL",
//     "mapName": "AA_L5_Transfer",
//     "x": 5.013489378882292,
//     "y": -1.401203894472973,
//     "angle": -1.0803349301424028
//   },
//   {
//     "id": 89,
//     "name": "G11_CHARGE",
//     "mapName": "AA_L5_Transfer",
//     "x": -2.157927187320118,
//     "y": -1.680984820427425,
//     "angle": 2.0344439357957027
//   },
//   {
//     "id": 90,
//     "name": "EXIT",
//     "mapName": "AA_L5_Transfer",
//     "x": -66.89217021839022,
//     "y": -116.1822080262979,
//     "angle": 1.889133663885386
//   },
//   {
//     "id": 99,
//     "name": "E1",
//     "mapName": "AA_L5_Transfer",
//     "x": -42.84505625448343,
//     "y": -83.82502327025331,
//     "angle": -1.815774989921761
//   }
// ]
// `
// const DEMO_5W_0908_2 = `
// [
//   {
//     "id": 322,
//     "name": "CHARGE",
//     "mapName": "5W_2022",
//     "x": -0.15194,
//     "y": 0.32969,
//     "angle": 0.0044156814286562
//   },
//   {
//     "id": 324,
//     "name": "WP-01",
//     "mapName": "5W_2022",
//     "x": 1.3685,
//     "y": 0.83415,
//     "angle": -1.4547139580911699
//   },
//   {
//     "id": 325,
//     "name": "WP-02",
//     "mapName": "5W_2022",
//     "x": 1.72359,
//     "y": -5.25063,
//     "angle": 0.0193731477699936
//   },
//   {
//     "id": 326,
//     "name": "WP-03",
//     "mapName": "5W_2022",
//     "x": -2.70512,
//     "y": 3.09052,
//     "angle": -1.49150548556788
//   },
//   {
//     "id": 327,
//     "name": "WP-04",
//     "mapName": "5W_2022",
//     "x": -1.82942,
//     "y": -13.75759,
//     "angle": 1.6194054140635168
//   },
//   {
//     "id": 328,
//     "name": "WP-05",
//     "mapName": "5W_2022",
//     "x": 3.2905,
//     "y": -5.21141,
//     "angle": 1.6377488179430268
//   },
//   {
//     "id": 329,
//     "name": "WP-06",
//     "mapName": "5W_2022",
//     "x": 3.03436,
//     "y": 0.8907,
//     "angle": 1.6754304630199768
//   }
// ]
// `
// const DEMO_5W_0908 = `
// [{
//   "id": 322,
//   "name": "CHARGE",
//   "mapName": "5W_2022",
//   "x": -0.15194,
//   "y": 0.32969,
//   "angle": 0.004415681428656204
// },
// {
//   "id": 324,
//   "name": "WP-01",
//   "mapName": "5W_2022",
//   "x": 1.62586,
//   "y": -4.97491,
//   "angle": 1.6041686951417058
// },
// {
//   "id": 325,
//   "name": "WP-02",
//   "mapName": "5W_2022",
//   "x": 1.15635,
//   "y": -2.42862,
//   "angle": 0.019373147769993604
// },
// {
//   "id": 326,
//   "name": "WP-03",
//   "mapName": "5W_2022",
//   "x": -2.70512,
//   "y": 3.09052,
//   "angle": -1.4915054855678775
// },
// {
//   "id": 327,
//   "name": "WP-04",
//   "mapName": "5W_2022",
//   "x": -2.00484,
//   "y": -13.2635,
//   "angle": 1.5294838365115766
// }]
// `

// const HKAA_WAYPOINTS0824 =`
// [
//   {
//     "id": 84,
//     "name": "G24",
//     "mapName": "AA_L5_Transfer",
//     "x": 123.3553900973949,
//     "y": 40.04168728900149,
//     "angle": -1.1321428938182323
//   },
//   {
//     "id": 85,
//     "name": "G12",
//     "mapName": "AA_L5_Transfer",
//     "x": 62.41089864618905,
//     "y": 6.289999441776351,
//     "angle": -1.0738282299776354
//   },
//   {
//     "id": 86,
//     "name": "G10",
//     "mapName": "AA_L5_Transfer",
//     "x": 20.60239200783864,
//     "y": -15.12429315481907,
//     "angle": -1.1071493491921236
//   },
//   {
//     "id": 87,
//     "name": "G11",
//     "mapName": "AA_L5_Transfer",
//     "x": 15.09519306663323,
//     "y": 1.424053173191934,
//     "angle": 2.038928141633175
//   },
//   {
//     "id": 88,
//     "name": "G11_LOCAL",
//     "mapName": "AA_L5_Transfer",
//     "x": 5.013489378882292,
//     "y": -1.401203894472973,
//     "angle": -1.0803349301424028
//   },
//   {
//     "id": 89,
//     "name": "G11_CHARGE",
//     "mapName": "AA_L5_Transfer",
//     "x": -2.157927187320118,
//     "y": -1.680984820427425,
//     "angle": 2.0344439357957027
//   },
//   {
//     "id": 90,
//     "name": "EXIT",
//     "mapName": "AA_L5_Transfer",
//     "x": -66.89217021839022,
//     "y": -116.1822080262979,
//     "angle": 1.889133663885386
//   }
// ]
// `

// const DEMO_0815_5W = `
// [
//   {
//     "id": 687,
//     "name": "WP_03",
//     "mapName": "5W",
//     "x": -0.2972311113040814,
//     "y": 0.1787712327557873,
//     "angle": 0
//   },
//   {
//     "id": 688,
//     "name": "WP_02",
//     "mapName": "5W",
//     "x": -0.73444669336111,
//     "y": 6.930450996992799,
//     "angle": 0
//   },
//   {
//     "id": 689,
//     "name": "WP_01",
//     "mapName": "5W",
//     "x": -0.9601225442503668,
//     "y": 9.138471009121366,
//     "angle": -1.5334098871714283
//   },
//   {
//     "id": 690,
//     "name": "WP_04",
//     "mapName": "5W",
//     "x": 12.08329503355481,
//     "y": 0.5803630762477145,
//     "angle": 0
//   },
//   {
//     "id": 691,
//     "name": "WP_05",
//     "mapName": "5W",
//     "x": 14.12625222009187,
//     "y": 0.5210077038382347,
//     "angle": 0.010746568545452102
//   },
//   {
//     "id": 692,
//     "name": "WP_06",
//     "mapName": "5W",
//     "x": 14.48258186709556,
//     "y": -1.912562112104857,
//     "angle": -1.5208110454992425
//   }
// ]`

// const HKAA_WAYPOINTS0815 = `
// [
//   {
//     "id": 29,
//     "name": "G11",
//     "mapName": "wheelchair_test",
//     "x": 2.277091715566764,
//     "y": 15.65223147428205,
//     "angle": -3.1191367868158886
//   },
//   {
//     "id": 30,
//     "name": "A_CHARGE_G11",
//     "mapName": "wheelchair_test",
//     "x": -1.428741305931726,
//     "y": -1.407506391759312,
//     "angle": 3.136669274182967
//   },
//   {
//     "id": 31,
//     "name": "G10",
//     "mapName": "wheelchair_test",
//     "x": 21.10226489448139,
//     "y": 12.69737443280037,
//     "angle": 0
//   },
//   {
//     "id": 39,
//     "name": "EXIT_G5-9",
//     "mapName": "wheelchair_test",
//     "x": 135.3471561085639,
//     "y": -134.3599013532761,
//     "angle": 1.5441250890796663
//   },
//   {
//     "id": 40,
//     "name": "G9",
//     "mapName": "wheelchair_test",
//     "x": 340.8364932998956,
//     "y": -159.6335726466058,
//     "angle": 1.6071640552433968
//   },
//   {
//     "id": 52,
//     "name": "EXIT_G1-4",
//     "mapName": "wheelchair_test",
//     "x": -115.2436837763202,
//     "y": -129.7258915381139,
//     "angle": 3.084541869926043
//   },
//   {
//     "id": 54,
//     "name": "G1",
//     "mapName": "wheelchair_test",
//     "x": -176.7275134930203,
//     "y": -121.2739184321057,
//     "angle": 0
//   },
//   {
//     "id": 55,
//     "name": "G2",
//     "mapName": "wheelchair_test",
//     "x": -247.3843866880411,
//     "y": -120.6764919162144,
//     "angle": 0.011759207948191297
//   },
//   {
//     "id": 56,
//     "name": "G3",
//     "mapName": "wheelchair_test",
//     "x": -321.2844591278919,
//     "y": -121.4431106782647,
//     "angle": 0.014278739132463912
//   },
//   {
//     "id": 63,
//     "name": "G5",
//     "mapName": "wheelchair_test",
//     "x": 169.784465946906,
//     "y": -127.7465675128748,
//     "angle": 3.1211981926288925
//   },
//   {
//     "id": 65,
//     "name": "G6",
//     "mapName": "wheelchair_test",
//     "x": 263.0616206293278,
//     "y": -130.1215055289816,
//     "angle": 3.1073776003801497
//   },
//   {
//     "id": 66,
//     "name": "G7",
//     "mapName": "wheelchair_test",
//     "x": 335.3665450514058,
//     "y": -134.6978207649355,
//     "angle": 3.1198684019592444
//   },
//   {
//     "id": 68,
//     "name": "EXIT_G5-9_CP",
//     "mapName": "wheelchair_test",
//     "x": 146.7444662139348,
//     "y": -134.2131332986044,
//     "angle": 3.130845632794527
//   },
//   {
//     "id": 71,
//     "name": "G8",
//     "mapName": "wheelchair_test",
//     "x": 345.145664366333,
//     "y": -148.5016041003712,
//     "angle": 1.5220260017624292
//   },
//   {
//     "id": 72,
//     "name": "A_LOCAL_G11",
//     "mapName": "wheelchair_test",
//     "x": 1.848835301847525,
//     "y": 5.034701210163385,
//     "angle": -0.03028102384545962
//   },
//   {
//     "id": 74,
//     "name": "G4",
//     "mapName": "wheelchair_test",
//     "x": -321.9313016922606,
//     "y": -150.4029724542821,
//     "angle": 1.5707963267948963
//   }
// ]
// `

// const HKAA_WAYPOINTS0805 = `
// [
//   {
//     "id": 29,
//     "name": "G11",
//     "mapName": "wheelchair_test",
//     "x": 2.277091715566764,
//     "y": 15.65223147428205,
//     "angle": -3.1191367868158886
//   },
//   {
//     "id": 30,
//     "name": "A_CHARGE_G11",
//     "mapName": "wheelchair_test",
//     "x": -1.428741305931726,
//     "y": -1.407506391759312,
//     "angle": 3.136669274182967
//   },
//   {
//     "id": 31,
//     "name": "G10",
//     "mapName": "wheelchair_test",
//     "x": 21.10226489448139,
//     "y": 12.69737443280037,
//     "angle": 0
//   },
//   {
//     "id": 39,
//     "name": "EXIT_G5-9",
//     "mapName": "wheelchair_test",
//     "x": 133.1388234022797,
//     "y": -133.9807079553221,
//     "angle": 1.5157049906643878
//   },
//   {
//     "id": 40,
//     "name": "G9",
//     "mapName": "wheelchair_test",
//     "x": 340.8364932998956,
//     "y": -159.6335726466058,
//     "angle": 1.6071640552433968
//   },
//   {
//     "id": 52,
//     "name": "EXIT_G1-4",
//     "mapName": "wheelchair_test",
//     "x": -115.2436837763202,
//     "y": -129.7258915381139,
//     "angle": 3.084541869926043
//   },
//   {
//     "id": 54,
//     "name": "G1",
//     "mapName": "wheelchair_test",
//     "x": -176.7275134930203,
//     "y": -121.2739184321057,
//     "angle": 0
//   },
//   {
//     "id": 55,
//     "name": "G2",
//     "mapName": "wheelchair_test",
//     "x": -247.3843866880411,
//     "y": -120.6764919162144,
//     "angle": 0.011759207948191297
//   },
//   {
//     "id": 56,
//     "name": "G3",
//     "mapName": "wheelchair_test",
//     "x": -321.2844591278919,
//     "y": -121.4431106782647,
//     "angle": 0.014278739132463912
//   },
//   {
//     "id": 63,
//     "name": "G5",
//     "mapName": "wheelchair_test",
//     "x": 169.784465946906,
//     "y": -127.7465675128748,
//     "angle": 3.1211981926288925
//   },
//   {
//     "id": 65,
//     "name": "G6",
//     "mapName": "wheelchair_test",
//     "x": 263.0616206293278,
//     "y": -130.1215055289816,
//     "angle": 3.1073776003801497
//   },
//   {
//     "id": 66,
//     "name": "G7",
//     "mapName": "wheelchair_test",
//     "x": 335.3665450514058,
//     "y": -134.6978207649355,
//     "angle": 3.1198684019592444
//   },
//   {
//     "id": 68,
//     "name": "EXIT_G5-9_CP",
//     "mapName": "wheelchair_test",
//     "x": 146.7444662139348,
//     "y": -134.2131332986044,
//     "angle": 3.130845632794527
//   },
//   {
//     "id": 71,
//     "name": "G8",
//     "mapName": "wheelchair_test",
//     "x": 345.145664366333,
//     "y": -148.5016041003712,
//     "angle": 1.5220260017624292
//   },
//   {
//     "id": 72,
//     "name": "A_LOCAL_G11",
//     "mapName": "wheelchair_test",
//     "x": 1.848835301847525,
//     "y": 5.034701210163385,
//     "angle": -0.03028102384545962
//   },
//   {
//     "id": 74,
//     "name": "G4",
//     "mapName": "wheelchair_test",
//     "x": -321.9313016922606,
//     "y": -150.4029724542821,
//     "angle": 1.5707963267948963
//   }
// ]
// `

// const HKAA_WAYPOINTS=`
// [
//   {
//     "id": 29,
//     "name": "GATE_11",
//     "mapName": "wheelchair_test",
//     "x": 2.317091105811239,
//     "y": 15.88210507179418,
//     "angle": -3.130729444224952
//   },
//   {
//     "id": 30,
//     "name": "CHARGE_PT_MW",
//     "mapName": "wheelchair_test",
//     "x": -1.268359195173912,
//     "y": -1.562577628814751,
//     "angle": -3.1347018103007596
//   },
//   {
//     "id": 31,
//     "name": "GATE_10",
//     "mapName": "wheelchair_test",
//     "x": 21.10226489448139,
//     "y": 12.69737443280037,
//     "angle": 0
//   },
//   {
//     "id": 32,
//     "name": "GATE_10_MID",
//     "mapName": "wheelchair_test",
//     "x": 15.32210769375759,
//     "y": -12.07580338258917,
//     "angle": -1.5707963267948963
//   },
//   {
//     "id": 33,
//     "name": "RW_1",
//     "mapName": "wheelchair_test",
//     "x": 24.57513121722874,
//     "y": -26.75278413749372,
//     "angle": -0.7234856199606516
//   },
//   {
//     "id": 34,
//     "name": "RW_2",
//     "mapName": "wheelchair_test",
//     "x": 30.48770220631446,
//     "y": -37.60935627430533,
//     "angle": -1.4710747436646732
//   },
//   {
//     "id": 36,
//     "name": "RW_3",
//     "mapName": "wheelchair_test",
//     "x": 43.17189435012865,
//     "y": -63.24757615341791,
//     "angle": -0.6462584293059546
//   },
//   {
//     "id": 37,
//     "name": "RW_4",
//     "mapName": "wheelchair_test",
//     "x": 69.05943470781622,
//     "y": -86.7255809919758,
//     "angle": -0.9530441227460169
//   },
//   {
//     "id": 39,
//     "name": "EXIT_RW",
//     "mapName": "wheelchair_test",
//     "x": 133.1388234022797,
//     "y": -133.9807079553221,
//     "angle": 1.5157049906643878
//   },
//   {
//     "id": 40,
//     "name": "GATE_9_RW",
//     "mapName": "wheelchair_test",
//     "x": 340.8364932998956,
//     "y": -159.6335726466058,
//     "angle": 1.6071640552433968
//   },
//   {
//     "id": 41,
//     "name": "RW_3.5",
//     "mapName": "wheelchair_test",
//     "x": 59.08347885009229,
//     "y": -123.9709471362405,
//     "angle": 1.021236313268518
//   },
//   {
//     "id": 42,
//     "name": "MW_1",
//     "mapName": "wheelchair_test",
//     "x": 12.59292335644469,
//     "y": -17.5802828439449,
//     "angle": -1.6438368920980126
//   },
//   {
//     "id": 43,
//     "name": "MW_2",
//     "mapName": "wheelchair_test",
//     "x": 6.943965377896628,
//     "y": -27.82993855759909,
//     "angle": -1.5880359979894265
//   },
//   {
//     "id": 44,
//     "name": "MW_3",
//     "mapName": "wheelchair_test",
//     "x": 6.667591349225997,
//     "y": -90.37830277522191,
//     "angle": -1.5011417530663287
//   },
//   {
//     "id": 45,
//     "name": "MW_4",
//     "mapName": "wheelchair_test",
//     "x": 6.299516283491299,
//     "y": -113.2909756172068,
//     "angle": -1.5042281630190735
//   },
//   {
//     "id": 46,
//     "name": "MW_G1",
//     "mapName": "wheelchair_test",
//     "x": -3.362454192044469,
//     "y": -132.0628039696763,
//     "angle": -1.5167948264189315
//   },
//   {
//     "id": 47,
//     "name": "MW_5",
//     "mapName": "wheelchair_test",
//     "x": 46.36041346802551,
//     "y": -130.8864981904796,
//     "angle": -1.6839473083853809
//   },
//   {
//     "id": 48,
//     "name": "LW_1",
//     "mapName": "wheelchair_test",
//     "x": -4.868707377851303,
//     "y": -30.3250229053956,
//     "angle": -1.6228602201170863
//   },
//   {
//     "id": 49,
//     "name": "LW_2",
//     "mapName": "wheelchair_test",
//     "x": -19.24783399243762,
//     "y": -57.26833621525424,
//     "angle": -2.3887056630251795
//   },
//   {
//     "id": 50,
//     "name": "LW_3",
//     "mapName": "wheelchair_test",
//     "x": -33.67079581910734,
//     "y": -105.868532701837,
//     "angle": -1.536308173998259
//   },
//   {
//     "id": 51,
//     "name": "LW_4",
//     "mapName": "wheelchair_test",
//     "x": -39.22220836990191,
//     "y": -129.1054954640732,
//     "angle": -3.141592653589793
//   },
//   {
//     "id": 52,
//     "name": "LW_5",
//     "mapName": "wheelchair_test",
//     "x": -115.2436837763202,
//     "y": -129.7258915381139,
//     "angle": 3.084541869926043
//   },
//   {
//     "id": 54,
//     "name": "GATE_1_LW",
//     "mapName": "wheelchair_test",
//     "x": -171.2691776885364,
//     "y": -121.7276971067704,
//     "angle": -1.4898486689788608
//   },
//   {
//     "id": 55,
//     "name": "GATE_2_LW",
//     "mapName": "wheelchair_test",
//     "x": -240.6760509146013,
//     "y": -121.0053247037254,
//     "angle": -1.5409379662911151
//   },
//   {
//     "id": 56,
//     "name": "GATE_3_LW",
//     "mapName": "wheelchair_test",
//     "x": -311.1594577898918,
//     "y": -121.5637008289256,
//     "angle": -1.5538400882011183
//   },
//   {
//     "id": 57,
//     "name": "GATE_4_LW",
//     "mapName": "wheelchair_test",
//     "x": -327.3402583389604,
//     "y": -145.2678716516913,
//     "angle": -1.5511808857478977
//   },
//   {
//     "id": 58,
//     "name": "CHARGING_PT_LW",
//     "mapName": "wheelchair_test",
//     "x": -322.6354588334406,
//     "y": -144.5466874447266,
//     "angle": -3.116295417060144
//   },
//   {
//     "id": 59,
//     "name": "EXIT_LW",
//     "mapName": "wheelchair_test",
//     "x": -111.5708331972567,
//     "y": -132.2137212955454,
//     "angle": -1.5617822286883387
//   },
//   {
//     "id": 60,
//     "name": "LW_2.5",
//     "mapName": "wheelchair_test",
//     "x": -33.64749823249831,
//     "y": -81.79691889919695,
//     "angle": -1.423641845868954
//   },
//   {
//     "id": 61,
//     "name": "LW_6",
//     "mapName": "wheelchair_test",
//     "x": -149.2832101078599,
//     "y": -123.1058332405126,
//     "angle": 0.0808611447564076
//   },
//   {
//     "id": 63,
//     "name": "GATE_5_RW",
//     "mapName": "wheelchair_test",
//     "x": 169.784465946906,
//     "y": -127.7465675128748,
//     "angle": 3.1211981926288925
//   },
//   {
//     "id": 65,
//     "name": "GATE_6_RW",
//     "mapName": "wheelchair_test",
//     "x": 263.0616206293278,
//     "y": -130.1215055289816,
//     "angle": 3.1073776003801497
//   },
//   {
//     "id": 66,
//     "name": "GATE_7_RW",
//     "mapName": "wheelchair_test",
//     "x": 335.3665450514058,
//     "y": -134.6978207649355,
//     "angle": 3.1198684019592444
//   },
//   {
//     "id": 67,
//     "name": "GATE_8_RW",
//     "mapName": "wheelchair_test",
//     "x": 339.9123299377643,
//     "y": -143.3544639794378,
//     "angle": -0.06882015326841191
//   },
//   {
//     "id": 68,
//     "name": "RW_CP",
//     "mapName": "wheelchair_test",
//     "x": 146.7444662139348,
//     "y": -134.2131332986044,
//     "angle": 3.130845632794527
//   }
// ]
// `

// const TEMP_WAYPOINTS =`
// [
//   {
//     "id": 114,
//     "name": "14",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -37.43587291827684,
//     "y": 28.17277198338033,
//     "angle": -1.595804743664003
//   },
//   {
//     "id": 139,
//     "name": "17",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -36.23567603084426,
//     "y": -16.76811757660737,
//     "angle": 3.0618068978853388
//   },
//   {
//     "id": 141,
//     "name": "26",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 10.51362190589128,
//     "y": 28.14038858424131,
//     "angle": -1.5820380774230147
//   },
//   {
//     "id": 152,
//     "name": "home",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 3.597505539289033,
//     "y": -0.5486390773065872,
//     "angle": 3.0845435627031232
//   },
//   {
//     "id": 153,
//     "name": "02",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -3.354281913154618,
//     "y": -15.38284712369229,
//     "angle": 3.050984528662125
//   },
//   {
//     "id": 155,
//     "name": "27",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 12.80007197817091,
//     "y": 21.25247968518539,
//     "angle": -3.079209611530836
//   },
//   {
//     "id": 157,
//     "name": "34",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 11.57428147064519,
//     "y": 4.543188831736702,
//     "angle": 0.006169625975020262
//   },
//   {
//     "id": 160,
//     "name": "18",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -56.26368210206162,
//     "y": -15.5382159509421,
//     "angle": 1.510028044231958
//   },
//   {
//     "id": 161,
//     "name": "20",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -54.42245744902684,
//     "y": 29.03561679274943,
//     "angle": 0
//   },
//   {
//     "id": 268,
//     "name": "33",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 15.58873722340039,
//     "y": 4.544874004516928,
//     "angle": -3.1199624943850757
//   },
//   {
//     "id": 269,
//     "name": "32",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 14.72220131667212,
//     "y": 0.678840114709559,
//     "angle": 1.5707963267948963
//   },
//   {
//     "id": 273,
//     "name": "07",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -3.445661723270981,
//     "y": -18.19215349846949,
//     "angle": 3.0890388380717786
//   },
//   {
//     "id": 274,
//     "name": "25",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -60.04138950180099,
//     "y": 31.79070529789865,
//     "angle": 0
//   },
//   {
//     "id": 277,
//     "name": "31",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 20.10678541077474,
//     "y": -0.5540560414059635,
//     "angle": -3.141592653589793
//   },
//   {
//     "id": 279,
//     "name": "08",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -24.01165335953788,
//     "y": -17.05220090107796,
//     "angle": 1.591075131287297
//   },
//   {
//     "id": 280,
//     "name": "10",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -22.0382750173214,
//     "y": 27.1224061849691,
//     "angle": 0.026645014280859382
//   },
//   {
//     "id": 281,
//     "name": "01",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -2.398572363828699,
//     "y": -0.1571666326699671,
//     "angle": -1.5707963267948963
//   },
//   {
//     "id": 282,
//     "name": "30",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 18.78917486121333,
//     "y": -16.00821857301084,
//     "angle": 1.5707963267948963
//   },
//   {
//     "id": 284,
//     "name": "15",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -33.45629285778376,
//     "y": 27.81682515859938,
//     "angle": -1.6447758002996695
//   },
//   {
//     "id": 286,
//     "name": "09",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -23.96292514687102,
//     "y": -14.26402383709486,
//     "angle": 1.5337531781478955
//   },
//   {
//     "id": 287,
//     "name": "03",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -9.003133359235525,
//     "y": -15.04325146501288,
//     "angle": 1.5707963267948963
//   },
//   {
//     "id": 288,
//     "name": "04",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -6.714332683607973,
//     "y": 26.35666515063477,
//     "angle": -0.1105955777596327
//   },
//   {
//     "id": 289,
//     "name": "05",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -1.664742751190358,
//     "y": 26.17425263230989,
//     "angle": -1.5707963267948963
//   },
//   {
//     "id": 290,
//     "name": "06",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -2.455643945001141,
//     "y": 6.291232466873897,
//     "angle": 3.0676932232539373
//   },
//   {
//     "id": 292,
//     "name": "12",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -20.71855592630144,
//     "y": -13.82120280583895,
//     "angle": -3.1082882800224225
//   },
//   {
//     "id": 293,
//     "name": "13",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -38.97007909175932,
//     "y": -13.57798920740713,
//     "angle": 1.5946143023081258
//   },
//   {
//     "id": 295,
//     "name": "19",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -56.32984215771673,
//     "y": -12.67834418180574,
//     "angle": 1.631361286253429
//   },
//   {
//     "id": 296,
//     "name": "21",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -49.2788332474428,
//     "y": 28.78774702155026,
//     "angle": -1.4939826935790221
//   },
//   {
//     "id": 297,
//     "name": "22",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -50.97524888436502,
//     "y": -13.06874458178313,
//     "angle": 3.08109543928437
//   },
//   {
//     "id": 298,
//     "name": "23",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -78.76289626536114,
//     "y": -11.92809580810321,
//     "angle": 1.5529306615556027
//   },
//   {
//     "id": 299,
//     "name": "24",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -77.76010137708137,
//     "y": 18.46611230179829,
//     "angle": 1.5475323767261964
//   },
//   {
//     "id": 300,
//     "name": "28",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": 10.153629370457,
//     "y": 25.89769996340676,
//     "angle": -3.141592653589793
//   },
//   {
//     "id": 301,
//     "name": "29",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -67.93814181066377,
//     "y": 29.93126800968565,
//     "angle": -1.6615065455169913
//   },
//   {
//     "id": 302,
//     "name": "11",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -18.90069858941527,
//     "y": 27.00093353714749,
//     "angle": -1.6195381781048286
//   },
//   {
//     "id": 304,
//     "name": "b126",
//     "mapName": "lokfu_carpark_V14032022V1",
//     "x": -35.27683082789298,
//     "y": -10.91661160463813,
//     "angle": -1.6790669176553528
//   }
// ]
// `

