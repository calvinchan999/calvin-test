import { Component, OnInit, ViewChild , EventEmitter , Output } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { Html5QrcodeScanner } from 'html5-qrcode';
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
  html5QrcodeScanner : Html5QrcodeScanner
  qrResult = new BehaviorSubject<string>(null)
  $onDestroy = new Subject()
  title 
  dialogRef : DialogRef
  @Output() enterPin = new EventEmitter()

  constructor(public uiSrv: UiService) { }


  ngOnDestroy(){
    this.$onDestroy.next()
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

  initQrScanner(){
    setTimeout(()=>{
      this.html5QrcodeScanner = new Html5QrcodeScanner( this.qrElId, { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      this.html5QrcodeScanner.render((decodedText) => this.handleQrCodeResult(decodedText) ,null)
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }).then(() => {
        if (this.scanQRtoggleEl) {
          this.scanQRtoggleEl.click()
        }
      })
    })
  }

  get scanQRtoggleEl(){
    return <any>document.getElementById(this.qrElId + '__dashboard_section_csr')?.getElementsByTagName("BUTTON")[0]
  }

  onScanSuccess(decodedText, decodedResult) {
    this.handleQrCodeResult(decodedText)

    // // handle the scanned code as you like, for example:
    // console.log(decodedResult);
  }

  scannerInitDone(){
    this.uiSrv.loadAsyncDone(this.scannerInitTicket)
  }

  handleQrCodeResult(evt) {
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

}
