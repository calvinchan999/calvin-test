import { ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { filter, retry, take, takeUntil } from 'rxjs/operators';
import { DataService} from 'src/app/services/data.service';
import {  DropListBuilding, DropListLift, DropListMap, JFloorPlan, JMap, MapJData, ShapeJData } from 'src/app/services/data.models';
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
import { Observable, Subject, of } from 'rxjs';
import { PixiGraphicStyle , DRAWING_STYLE} from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import { PixiEditableMapImage, PixiZonePolygon, PixiWayPoint } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { HttpEventType } from '@angular/common/http';
import { ThreejsViewportComponent } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';
import { DEFAULT_WAYPOINT_NAME } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-viewport';
import { PixiDashedLine } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-base-graphics';


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
  @ViewChild('threeJs') threeJsElRef : ThreejsViewportComponent
  @HostBinding('class') customClass = 'setup-map'
  @ViewChild('txtUploader') txtUploader

  constructor(public util : GeneralUtil, public uiSrv : UiService , public windowSrv: DialogService, public ngZone : NgZone,
              public httpSrv : RvHttpService  , private dataSrv : DataService , public authSrv : AuthService) { 
    this.loadingTicket = this.uiSrv.loadAsyncBegin()
    this.showWaypointType = this.authSrv.hasRight("FLOORPLAN_POINT_TYPE")
  }
  frmGrp = new FormGroup({
    floorPlanCode: new FormControl('' , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    floor : new FormControl(null),
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
  dropdownData :{ maps? : DropListMap [] , buildings? : DropListBuilding[] , lifts : DropListLift[]} = {
    // sites : [],
    maps:[],
    buildings :[],
    lifts : []
    // floors:[]
  }

  dropdownOptions = {
    // sites : [],
    maps:[],
    buildings :[],
    floors : [],
    lifts : []
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
  get locationTabGraphics() {
    return (<any>this.pixiElRef.viewport.allPixiWayPoints).
      concat((<any>this.pixiElRef.viewport.allPixiPaths)).
      concat((<any>this.pixiElRef.viewport.allPixiZones)
      )
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
    this.initPixi()
  }

  initPixi(){
    this.pixiElRef.initDone$.subscribe(async () => {
      this.pixiElRef.palette.map = ['#FFCC00' ]
      this.pixiElRef.viewport.selectedStyle.polygon = { color : "#FFCC00" , opacity: 0.5 }
      if(this.util.arcsApp){
        await this.pixiElRef.module.data.initDropDown()
        this.pixiElRef.viewport.dataModule = this.pixiElRef.module.data
      }
      if (this.id) {
        await this.loadData(this.id)
        this.refreshLiftOptions()
        // setTimeout(()=>this.testResourcePost())
      } 
      this.frmGrp.controls['fileName']['uc'].textbox.input.nativeElement.disabled = true
      this.uiSrv.loadAsyncDone(this.loadingTicket)

    })
    this.pixiElRef.init()
  }


  async loadData(id , data : JFloorPlan = null){
    let ticket = this.uiSrv.loadAsyncBegin()
    data = data != null ? data : await this.httpSrv.get("api/map/plan/v1/" + id.toString())
    data.floor = data.floor?.length == 0 ? null : data.floor
    this.mapCode = data.mapList[0]?.mapCode
    this.mapTree.refreshExpandedKeys()
    await this.pixiElRef.loadDataset(data, undefined, undefined, false)
    if (this.mapCode) {
      await this.getMapsData(this.mapCode)
      await this.loadMapsToPixi(this.mapCode, false)
    }
    this.util.loadToFrmgrp(this.frmGrp ,  data);
    this.locationTabGraphics.forEach(gr=>gr.visible = this.selectedTab == 'locations');
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
      const dropdown = await this.dataSrv.getDropLists(['buildings' , 'lifts'])
      Object.keys(dropdown.data).forEach(k=>{
        this.dropdownData[k] = dropdown.data[k]
      }) 
      Object.keys(dropdown.option).forEach(k=>{
        this.dropdownOptions[k] = dropdown.option[k]
      }) 

      let floors = []
      this.dropdownData.lifts.map(l=>l.floors).forEach(fs => fs.forEach(f=> floors = floors.filter(f2=> f!=f2).concat([f])))
      this.dropdownOptions.floors = floors.sort().map(f=>{return {value : f , text : f}})

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

  refreshLiftOptions(){
    let liftsDropDownOptions = this.dataSrv.getDropListOptions('lifts' ,  this.dropdownData.lifts.filter(l=> l.floors.includes(this.frmGrp.controls['floor'].value)))
    if(this.pixiElRef){
      this.pixiElRef.module.data.dropdownOptions.lifts = liftsDropDownOptions
    }
  }


  async onPointUnselected(gr : PixiWayPoint){
    if(this._validatingWaypointName){
      return
    }
    setTimeout(async()=>{
      if(!gr.parent){
        return 
      }
      if (!await this.validateWaypointName(gr.text , gr)) {
        this.pixiElRef.viewport.mode = null      
        this.pixiElRef.viewport.selectedGraphics =  gr     
        setTimeout(()=>{
          gr.focusInput()
        })
      }
    })
    // else if(this.uiSrv.isTablet && unselect){
    //   this.pixiElRef.viewport.selectedGraphics = null
    // } 
  }

  _validatingWaypointName = false
  async validateWaypointName(code, gr : PixiWayPoint) {
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
    if(ret == false){
      this.pixiElRef.selectedGraphics = gr
    }
    this._validatingWaypointName = false
    return ret
  }

  _validatingZone = false
  async validateZone(code : string , zone : PixiZonePolygon){
    this._validatingZone = true
    zone.refreshDropDownOptions();
    let ret = true
    if (!code || code.toString().trim() == '' || this.pixiElRef.viewport.allPixiZones.filter(g => g.zoneCode == code && g != zone).length > 0) {
      await this.uiSrv.showMsgDialog(!code || code.toString().trim() == '' ? 'Please enter location name' : `Location Name Duplicated [${code}]`)
      ret = false
    } else if(!zone.robotCodes || zone.robotCodes.length == 0){
      await this.uiSrv.showMsgDialog("Please select at least 1 robot for the zone")
      ret = false
    }
    if(ret == false){
      this.pixiElRef.selectedGraphics = zone
    }
    this._validatingZone = false
    return ret
  }

  async validate() {
    let liftPoints = this.pixiElRef.viewport.allPixiWayPoints.filter(p=>p.pointType == 'LIFT');
    const nullLiftCodeLiftPoint = liftPoints.filter(p=> p.liftCode == null)[0]
    if(nullLiftCodeLiftPoint ){
      this.pixiElRef.selectedGraphics =  nullLiftCodeLiftPoint
      this.uiSrv.showMsgDialog(('Lift code not defined'))
      return false
    }
    
    const duplicateliftPoint = liftPoints.filter(p=> liftPoints.some(p2=>p2.liftCode == p.liftCode && p2 != p))[0]
    if(duplicateliftPoint ){
      this.pixiElRef.selectedGraphics =  duplicateliftPoint
      this.uiSrv.showMsgDialog(this.uiSrv.translate('Duplicate lift code : ') + duplicateliftPoint.liftCode)
      return false
    }
    
    for (let i = 0; i < this.pixiElRef.viewport.allPixiWayPoints.length ; i++) {
      if (! await this.validateWaypointName(this.pixiElRef.viewport.allPixiWayPoints[i].text, this.pixiElRef.viewport.allPixiWayPoints[i])) {
        return false
      }
    }

    for (let i = 0; i < this.pixiElRef.viewport.allPixiZones.length ; i++) {
      if (! await this.validateZone(this.pixiElRef.viewport.allPixiZones[i].zoneCode, this.pixiElRef.viewport.allPixiZones[i])) {
        return false
      }
    }

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
    let pixiMaps : PixiEditableMapImage[] = []
    for (let i = 0; i < maps.length ; i++) {
      const map = await this.pixiElRef.loadMap(maps[i])
      pixiMaps.push(map)      
      map.events.selected.pipe(takeUntil(map.events.removed)).subscribe(()=>{ //Resize All ROS 
        this.pixiElRef.viewport.events.zoomed.next(true)
        map.events.resizing.pipe(takeUntil(map.events.unselected)).subscribe(()=>{
          if(this.pixiElRef.module.ui.toggle.showGridLine){
            this.pixiElRef.module.ui.gridLine.refreshScale()
          }
          pixiMaps.filter(m=>m!=map && m.ROS?.alpha > 0).forEach(m=>{
            let scale = map.scale.x * (map.dataObj?.resolution ? map.dataObj?.resolution : 0.05 )/(m.dataObj?.resolution ? m.dataObj?.resolution : 0.05)
            m.scale.set(scale , scale)
          })
        })
      })

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
  
  async selectedTabChanged(evt) {
    if (evt == this.selectedTab) {
      return
    } else {
      this.selectedTab = this.tabs[evt]
    }

    this.pixiElRef.viewport.selectedGraphics = null
    this.pixiElRef.hideButton = this.selectedTab == 'maps' || this.readonly ? { all: true } : { polygon: this.util.standaloneApp , brush: true, line: true, export: true };
    this.mapTree.data.filter(m => this.mapCode == m.mapCode).forEach(m => {
      m.robotBases.forEach(b => this.toggleMapVisibility(<DropListMap>b, this.selectedTab == 'maps'))
    });
    // Object.values(this.pixiElRef.viewport.mapLayerStore).filter((v : PixiMapLayer) => v && v.ROS).forEach((c: PixiMapLayer) =>{
    //   c.interactive =  this.selectedTab == 'maps'
    //   c.ROS.alpha = this.selectedTab == 'maps' ? 0.5 : 0
    // });
    this.locationTabGraphics.forEach(gr => gr.visible = this.selectedTab == 'locations')
    if (this.selectedTab == 'maps') {
      this.pixiMapBorders.forEach(g => g.parent.removeChild(g))
      this.pixiMapBorders = []
      this.pixiElRef.viewport.selectedGraphics = this.selectedPixiShape ? this.selectedPixiShape : Object.values(this.pixiElRef.viewport.mapLayerStore)[0]

      Object.values(this.pixiElRef.viewport.mapLayerStore).forEach((m: PixiEditableMapImage) => {
        m.interactive = true
        // if(m.border){
        //   m.border.visible = true
        // }
      })
    } else if (this.selectedTab == 'locations') {
      this.renderMapBordersOnPixi()
      Object.values(this.pixiElRef.viewport.mapLayerStore).forEach((m: PixiEditableMapImage) => {
        m.interactive = false
        if (m.border) {
          m.border.visible = false
        }
      })
      this.pixiElRef.module.ui.toggleRosMap(this.pixiElRef.module.ui.toggle.showRosMap)
      // Object.values(this.pixiElRef.viewport.mapLayerStore).forEach(m=>{     
      //   this.pixiElRef.viewport.allPixiZones.forEach(z=>{
      //     let pointList = []
      //     z.vertices.forEach(v=>{
      //       let pos : PIXI.Point =  this.pixiElRef.viewport.mainContainer.toGlobal(new PIXI.Point(v.x , v.y))
      //       pointList.push({
      //         x: m.calculateRosPosition(pos).x,
      //         y: m.calculateRosPosition(pos).y
      //       })
      //     })
      //     console.log(JSON.stringify({
      //       mapCode: m.mapCode,
      //       robotBase : m.robotBase,
      //       zoneCode : z.zoneCode,
      //       points : pointList
      //     }))
      //   })
      // })
    }

    // this.pixiElRef.toggleRosMap(false)

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
    this.pixiElRef.viewport.allPixiWayPoints.forEach(p=> {
      var toggledRobotBases = this.mapTree.data.filter(d=>d.mapCode == this.mapCode)[0]?.robotBases?.filter(b=>!b['hidden']).map(b=> b.robotBase)
      p.alpha =  p.robotBases.length > 0 && p.robotBases.some(b=>toggledRobotBases.length == 0 || toggledRobotBases.includes(b)) && p.enabled ? 1 : 0.4
    })
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

  async getPoseAndAddWaypoint_SA() {
    let resp: { x: number, y: number, angle: number, mapName: string } = await this.httpSrv.fmsRequest('GET', 'localization/v1/pose', undefined, false)
    if (this.mapCode != resp.mapName) {
      this.uiSrv.showMsgDialog('Current map not match with selected map')
    } else if (this.pixiElRef) {
      let map: PixiEditableMapImage = this.pixiElRef.viewport.mapLayerStore[this.mapCode]
      let mapPosition = { x: map.calculateMapX(resp.x), y: map.calculateMapY(resp.y) }
      let position = this.pixiElRef.mainContainer.toLocal(this.pixiElRef.viewport.mapLayerStore[this.mapCode].toGlobal(new PIXI.Point(mapPosition.x, mapPosition.y)))
      //new PixiWayPoint(this.pixiElRef.viewport , undefined , new PixiGraphicStyle() , true)
      let names = [DEFAULT_WAYPOINT_NAME].concat(Array.from(Array(this.pixiElRef.viewport.allPixiWayPoints.length).keys()).map(k => `${DEFAULT_WAYPOINT_NAME}-${k + 1}`))
      let newPtName = names.filter(n => !this.pixiElRef.viewport.allPixiWayPoints.map(p => p.text).some(t => t == n))[0]
      let pixiWp = new PixiWayPoint(this.pixiElRef.viewport, newPtName, new PixiGraphicStyle(), this.pixiElRef.viewport.settings.waypointEditable)
      pixiWp.position.set(position.x, position.y)
      this.pixiElRef.viewport.mainContainer.addChild(pixiWp)
      if (pixiWp.angleIndicator) {
        let angle = 90 - resp.angle * radRatio + this.pixiElRef.viewport.mapLayerStore[resp.mapName].angle
        pixiWp.angleIndicator.angle = trimAngle(angle)
      }
      this.pixiElRef.viewport.mode = null
      this.pixiElRef.viewport.selectedGraphics = pixiWp
      pixiWp.focusInput()
    }
  }

  exportDatasetAsTextFile(){
    const blob = new Blob([JSON.stringify(this.getSubmitDataset())], { type: 'text/txt' });
    var url = window.URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.download = this.frmGrp.controls['floorPlanCode'].value + ".txt";
    anchor.href = url;
    anchor.click();
  }

  onImportClicked(){
    this.txtUploader.nativeElement.click()
  }

  importDatasetFromTextFile(event){
    const files = event.target.files;
    if (files.length === 0) {
      return;
    }
    let ticket = this.uiSrv.loadAsyncBegin()
    var reader = new FileReader();
    reader.readAsText(files[0]);
    reader.onload = async (_event) => {
      let text = reader.result;
      let data : JFloorPlan
      try{
        data = JSON.parse(text?.toString())
      }catch{
        this.uiSrv.showWarningDialog('The format of the imported file is invalid (Invalid JSON)')
        return
      }


      if(data.mapList!=null && Array.isArray(data.mapList) && data.mapList.length > 0){
        data.mapList = data.mapList.slice(0, 1)
        if (this.dropdownData.maps.filter((m: DropListMap) => m.floorPlanCode == null && m.mapCode == data.mapList[0].mapCode).length == 0) {
          let msg = this.uiSrv.translate('The floor plan image and waypoints are imported sucessfully but the selected map code ($MAP_CODE) is not available.')
          msg = msg.replace('$MAP_CODE', data.mapList[0]?.mapCode)
          data.mapList = []
          this.uiSrv.showWarningDialog(msg)
        }              
      }

      this.loadData(null , data)

      this.uiSrv.loadAsyncDone(ticket)
      
      event.target.value = null
    }
  }

  


  // add_UserTrainingWaypoint(name , x , y , rad){ //for HKAA user training only
  //     let map : PixiEditableMapImage = <any>Object.values(this.pixiElRef.viewport.mapLayerStore)[0]
  //     // let origin = this.pixiElRef.getGuiOrigin(map)
  //     let mapPosition = { x: map.calculateMapX(x), y: map.calculateMapY(y) }
  //     let position = this.pixiElRef.mainContainer.toLocal((<any>map).toGlobal(mapPosition))
  //     let pixiWp = new PixiWayPoint(this.pixiElRef.viewport , undefined , new PixiGraphicStyle() , true)
  //     this.pixiElRef.viewport.mainContainer.addChild(pixiWp)
  //     pixiWp.position.set(position.x , position.y)
  //     if(pixiWp.angleIndicator){
  //       let angle = 90 - rad * 57.2958 + map.angle
  //       pixiWp.angleIndicator.angle = trimAngle(angle)
  //     }
  //     pixiWp.text = name
  //     this.pixiElRef.viewport.mode = null
  //     this.pixiElRef.viewport.selectedGraphics = pixiWp
  //   // this.pixiElRef.onWayPointMouseDown(gr)
  // }

}
