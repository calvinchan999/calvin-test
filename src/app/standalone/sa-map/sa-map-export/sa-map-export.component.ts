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
  selector: 'app-sa-map-export',
  templateUrl: './sa-map-export.component.html',
  styleUrls: ['./sa-map-export.component.scss']
})
export class SaMapExportComponent implements OnInit {
  parent
  loadingTicket
  windowRef : WindowRef
  downloadedPercent = 0
  mapCode
  isDownloading = false
  mapDropdownOptions : {value : string , text : string}[] = []
  label: LabelSettings = {
    visible: true,
    format: "percent",
    position: "center",
  };

  constructor(public uiSrv : UiService , private dataSrv : DataService, public httpSrv : RvHttpService, public util : GeneralUtil){ }
  ngOnInit(): void {
    this.initMapOptions()
  }

  async initMapOptions(){
    let ticket = this.uiSrv.loadAsyncBegin()
    this.mapDropdownOptions = <any>(await this.dataSrv.getDropList('maps')).options
    let amrMapsResp : {name : string}[] = await this.dataSrv.httpSrv.fmsRequest("GET" , 'map/v1', null , false)
    let amrMaps =  amrMapsResp.filter(m=>!this.mapDropdownOptions.map(o=>o.value).includes(m.name)).map( m=>{return {value : m.name , text : `${m.name} (AMR)`}})
    this.mapDropdownOptions = amrMaps.concat(this.mapDropdownOptions)
    this.uiSrv.loadAsyncDone(ticket)
  }



  onClose(){
    if(!this.isDownloading){
      this.windowRef.close()
    }
  }

  async downloadFromServer(){
    this.isDownloading = true
    this.httpSrv.http.get(this.util.getRvApiUrl() + `/api/map/export/v1/${this.mapCode}`, { reportProgress: true, observe: 'events' , responseType : "blob"}).subscribe(resp => {
      if (resp.type === HttpEventType.Response) {       
        const respData : SaveRecordResp = resp.body?.['data']
        this.uiSrv.loadAsyncDone(this.loadingTicket)
        this.isDownloading = false
        if(resp.status == 200){
          const a = document.createElement('a')
          const objectUrl = URL.createObjectURL(resp.body)
          a.href = objectUrl
          a.download = this.mapCode + '.zip';
          a.click();
          this.uiSrv.showNotificationBar('Map exported successfully', 'success' , undefined , undefined , true)
          this.onClose()
        }else{
          this.uiSrv.showMsgDialog(respData?.msg ? respData?.msg : 'Map export failed')
        }
      }
      if (resp.type === HttpEventType.DownloadProgress) {
        this.downloadedPercent = Math.round(100 * resp.loaded / resp.total);
        if( this.downloadedPercent == 100){
          this.loadingTicket = this.uiSrv.loadAsyncBegin()
        }
      }
    },
    error =>{
      console.log(error)
      this.uiSrv.showMsgDialog(error?.message ? ` : ${error?.message}`: 'Map export failed')
    });
  }
}
