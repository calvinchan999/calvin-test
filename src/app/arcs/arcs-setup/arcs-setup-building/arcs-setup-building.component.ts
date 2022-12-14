import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ColorReplaceFilter } from '@pixi/filter-color-replace';
import { DialogService } from '@progress/kendo-angular-dialog';
import { Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { DataService, DropListFloorplan, JBuilding, JSite, ShapeJData, Site } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { DrawingBoardComponent, PixiCommon, PixiPolygon, Robot } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { centroidOfPolygon as centroidOfPolygon, inside } from 'src/app/utils/math/functions';


@Component({
  selector: 'app-arcs-setup-building',
  templateUrl: './arcs-setup-building.component.html',
  styleUrls: ['./arcs-setup-building.component.scss']
})
export class ArcsSetupBuildingComponent implements OnInit {
  @ViewChild('pixi') pixiElRef : DrawingBoardComponent
  @HostBinding('class') customClass = 'setup-map'

  constructor(public uiSrv : UiService , public dataSrv : DataService, public dialogSrv: DialogService,
              public ngZone : NgZone, public httpSrv : RvHttpService, public util : GeneralUtil) { }
  frmGrp = new FormGroup({
    buildingCode : new FormControl(null , Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    siteCode : new FormControl(null),
    name :  new FormControl(null),
    modifiedDateTime: new FormControl(null),
    defaultFloorPlanCode: new FormControl(null),
    defaultPerSite : new FormControl(false),
    // defaultPlanId :new FormControl(null)
  })
  dialogRef
  parent
  parentRow
  primaryKeyColumn = 'buildingCode'
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
    if(this.site ){ // && this.site.siteCode == data.siteCode
      if(data.polygonCoordinates && data.polygonCoordinates.length > 0){
        this.pixiElRef.getBuildingPolygon(data.polygonCoordinates , {x : data.labelX , y: data.labelY} , false)
      }
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
    if(this.site && this.pixiElRef.allPixiPolygon.length == 0){
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
      let polygon = this.pixiElRef.allPixiPolygon[0]
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

  onBuildingShapeAdded(gr : PixiPolygon){
    if(this.pixiElRef?.drawingsCreated.filter(d=>d['type'] == 'polygon').length == 1){
      gr.graphicOption.opacity = 0.8
      gr.graphicOption.fillColor = new PixiCommon().mouseOverColor
      gr.alpha = 0.8
      let tagPos = centroidOfPolygon(gr.vertices)
      if(!inside(tagPos, gr.vertices)){
        tagPos = { x: (gr.vertices[0].x + gr.vertices[1].x) / 2, y: (gr.vertices[0].y + gr.vertices[1].y) / 2 }
      }
      //gr.filters = [<any>new ColorReplaceFilter(0x000000,  new PixiCommon().mouseOverColor, 1)]
      this.pixiElRef.addPixiRobotCountTagToPolygon(gr , tagPos , 0 , false) //toLocal
      gr.pixiRobotCountTag.option.fillColor = 0xffffff
      gr.pixiRobotCountTag.textColor = 0x333333
      gr.pixiRobotCountTag.option.opacity = 0.7
      gr.pixiRobotCountTag.draw()
      // this.pixiElRef.addBadgeToPolyon(gr)
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
