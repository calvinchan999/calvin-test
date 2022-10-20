import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { Component, OnInit , ViewChild } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { WindowRef } from '@progress/kendo-angular-dialog';
import { LabelSettings } from '@progress/kendo-angular-progressbar';
import { Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { DataService, DropListMap, DropListRobot, SaveRecordResp } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-sa-map-import',
  templateUrl: './sa-map-import.component.html',
  styleUrls: ['./sa-map-import.component.scss']
})
export class SaMapImportComponent implements OnInit {
  @ViewChild('uploader') public uploader
  frmGrp = new FormGroup({
    mapCode :  new FormControl(null, Validators.required),
    fileName: new FormControl(null, Validators.required),
  })

  parent
  loadingTicket
  windowRef : WindowRef
  file
  isUploading = false
  isUploadedAndProcessing = false
  uploadedPercent
  label: LabelSettings = {
    visible: true,
    format: "percent",
    position: "center",
  };

  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }

  ngOnInit(): void {
  }

  onfileLoad(event){
    this.uiSrv.loadAsyncDone(this.loadingTicket);
    const files = event.target.files;
    if (files.length === 0){
      return;
    }
    this.file = files[0]
    this.frmGrp.controls['mapCode'].setValue(this.file.name.split(".").slice(0 ,  -1).join("."))
  }

  onClose(){
    if(!this.isUploading){
      this.windowRef.close()
    }
  }

  async validate(){
    var mapList = (<DropListMap[]>(await this.dataSrv.getDropList('maps')).data)
    var oldMap : DropListMap = mapList.filter(m=>m.mapCode == this.frmGrp.controls['mapCode'].value)[0]
    if(oldMap){
      var msg = this.uiSrv.translate( oldMap.floorPlanCode ? (' and remove it from floor plan ' + `[${oldMap.floorPlanCode}]`) : "")
      return await this.uiSrv.showConfirmDialog(this.uiSrv.translate('Map record with same map code already exist. Are you sure to overwrite the existing record') + msg + '?')
    }
    return true
  }

  async saveToDB(){
    if(!await this.validate()){
      return
    }
    // let ticket = this.uiSrv.loadAsyncBegin()
    // below to be moved to httpSrv
    const formData = new FormData();
    formData.append('zip', this.file, this.file.name);
    this.isUploading = true   
    this.httpSrv.http.put(this.util.getRvApiUrl() + `/api/map/import/v1/${this.frmGrp.controls['mapCode'].value}`, formData, { reportProgress: true, observe: 'events'}).subscribe(resp => {
      if (resp.type === HttpEventType.Response) {       
        this.isUploading = false        
        this.isUploadedAndProcessing = false
        this.uploadedPercent = 0
        const respData : SaveRecordResp = resp.body?.['data']
        this.uiSrv.loadAsyncDone(this.loadingTicket)
        if(resp.status == 200 && respData.result == true){
          this.uiSrv.showNotificationBar('Map imported successfully', 'success')
          this.onClose()
        }else{
          this.uiSrv.showMsgDialog(respData?.msg ? respData?.msg : 'Map import failed')
        }
      }
      if (resp.type === HttpEventType.UploadProgress) {
        this.uploadedPercent = Math.round(100 * resp.loaded / resp.total);
        if( this.uploadedPercent == 100){
          this.loadingTicket = this.uiSrv.loadAsyncBegin()
          this.isUploadedAndProcessing = true
        }
      }
    },
    error =>{
      console.log(error)
      this.uiSrv.showMsgDialog(error?.message ? ` : ${error?.message}`: 'Map import failed')
    });
  }
}
