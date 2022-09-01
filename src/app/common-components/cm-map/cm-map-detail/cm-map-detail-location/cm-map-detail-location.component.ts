import { Component, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DialogRef, WindowRef } from '@progress/kendo-angular-dialog';
import { DataService } from 'src/app/services/data.service';
// import { CustomMessagesService } from 'src/app/services/custom-messages.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { PixiLocPoint } from 'src/app/ui-components/drawing-board/drawing-board.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CmMapDetailComponent } from '../cm-map-detail.component';

@Component({
  selector: 'app-cm-map-detail-location',
  templateUrl: './cm-map-detail-location.component.html',
  styleUrls: ['./cm-map-detail-location.component.scss']
})
export class CmMapDetailLocationComponent implements OnInit { //OBSOLETE
  constructor(public uiSrv:UiService , public http : RvHttpService , public util:GeneralUtil , public dataSrv : DataService) { }
  parent : CmMapDetailComponent
  gr : PixiLocPoint
  // initialData = {}
  dialogRef : DialogRef
  frmGrp = new FormGroup({
    shapeCode : new FormControl('' , Validators.compose([Validators.required, Validators.pattern("[^/><|:&]+")])),
    map : new FormControl(''),
    linkShapeId : new FormControl(''),
    actionId : new FormControl(null),
  })
  links = [

  ];

  dropdownData = {
    maps : [],
    locations :[]
  }

  dropdownOptions = {
    maps: [],
    locations: []
  }

  ngOnInit(): void {
    this.loadData()
    // this.initialData = JSON.parse(JSON.stringify(this.getSubmitDataset()))
  }

  
  async validate(){
    // if(! await this.parent.validateWaypointName(this.frmGrp.controls['shapeCode'].value, this.gr)){
    //   return false
    // }
    return true
  }

  loadData(){
    let data = this.parent.locationDataMap.get(this.gr) ? this.parent.locationDataMap.get(this.gr) : {}
    this.util.loadToFrmgrp(this.frmGrp,data)
    this.links = data?.links?  data.links : []  
  }

  getSubmitDataset(){
    let ret = { actionId: this.frmGrp.controls['actionId'].value, shapeCode: this.frmGrp.controls['shapeCode'].value }
    ret['links'] = JSON.parse(JSON.stringify(this.links))
    return ret
  }

  addLink(){
    this.links.push({
      linkMapId : this.frmGrp.controls['map'].value,
      mapName : this.dropdownOptions.maps.filter(m=>m['value'] == this.frmGrp.controls['map'].value)[0]['text'],
      linkShapeId : this.frmGrp.controls['linkShapeId'].value,
      shapeCode : this.dropdownOptions.locations.filter(p=>p['value'] == this.frmGrp.controls['linkShapeId'].value)[0]['text'],
    })
  }

  get linkAddable(){
    return this.frmGrp.controls['map'].value &&
           this.frmGrp.controls['linkShapeId'].value &&
           this.links.filter(l => l['linkMapId'] == this.frmGrp.controls['map'].value && l['linkShapeId'] == this.frmGrp.controls['linkShapeId'].value).length == 0
  }


  // checkNoChanges() : boolean{
  //   return JSON.stringify(this.initialData) == JSON.stringify(this.getSubmitDataset())
  // }

  removeLink(link){
    this.links = this.links.filter( l => l != link)
  }

  async onClose(){
    if(await this.validate()){
      this.gr.text = this.frmGrp.controls['shapeCode'].value
      this.gr.refreshBadge(this.links.length)
      this.parent.locationDataMap.set(this.gr,this.getSubmitDataset())
      this.dialogRef.close() 
    }
    // if(this.checkNoChanges()||await this.uiSrv.showConfirmDialog('Do you want to quit without save ?')){
    //   this.dialogRef.close()
    // }
  }
}
