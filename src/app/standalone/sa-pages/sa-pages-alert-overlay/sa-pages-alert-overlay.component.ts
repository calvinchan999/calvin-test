import { Component, OnInit } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { MsgDialogContent, UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-sa-pages-alert-overlay',
  templateUrl: './sa-pages-alert-overlay.component.html',
  styleUrls: ['./sa-pages-alert-overlay.component.scss']
})
export class SaPagesAlertOverlayComponent implements OnInit {
  expanded = 'true'
  constructor(public uiSrv : UiService , public dataSrv : DataService) {

  }
  subscriptions = []
  alertMap = {
    estop: { dialogRef: null, message: this.uiSrv.commonAlertMessages.estopped },
    obstacleDetected: { dialogRef: null, message: this.uiSrv.commonAlertMessages.obstacleDetected },
    tiltActive: { dialogRef: null, message: this.uiSrv.commonAlertMessages.tiltDetected}
  }

  ngOnInit(): void {
    if (!this.uiSrv.isTablet) {
      Object.keys(this.alertMap).forEach(k => {
        this.subscriptions.push(this.dataSrv.signalRSubj[k].subscribe((b) => {
          if (b && !this.dataSrv.signalRSubj[k].dialogRef) {
            this.dataSrv.signalRSubj[k].dialogRef =  this.uiSrv.openKendoDialog({
              title: this.uiSrv.translate('Warning'),
              content: MsgDialogContent,
              actions: [{ text: 'OK', index: 0} ]
            })
            this.dataSrv.signalRSubj[k].dialogRef.content.instance.customClass = 'warning'
            this.dataSrv.signalRSubj[k].dialogRef.content.instance.msg =  this.uiSrv.translate(this.alertMap[k].message)
          }else if(!b && this.dataSrv.signalRSubj[k].dialogRef){
            this.dataSrv.signalRSubj[k].dialogRef.close()
            this.dataSrv.signalRSubj[k].dialogRef = null
          }
        }))
      })
    }
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubsribe())
  }

}
