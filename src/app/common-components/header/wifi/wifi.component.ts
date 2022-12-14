import { ChangeDetectionStrategy } from '@angular/compiler/src/compiler_facade_interface';
import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { BehaviorSubject, Subject } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-wifi',
  templateUrl: './wifi.component.html',
  styleUrls: ['./wifi.component.scss']
})
export class WifiComponent implements OnInit , OnDestroy {
  wifiSignalList = [ ]

  dialogRef : DialogRef
  password
  selectedSsid
  connectedWifi = null //{ ssid: "Fake Wifi 4", signal: 2, connected: true } //TBD : should get from signalRSubj
  onDestroy = new Subject()

  constructor(public uiSrv : UiService, public dataSrv: DataService, private changeDetector : ChangeDetectorRef) { }

  ngOnInit(): void {
    this.dataSrv.subscribeSignalR('wifi')
    this.dataSrv.signalRSubj.wifiList.pipe(filter(w=>w!=null),takeUntil(this.onDestroy)).subscribe(wifis=>{
      this.refreshWifiList(wifis)
    })
    //pending : 
    //get wifiSignalList from wifi/v1/signal
    //get connected from wifi/v1
  }

  ngOnDestroy(){
    this.onDestroy.next()
    this.dataSrv.unsubscribeSignalR('wifi')
  }

  refreshWifiList(wifis) {
    if (!this.selectedSsid) {
      this.wifiSignalList = wifis
    } else {
      this.wifiSignalList = this.wifiSignalList.filter(w=>w.ssid == this.selectedSsid && wifis.map(w2=>w2.ssid).includes(this.selectedSsid))
      this.wifiSignalList.forEach(w=>w.signal = wifis.filter(w2 => w2.ssid == w.ssid)[0]?.['signal'] )
      this.wifiSignalList.unshift.apply(this.wifiSignalList, wifis.filter(w => w.ssid < this.selectedSsid))
      this.wifiSignalList.push.apply(this.wifiSignalList, (wifis.filter(w => w.ssid > this.selectedSsid)))
    }
    
    this.wifiSignalList.forEach(w => w.signal = w.signal > 80 ? 4 : (w.signal > 60 ? 3 : w.signal > 40 ? 2 : (w.signal > 20 ? 1 : 0)))

    this.getConnectedWifi()
    this.changeDetector.detectChanges()
  }

  async connectWifi(ssid){
    await this.dataSrv.connectWifi(ssid, this.password)
    this.getConnectedWifi()
  }

  async getConnectedWifi(){
    //TBD : should refresh from signalRSubj but shouldn't reset wifiSignalList (shouldn't disturb user input)
   this.connectedWifi =  this.wifiSignalList.filter(w=>w['inUse'])[0]
  }
}
