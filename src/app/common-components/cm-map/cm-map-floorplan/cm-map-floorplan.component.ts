import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { filter, retry, take } from 'rxjs/operators';
import { DataService, DropListBuilding, DropListMap, JFloorPlan, JMap, MapJData, ShapeJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, GraphicOptions, PixiCommon, PixiLocPoint, PixiMapLayer, radRatio} from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import * as PIXI from 'pixi.js';
import { TabStripComponent } from '@progress/kendo-angular-layout';
import { AuthService } from 'src/app/services/auth.service';
import { SaMapComponent } from 'src/app/standalone/sa-map/sa-map.component';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';
import { trimAngle } from 'src/app/utils/math/functions';
import { Observable, of } from 'rxjs';

@Component({
  selector: 'app-cm-map-floorplan',
  templateUrl: './cm-map-floorplan.component.html',
  styleUrls: ['./cm-map-floorplan.component.scss']
})
export class CmMapFloorplanComponent implements OnInit {
  readonly = false
  @ViewChild('pixi') pixiElRef : DrawingBoardComponent
  @ViewChild('pixiContainer') pixiContainer : ElementRef
  @ViewChild('container') mainContainer : ElementRef
  @ViewChild('tabStrip') tabStripRef : TabStripComponent
  
  constructor(public util : GeneralUtil, public uiSrv : UiService , public windowSrv: DialogService, public ngZone : NgZone,
              public httpSrv : RvHttpService  , private dataSrv : DataService , public authSrv : AuthService) { 
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
  }
  frmGrp = new FormGroup({
    planId: new FormControl(null),
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
    this.mapCode = data.mapList[0]?.mapCode
    this.mapTree.refreshExpandedKeys()
    await this.pixiElRef.loadFloorPlanDatasetV2(data , undefined , undefined , false)
    this.mapsStore.set(this.mapCode , JSON.parse(JSON.stringify(data.mapList)))
    for (let i = 0; i < data.mapList.length; i++) {
      let pixiMap = await this.pixiElRef.loadMapV2(data.mapList[i])
      if (!this.readonly && i == data.mapList.length - 1) {
        this.pixiElRef.selectGraphics(pixiMap)
      }
    } 
    this.util.loadToFrmgrp(this.frmGrp ,  data);
    (<any>this.pixiElRef.allPixiPoints).concat((<any>this.pixiElRef.allPixiArrows)).forEach(gr=>gr.visible = this.selectedTab == 'locations');
    // (<any>this.pixiElRef.allPixiPoints).concat((<any>this.pixiElRef.allPixiArrows)).forEach(gr=>this.pixiElRef.removeGraphics(gr))
    this.uiSrv.loadAsyncDone(ticket);
    // JSON.parse(HKAA_WAYPOINTS0815).forEach(w => {
    //   this.add_UserTrainingWaypoint(w['name'], w['x'], w['y'], w['angle'])
    // })
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
    this.dropdownData.maps = <any>(await this.dataSrv.getDropList('maps')).data.filter((m : DropListMap ) => !m.floorPlanCode  || m.floorPlanCode == this.code)
    this.dropdownOptions.maps = this.dataSrv.getDropListOptions('maps',this.dropdownData.maps) 
    if(this.util.arcsApp){
      let buildingDDL = await this.dataSrv.getDropList('buildings')
      this.dropdownData.buildings = <any>buildingDDL.data
      this.dropdownOptions.buildings = buildingDDL.options
      
      let tmpObj = this.util.getGroupedListsObject(this.dropdownData.maps , 'mapCode') 
      this.mapTree.data = Object.keys(tmpObj).map(k=>{
        return {
          mapCode : k,
          name :  k,
          robotBases : tmpObj[k].map((v :DropListMap)=>{return {robotBase: v.robotBase ,  name : `[${v.robotBase}] ${v.name}` , mapCode : v.mapCode }})
        }
      })
    }
    this.uiSrv.loadAsyncDone(ticket)
  }

  async onPointUpsert(evt , unselect = true) {
    if(this._validatingWaypointName){
      return
    }
    let gr = evt.graphics
    if (!await this.validateWaypointName(evt.id , gr)) {
      if(!this.uiSrv.isTablet){
        this.pixiElRef.endDraw()
        this.pixiElRef.endEdit()
        this.pixiElRef.selectGraphics(gr)
        // gr.detailButton.visible = false
        gr.input.disabled = false
        gr.input.focus()
        // setTimeout(() => gr.detailButton.visible = false);
      }else{
        this.pixiElRef.selectGraphics(evt.graphics)
        this.pixiElRef.ucPointTextBox.focusTextbox()
      }
    }else if(this.uiSrv.isTablet && unselect){
      this.pixiElRef.selectGraphics(null)
    } 
  }

  onPointUnselected(evt){
    this.onPointUpsert(evt , false)
  }

  _validatingWaypointName = false
  async validateWaypointName(code, gr) {
    this._validatingWaypointName = true
    let ret = true
    if (!code || code.toString().trim() == '' || this.pixiElRef.allPixiPoints.filter(g => g.code == code && g != gr).length > 0) {
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
    for (let i = 0; i < this.pixiElRef.allPixiPoints.length ; i++) {
      if (! await this.validateWaypointName(this.pixiElRef.allPixiPoints[i].text, this.pixiElRef.allPixiPoints[i])) {
        return false
      }
    }
    // let outOfBoundShapes = this.pixiElRef.getSubmitDataset().outOfBoundShapes
    let ds = this.pixiElRef.getSubmitDatasetV2()
    let outOfBoundShapesV2 = {}
    ds.mapList.forEach(m=>{
      outOfBoundShapesV2[m.robotBase] = ds.pointList.filter(p=>!m.pointList.map(mp=>mp.pointCode).includes(p.pointCode))
    })
    var invalidRobotBase = Object.keys(outOfBoundShapesV2).filter(k=>(<any> outOfBoundShapesV2[k]).length > 0)[0] 
    if(this.mapCode && invalidRobotBase){
      this.uiSrv.showMsgDialog(
        this.uiSrv.translate('Way point [point] out of bound for robot base [robotBase]')
        .replace('[point]' , outOfBoundShapesV2[invalidRobotBase][0].pointCode)
        .replace('[robotBase]',invalidRobotBase)
      )
      // this.changeTab('locations')
    }
    return !this.mapCode || !invalidRobotBase 
  }

  getSubmitDataset() {
    let ret = new JFloorPlan();
    let pixiDs = this.pixiElRef.getSubmitDatasetV2(this.frmGrp.controls['floorPlanCode'].value)
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
      for (let i = 0; i < this.mapsStore.get(this.mapCode)?.length ; i++) {
        var map = await this.pixiElRef.loadMapV2(this.mapsStore.get(this.mapCode)[i])
        // if (i == this.mapsStore.get(this.mapCode).length - 1) {
        //   this.pixiElRef.selectGraphics(map)
        // }
      }
      setTimeout(()=>this.pixiElRef.selectGraphics(map))
    }   
    await this.changeTab(originalTab)
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

  refreshSelectedShape(dataItem : DropListMap){
    if(this.selectedTab == 'maps' &&  dataItem?.robotBase && this.pixiElRef.mapLayerStore[dataItem?.robotBase]){
      this.pixiElRef.selectGraphics(this.pixiElRef.mapLayerStore[dataItem?.robotBase] )
      this.selectedPixiShape = this.pixiElRef.mapLayerStore[dataItem?.robotBase] 
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
    this.pixiElRef.selectGraphics(null)
    this.pixiElRef.hideButton =  this.selectedTab == 'maps' || this.readonly? {all : true} : { polygon : true , brush : true , line : true , export : true};
    this.mapTree.data.filter(m=>this.mapCode == m.mapCode).forEach(m=>{
      m.robotBases.forEach(b => this.toggleMapVisibility(<DropListMap>b, this.selectedTab == 'maps'))
    });
    // Object.values(this.pixiElRef.mapLayerStore).filter((v : PixiMapLayer) => v && v.ROS).forEach((c: PixiMapLayer) =>{
    //   c.interactive =  this.selectedTab == 'maps'
    //   c.ROS.alpha = this.selectedTab == 'maps' ? 0.5 : 0
    // });
    (<any>this.pixiElRef.allPixiPoints).concat((<any>this.pixiElRef.allPixiArrows)).forEach(gr=>gr.visible = this.selectedTab == 'locations')
    if(this.selectedTab == 'maps'){
      this.pixiMapBorders.forEach(g=>g.parent.removeChild(g))
      this.pixiMapBorders = []
      if(this.mapCode){
        this.pixiElRef.selectGraphics(this.pixiElRef.mapLayerStore[this.mapCode])
      }
    }else if(this.selectedTab == 'locations'){
      this.renderMapBordersOnPixi()
    }
  }

  toggleMapVisibility(item : DropListMap , visible = undefined){
    let pixiMap : PixiMapLayer = this.pixiElRef?.mapLayerStore[item.robotBase]
    if(pixiMap){
      let originalVisible = pixiMap.ROS.alpha;
      visible = visible === undefined ? !originalVisible : visible
      if(originalVisible && this.pixiElRef?.selectedGraphics == pixiMap){
        this.pixiElRef.selectGraphics(null)
      }
      pixiMap.ROS.alpha = visible ? 0.5 : 0
      pixiMap.interactive = this.selectedTab == 'maps' && visible
    }
    item['hidden'] = !visible
  }

  renderMapBordersOnPixi(){
    this.pixiMapBorders.forEach(g=>g.parent.removeChild(g))
    this.pixiMapBorders = []
    Object.values(this.pixiElRef.mapLayerStore).forEach((m:PixiMapLayer)=>{
      let border = new PIXI.Graphics()
      this.pixiMapBorders.push(border)
      border.position.set(m.position.x , m.position.y)
      border.pivot.set(m.pivot.x , m.pivot.y)
      border.angle = m.angle
      border.scale.set(m.scale.x , m.scale.y);
      let pts = [[0,0] , [m.width / m.scale.x , 0] , [m.width / m.scale.x , m.height / m.scale.y] , [0 , m.height / m.scale.y]]
      let opt = new GraphicOptions(border, undefined, undefined, undefined, undefined, new PixiCommon().mouseOverColor )
      new PixiCommon().getLines(pts.map(p=>new PIXI.Point(p[0] , p[1])) , opt , true , this.pixiElRef , m)
      this.pixiElRef.mainContainer.addChild(border)
    })  
  }

  async getPoseAndAddWaypoint_SA(){
    let resp: { x: number, y: number, angle : number , mapName: string } = await this.httpSrv.rvRequest('GET', 'localization/v1/pose', undefined, false)
    if (this.mapCode != resp.mapName) {
      this.uiSrv.showMsgDialog('Current map not match with selected map')
    } else if (this.pixiElRef) {
      let map : PixiMapLayer = this.pixiElRef.mapLayerStore[this.mapCode]
      let mapPosition = { x: this.pixiElRef.calculateMapX(resp.x, map.guiOriginX), y: this.pixiElRef.calculateMapY(resp.y, map.guiOriginY) }
      let position = this.pixiElRef.mainContainer.toLocal(this.pixiElRef.mapLayerStore[this.mapCode].toGlobal(mapPosition))
      let gr = this.pixiElRef.createWayPoint(position.x, position.y)
      if(gr.angleIndicator){
        let angle = 90 - resp.angle * radRatio + this.pixiElRef.mapLayerStore[resp.mapName].angle
        gr.angleIndicator.angle = trimAngle(angle)
      }
      this.pixiElRef.endDraw()
      this.pixiElRef.selectGraphics(gr)
      this.pixiElRef.onWayPointMouseDown(gr)
    }    
  }

  add_UserTrainingWaypoint(name , x , y , rad){ //for HKAA user training only
      let map : PixiMapLayer = <any>Object.values(this.pixiElRef.mapLayerStore)[0]
      let origin = this.pixiElRef.getGuiOrigin(map)
      let mapPosition = { x: this.pixiElRef.calculateMapX(x, origin[0]), y: this.pixiElRef.calculateMapY(y, origin[1]) }
      let position = this.pixiElRef.mainContainer.toLocal((<any>map).toGlobal(mapPosition))
      let gr = this.pixiElRef.createWayPoint(position.x, position.y)
      if(gr.angleIndicator){
        let angle = 90 - rad * 57.2958 + map.angle
        gr.angleIndicator.angle = trimAngle(angle)
      }
      gr.text = name
      this.pixiElRef.endDraw()
      this.pixiElRef.selectGraphics(gr)
    // this.pixiElRef.onWayPointMouseDown(gr)
  }

  // async getRvRequestBody_SA() {
  //   let ds = this.getSubmitDataset()
  //   let mapId = this.selectedMapIds[0]
  //   if(!mapId){
  //     return {}
  //   }
  //   let mapName = this.dropdownData.maps.filter((m:DropListMap)=>m.mapId == mapId)[0]?.mapCode
  //   this.pixiElRef.mapContainerStore[mapId.toString()] = this.pixiElRef.mapContainerStore[mapId.toString()] ? this.pixiElRef.mapContainerStore[mapId.toString()] : {}
  //   this.pixiElRef.mapContainerStore[mapId.toString()]['RV_originX'] = this.mapDetailsObj[mapId.toString()]?.['originX']
  //   this.pixiElRef.mapContainerStore[mapId.toString()]['RV_originY'] = this.mapDetailsObj[mapId.toString()]?.['originY']
  //   let ret = {
  //     mapName: mapName,
  //     locationList: ds.maps[0]? ds.maps[0].shapes.filter((s: ShapeJData) => this.pixiElRef.pointTypes.includes(s.shapeType)).map((s: ShapeJData) => {
  //       return {
  //         name: s.shapeCode,
  //         mapName: mapName,
  //         x: this.pixiElRef.calculateRosX(s.posX, mapId),
  //         y: this.pixiElRef.calculateRosY(s.posY, mapId),
  //         angle: (90 - s.rotation) / 57.2958
  //       }
  //     }) : [],
  //     pathList: []
  //   }

  //   let locations = JSON.parse(JSON.stringify(ret.locationList))
  //   let getPath =(s: ShapeJData)=>{
  //     let vertices = JSON.parse(s.vertices)
  //     let midpt = {x: (vertices[0].x + vertices[3].x) / 2 , y : (vertices[0].y + vertices[3].y) / 2}
  //     vertices = ['arrow', 'arrow_bi'].includes(s.shapeType) ? 
  //                [vertices[0], midpt, midpt, vertices[3]] :
  //                [vertices[0] , vertices[1] , vertices[2] , vertices[3]]
  //     return {
  //       direction: s.pathDirection?.toUpperCase(),
  //       velocityLimit: s.pathVelocity,
  //       beginLocation: locations.filter(l => l.name == s.fromCode)[0],
  //       endLocation: locations.filter(l => l.name == s.toCode)[0],
  //       controlPointList: vertices.map(v => { return { x: this.pixiElRef.calculateRosX(v.x, mapId), y: this.pixiElRef.calculateRosY(v.y, mapId) } })
  //     }
  //   }
  //   ret.pathList = ds.maps[0]? ds.maps[0].shapes.filter((s: ShapeJData) => this.pixiElRef.arrowTypes.includes(s.shapeType)).map((s: ShapeJData) => getPath(s)) : []
  //   let twoDirPathJdata = ds.maps[0]? ds.maps[0].shapes.filter((s:ShapeJData)=>s.shapeType == 'arrow_bi' || s.shapeType == 'arrow_bi_curved') : []
  //   twoDirPathJdata.forEach(s => {
  //     let tmp = s.fromCode
  //     let verts = JSON.parse(s.vertices)
  //     s.fromCode = s.toCode
  //     s.toCode = tmp
  //     s.vertices = JSON.stringify([verts[3],verts[2],verts[1],verts[0]])
  //   });
  //   ret.pathList = ret.pathList.concat(twoDirPathJdata.map(s=>getPath(s)))
  //   //await this.http.rvRequest('POST','resource/v1',ret)
  //   return [ret]
  // }
}

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

const HKAA_WAYPOINTS0815 = `
[
  {
    "id": 29,
    "name": "G11",
    "mapName": "wheelchair_test",
    "x": 2.277091715566764,
    "y": 15.65223147428205,
    "angle": -3.1191367868158886
  },
  {
    "id": 30,
    "name": "A_CHARGE_G11",
    "mapName": "wheelchair_test",
    "x": -1.428741305931726,
    "y": -1.407506391759312,
    "angle": 3.136669274182967
  },
  {
    "id": 31,
    "name": "G10",
    "mapName": "wheelchair_test",
    "x": 21.10226489448139,
    "y": 12.69737443280037,
    "angle": 0
  },
  {
    "id": 39,
    "name": "EXIT_G5-9",
    "mapName": "wheelchair_test",
    "x": 135.3471561085639,
    "y": -134.3599013532761,
    "angle": 1.5441250890796663
  },
  {
    "id": 40,
    "name": "G9",
    "mapName": "wheelchair_test",
    "x": 340.8364932998956,
    "y": -159.6335726466058,
    "angle": 1.6071640552433968
  },
  {
    "id": 52,
    "name": "EXIT_G1-4",
    "mapName": "wheelchair_test",
    "x": -115.2436837763202,
    "y": -129.7258915381139,
    "angle": 3.084541869926043
  },
  {
    "id": 54,
    "name": "G1",
    "mapName": "wheelchair_test",
    "x": -176.7275134930203,
    "y": -121.2739184321057,
    "angle": 0
  },
  {
    "id": 55,
    "name": "G2",
    "mapName": "wheelchair_test",
    "x": -247.3843866880411,
    "y": -120.6764919162144,
    "angle": 0.011759207948191297
  },
  {
    "id": 56,
    "name": "G3",
    "mapName": "wheelchair_test",
    "x": -321.2844591278919,
    "y": -121.4431106782647,
    "angle": 0.014278739132463912
  },
  {
    "id": 63,
    "name": "G5",
    "mapName": "wheelchair_test",
    "x": 169.784465946906,
    "y": -127.7465675128748,
    "angle": 3.1211981926288925
  },
  {
    "id": 65,
    "name": "G6",
    "mapName": "wheelchair_test",
    "x": 263.0616206293278,
    "y": -130.1215055289816,
    "angle": 3.1073776003801497
  },
  {
    "id": 66,
    "name": "G7",
    "mapName": "wheelchair_test",
    "x": 335.3665450514058,
    "y": -134.6978207649355,
    "angle": 3.1198684019592444
  },
  {
    "id": 68,
    "name": "EXIT_G5-9_CP",
    "mapName": "wheelchair_test",
    "x": 146.7444662139348,
    "y": -134.2131332986044,
    "angle": 3.130845632794527
  },
  {
    "id": 71,
    "name": "G8",
    "mapName": "wheelchair_test",
    "x": 345.145664366333,
    "y": -148.5016041003712,
    "angle": 1.5220260017624292
  },
  {
    "id": 72,
    "name": "A_LOCAL_G11",
    "mapName": "wheelchair_test",
    "x": 1.848835301847525,
    "y": 5.034701210163385,
    "angle": -0.03028102384545962
  },
  {
    "id": 74,
    "name": "G4",
    "mapName": "wheelchair_test",
    "x": -321.9313016922606,
    "y": -150.4029724542821,
    "angle": 1.5707963267948963
  }
]
`

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
