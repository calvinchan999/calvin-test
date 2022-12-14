import { Component, OnInit, ViewChild } from '@angular/core';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'app-sa-pages-scan-qr',
  templateUrl: './sa-pages-scan-qr.component.html',
  styleUrls: ['./sa-pages-scan-qr.component.scss']
})
export class SaPagesScanQrComponent implements OnInit  {
  isLoading = false
  scannerInitTicket 
  @ViewChild('scanner') scanner
  qrElId = 'qr-code-reader'
  html5QrcodeScanner : Html5QrcodeScanner

  constructor(public uiSrv: UiService) { }
  ngAfterViewInit() {

  }

  ngOnDestroy(){
    this.html5QrcodeScanner.clear()
  }

  ngOnInit(): void {
    this.initQrScanner()
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
    return <any>document.getElementById(this.qrElId + '__dashboard_section_csr').getElementsByTagName("BUTTON")[0]
  }

  onScanSuccess(decodedText, decodedResult) {
    this.handleQrCodeResult(decodedText)
    // handle the scanned code as you like, for example:
    console.log(decodedResult);
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
    this.uiSrv.showNotificationBar("QR Code content : " + evt)
    setTimeout(() => {
      this.isLoading = false
      this.uiSrv.loadAsyncDone(ticket)
    }, 3000)
  }

}
