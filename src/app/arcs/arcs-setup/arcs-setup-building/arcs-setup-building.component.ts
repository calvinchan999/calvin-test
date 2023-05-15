import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ColorReplaceFilter } from '@pixi/filter-color-replace';
import { DialogService } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { DropListFloorplan, JBuilding, JSite, ShapeJData, Site } from 'src/app/services/data.models';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent,  Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { centroidOfPolygon as centroidOfPolygon, inside } from 'src/app/utils/math/functions';
import { PixiBuildingPolygon } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-map-graphics';
import { DRAWING_STYLE } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-styling-util';
import * as PIXI from 'pixi.js';


@Component({
  selector: 'app-arcs-setup-building',
  templateUrl: './arcs-setup-building.component.html',
  styleUrls: ['./arcs-setup-building.component.scss']
})
export class ArcsSetupBuildingComponent implements OnInit {
  @ViewChild('pixi') pixiElRef : Map2DViewportComponent
  @HostBinding('class') customClass = 'setup-map'

  constructor(public uiSrv : UiService , public dataSrv : DataService, public dialogSrv: DialogService,
              public ngZone : NgZone, public httpSrv : RvHttpService, public util : GeneralUtil) { }
  frmGrp = new FormGroup({
    buildingCode : new FormControl(null , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    siteCode : new FormControl(null),
    name :  new FormControl(''),
    modifiedDateTime: new FormControl(null),
    defaultFloorPlanCode: new FormControl(null),
    defaultPerSite : new FormControl(false),
    // defaultPlanId :new FormControl(null)
  })
  dialogRef
  parent
  parentRow
  primaryKeyColumn = 'buildingCode'
  readonly = false
  // dropdownData = {
  //   sites : [],
  //   floorplans:[]
  // }

  $onDestroy = new Subject()

  dropdownData : { sites : any[] , floorplans : DropListFloorplan[]} = {
    sites: [],
    floorplans: []
  }
  dropdownOptions = {
    sites: [],
    floorplans: []
  }
  defaultFloorPlan
  site : JSite
  uploadSiteMsg = `Please setup site map to display the building if it is not set as 'Default Building' `

  ngOnInit() {

  }
  
  async ngAfterViewInit() {
    let ticket = this.uiSrv.loadAsyncBegin()
    await this.initDropDown()
    await this.loadSite()
    if(this.parentRow){
      this.loadData(this.parentRow[this.primaryKeyColumn])
    }else{
      this.dropdownData.floorplans = this.dropdownData.floorplans.filter((fp:DropListFloorplan)=> fp.buildingCode == null)
    }
    this.uiSrv.loadAsyncDone(ticket)
    // this.subscriptions.push(this.windowRef.window.instance.close.subscribe(()=>this.onClose()))
  }
  
  async loadSite(){
    this.site  = await this.dataSrv.getSite(true)
    if(!this.site){
      return
    }
    await this.pixiElRef.loadToMainContainer( this.site.base64Image )
    this.setViewportCamera()
  }
  
  async initDropDown(){
    let floorPlanDropList = await this.httpSrv.get('api/map/plan/droplist/v1')
    this.dropdownData.floorplans = floorPlanDropList
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  
  async loadData(code : string){
    let ticket = this.uiSrv.loadAsyncBegin()
    let data : JBuilding = await this.httpSrv.get('api/building/v1/' + code)
    let getDataItem = (floorplan : DropListFloorplan, selected : boolean)=> {
      let ret = JSON.parse(JSON.stringify(floorplan))
      ret['selected'] = selected
      return ret
    }
    this.dropdownData.floorplans = this.dropdownData.floorplans.filter(fp => data['floorPlanCodeList'].includes(fp.floorPlanCode)).map(fp => getDataItem(fp, true)).concat(
                                    this.dropdownData.floorplans.filter(fp => fp.buildingCode == null).map(fp => getDataItem(fp, false))
                                   )
    this.refreshFloorPlanOptions()
    this.util.loadToFrmgrp(this.frmGrp , data)
    if (this.site && data.polygonCoordinates && data.polygonCoordinates.length > 0) { // && this.site.siteCode == data.siteCode
      let polygon = new PixiBuildingPolygon(this.pixiElRef.viewport, data.polygonCoordinates.map(c => new PIXI.Point(c.x, c.y)))
      polygon.buildingCode = `${data.buildingCode}`
      polygon.buildingName = `${data.name}`
      polygon.setTagPosition(new PIXI.Point(data.labelX, data.labelY))
      polygon.readonly = this.readonly
      this.pixiElRef.viewport.mainContainer.addChild(polygon)
      this.pixiElRef.viewport.createdGraphics.polygon.push(polygon)
      this.pixiElRef.viewport.selectedGraphics = polygon
    }
    this.setViewportCamera()
    this.uiSrv.loadAsyncDone(ticket)
  }

  setViewportCamera(){
    if(this.site ){
      this.pixiElRef.defaultPos = {
        x: this.site.viewX,
        y: this.site.viewY,
        zoom: this.site.viewZoom
      }
      this.pixiElRef.setViewportCamera( this.pixiElRef.defaultPos.x ,  this.pixiElRef.defaultPos.y  , this.pixiElRef.defaultPos.zoom)
    }
  }

  refreshFloorPlanOptions() {
    this.dropdownOptions.floorplans = this.dropdownData.floorplans.filter(fp => fp['selected']).map((fp: DropListFloorplan) => {
      return {
        text: fp.name,
        value: fp.floorPlanCode
      }
    })
    if (!this.dropdownOptions.floorplans.map(o => o.value).includes(this.frmGrp.controls['defaultFloorPlanCode'].value)) {
      this.frmGrp.controls['defaultFloorPlanCode'].setValue(this.dropdownOptions.floorplans[0]?.value)
    }
  }
  
  async validate() {
    if(this.site && this.pixiElRef.viewport.allPixiPolygons.length == 0){
      this.uiSrv.showMsgDialog("Please specify the location of the building on the site map")
      return false
    }
    return this.util.validateFrmGrp(this.frmGrp)
  }

  async getSubmitDataset(){
    let ret = new JBuilding()
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    ret.floorPlanCodeList = this.dropdownData.floorplans.filter(fp=>fp['selected']).map((fp:DropListFloorplan)=>fp.floorPlanCode)
    if(this.site){
      let polygon = this.pixiElRef.viewport.allPixiPolygons[0]
      ret.siteCode = this.site.siteCode
      ret.polygonCoordinates = polygon?.vertices.map(v=>{return { x : polygon.position.x + v.x , y:  polygon.position.y + v.y }})
      ret.labelX = this.util.trimNum(polygon.position.x  + polygon?.pixiRobotCountTag.position.x, 0)
      ret.labelY = this.util.trimNum(polygon.position.y  + polygon?.pixiRobotCountTag.position.y, 0)
    }
    return ret
  }

  async onClose(){
    if(await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.dialogRef.close()
    }
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    if((await this.dataSrv.saveRecord("api/building/v1", await this.getSubmitDataset() , this.frmGrp , !this.parentRow)).result){      
      this.dialogRef.close()
    }
  }
  
}


// selectedPlansChanged(setFirstVal = true){
//   this.dropdownOptions.floorplans = this.dropdownData.floorplans.filter((p:DropListFloorplan) => this.selectedPlanIds.includes(p.floorPlanCode)).
//                                                                  map((p:DropListFloorplan)=> {return{value : p.floorPlanCode, text: p.name}})
//   let keepVal = this.frmGrp.controls['defaultPlanId'].value && this.dropdownOptions.floorplans.map(p=>p.planId).includes(this.frmGrp.controls['defaultPlanId'].value)
//   this.frmGrp.controls['defaultPlanId'].setValue(keepVal || !setFirstVal ? this.frmGrp.controls['defaultPlanId'].value : this.dropdownOptions.floorplans[0]?.value)
// }

// async onSiteChange(){
//   if(this.frmGrp.controls['parentLocationId'].value){
//     let ticket = this.uiSrv.loadAsyncBegin()
//     let siteData : Site = await this.httpSrv.get('api/locations/site/v1/' + this.frmGrp.controls['parentLocationId'].value)
//     await this.pixiElRef.loadToMainContainer(siteData.imgSrc)
//     this.pixiElRef.defaultPos = {
//       x: siteData.defaultX,
//       y: siteData.defaultY,
//       zoom : siteData.defaultZoom,
//     }
//     this.pixiElRef.setViewportCamera( this.pixiElRef.defaultPos.x ,  this.pixiElRef.defaultPos.y  , this.pixiElRef.defaultPos.zoom)
//     this.uiSrv.loadAsyncDone(ticket)
//   }
// } 

// refreshSelectedPlans(id , checked){
//   this.selectedPlanIds = this.selectedPlanIds.filter(p=>checked? true : p!=id).concat(checked ? [id] : [])
// }
