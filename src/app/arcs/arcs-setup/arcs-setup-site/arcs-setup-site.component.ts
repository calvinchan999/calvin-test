import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild , HostBinding } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogService } from '@progress/kendo-angular-dialog';
import { filter, take } from 'rxjs/operators';
import { DataService, ShapeJData } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent, Robot } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';

type SiteDataSet = {
  siteCode : string
  base64Image : string
  viewX : number
  viewY : number
  viewZoom : number
  fileName? : string
  modifiedDate? : Date
}

@Component({
  selector: 'app-arcs-setup-site',
  templateUrl: './arcs-setup-site.component.html',
  styleUrls: ['./arcs-setup-site.component.scss']
})
export class ArcsSetupSiteComponent implements OnInit {
  @ViewChild('pixi') pixiElRef : Map2DViewportComponent
  @HostBinding('class') customClass = 'setup-map'
  
  constructor(public uiSrv : UiService , public dataSrv: DataService, public dialogSrv: DialogService, public ngZone : NgZone, public http : RvHttpService, public util : GeneralUtil) { }
  frmGrp = new FormGroup({
    siteCode: new FormControl('', Validators.compose([Validators.required, Validators.pattern(this.dataSrv.codeRegex)])),
    name: new FormControl(''),
    fileName: new FormControl(null),
    modifiedDate: new FormControl(null)
    // site: new FormControl(null),
    // building: new FormControl(null),
    // floor: new FormControl(null),
  })
  initialDataset = null
  locationDataMap = new Map()
  windowRef
  parent
  parentRow
  pk = 'siteCode'
  // dropdownData = {
  //   maps:[],
  //   sites : [],
  //   buildings :[]
  // }

  // dropdownOptions = {
  //   sites: [],
  //   buildings: [],
  //   floors: []
  // }


  subscriptions = []

  ngOnInit(): void {
    // this.subscriptions.push(this.windowRef.window.instance.close.subscribe(()=>this.onClose()))
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubsribe())
  }

  


  ngAfterViewInit(){
    this.pixiElRef.initDone$.subscribe(async () => {
      // await this.getDropdownData()
      this.frmGrp.controls['fileName']['uc'].textbox.input.nativeElement.disabled = true
      if(this.parentRow){
        this.loadData(this.parentRow[this.pk])
      }else{

      }
    })
    this.pixiElRef.init()
  }
  
  async loadData(id){
    let ticket = this.uiSrv.loadAsyncBegin()   
    let ds : SiteDataSet = (await this.http.get("api/site/v1/" + id))
    await this.pixiElRef.loadToMainContainer(ds['base64Image'] )
    this.util.loadToFrmgrp(this.frmGrp, ds)
    this.uiSrv.loadAsyncDone(ticket)
    this.pixiElRef.defaultPos = {
      x: ds.viewX,
      y: ds.viewY,
      zoom: ds.viewZoom
    }
    this.pixiElRef.setViewportCamera( this.pixiElRef.defaultPos.x ,  this.pixiElRef.defaultPos.y  , this.pixiElRef.defaultPos.zoom)
  }


  // async getDropdownData(){
  //   let ticket = this.uiSrv.loadAsyncBegin()
  //   let dropdownObj = await this.dataSrv.getDropLists(['buildings','sites','maps'])
  //   this.dropdownData = (<any>dropdownObj.data)
  //   this.dropdownOptions = (<any>dropdownObj.option)
  //   // this.dropdownData.maps = await this.http.get("api/map/v1/droplist") 
  //   // this.dropdownData.points = await this.http.get("api/shape/v1/droplist?shape_type=location")
  //   // // this.dropdownData.sites = await this.http.get("api/locations/site/v1")
  //   // this.dropdownData.buildings = await this.http.get("api/locations/building/v1")
  //   // this.dropdownOptions.sites = this.dropdownData.sites.map(s=>{return {text: s['displayName'] , value:s['id']}})
  //   // console.log(this.dropdownData)
  //   this.uiSrv.loadAsyncDone(ticket)
  // }

 

  async validate() {
    return this.util.validateFrmGrp(this.frmGrp)
  }

  async getSubmitDataset(){
    let ticket = this.uiSrv.loadAsyncBegin()
    let vpPos = this.pixiElRef?.getViewportPosition()
    let ret : SiteDataSet = {
        siteCode : null,
        viewZoom: vpPos.defaultZoom,
        viewX:  this.util.trimNum(vpPos.defaultX , 0),
        viewY:  this.util.trimNum(vpPos.defaultY , 0) ,
        base64Image : await this.pixiElRef?.getMainContainerImgBase64()
    }
    Object.keys(this.frmGrp.controls).forEach(k=> ret[k] = this.frmGrp.controls[k].value)
    // ret.locationId = this.id 
    this.uiSrv.loadAsyncDone(ticket)
    return ret
  }


  async onClose(){
    if(await this.uiSrv.showConfirmDialog('Do you want to quit without saving ?')){
      this.windowRef.close()
    }
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }

    if((await this.dataSrv.saveRecord("api/site/v1"  , await this.getSubmitDataset(), this.frmGrp  , !this.parentRow)).result){      
      this.windowRef.close()
    }
  }
}
