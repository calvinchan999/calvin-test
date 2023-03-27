import { Component, OnInit, ViewChild , EventEmitter , Output } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Html5Qrcode, Html5QrcodeScanner } from 'html5-qrcode';
import { Html5QrcodeError, Html5QrcodeResult } from 'html5-qrcode/esm/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { UiService } from 'src/app/services/ui.service';
@Component({
  selector: 'app-sa-pages-unlock-cabinet',
  templateUrl: './sa-pages-unlock-cabinet.component.html',
  styleUrls: ['./sa-pages-unlock-cabinet.component.scss']
})
export class SaPagesUnlockCabinetComponent implements OnInit  {
  isLoading = false
  scannerInitTicket 
  @ViewChild('scanner') scanner
  qrElId = 'qr-code-reader'
  html5QrcodeScanner : Html5Qrcode
  qrResult = new BehaviorSubject<string>(null)
  $onDestroy = new Subject()
  title 
  dialogRef : DialogRef
  @Output() enterPin = new EventEmitter()

  constructor(public uiSrv: UiService) { }


  async ngOnDestroy(){
    this.$onDestroy.next()
    await this.html5QrcodeScanner.stop()
    this.html5QrcodeScanner.clear()
  }

  ngOnInit(): void {

  }

  ngAfterViewInit(){
    this.initQrScanner()
  }
  
  onClose(){
    this.dialogRef.close()
  }

  initQrScanner() {
    setTimeout(() => {
      Html5Qrcode.getCameras().then(devices => {
        console.log(devices)
        /**
         * devices would be an array of objects of type:
         * { id: "id", label: "label" }
         */
        // if (devices && devices.length) {
        //   var cameraId = devices[0].id;
        //   // .. use this to start scanning.
        // }
      }).catch(err => {
        console.log(err)
        // handle err
      });
      this.html5QrcodeScanner = new Html5Qrcode(this.qrElId);
      const handleQrCodeResult = (evt: string, result : Html5QrcodeResult) => {
        if (this.isLoading) {
          return
        }
        this.isLoading = true
        let ticket = this.uiSrv.loadAsyncBegin()
        setTimeout(() => {
          this.qrResult.next(evt)
          this.isLoading = false
          this.uiSrv.loadAsyncDone(ticket)
        }, 500)
      }
      const qrCodeFailallback = (errorMessage: string, error: Html5QrcodeError) => {
        console.log(error)
        this.uiSrv.showNotificationBar(errorMessage , 'error')
      };
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };

      // If you want to prefer front camera
      this.html5QrcodeScanner.start({ facingMode: "user" }, config, handleQrCodeResult, null )
      // this.html5QrcodeScanner = new Html5QrcodeScanner( this.qrElId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      // this.html5QrcodeScanner.render((decodedText) => this.handleQrCodeResult(decodedText) ,null)
      // navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(() => {
      //   if (this.scanQRtoggleEl) {
      //     this.scanQRtoggleEl.click()
      //   }
      // })
    })
  }


  // onScanSuccess(decodedText, decodedResult) {
  //   this.handleQrCodeResult(decodedText)

  //   // // handle the scanned code as you like, for example:
  //   // console.log(decodedResult);
  // }

  // scannerInitDone(){
  //   this.uiSrv.loadAsyncDone(this.scannerInitTicket)
  // }

}
