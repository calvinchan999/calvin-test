import { Component, OnInit, Output, EventEmitter , Input } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { UiService } from 'src/app/services/ui.service';


@Component({
  selector: 'uc-pin-keypad',
  templateUrl: './pin-keypad.component.html',
  styleUrls: ['./pin-keypad.component.scss']
})
export class PinKeypadComponent implements OnInit {
  isLoading = false
  title
  dialogRef: DialogRef
  @Output() done = new EventEmitter()
  @Input() autoSubmit = false
  constructor(public uiSrv: UiService) { }
  ngAfterViewInit() {

  }

  onClose() {
    this.dialogRef.close()
  }



  keypadButtons = [
    [{ label: 1, id: 1 }, { label: 2, id: 2 }, { label: 3, id: 3 }],
    [{ label: 4, id: 4 }, { label: 5, id: 5 }, { label: 6, id: 6 }],
    [{ label: 7, id: 7 }, { label: 8, id: 8 }, { label: 9, id: 9 }],
    [{}, { label: 0, id: 2 }, { icon: '', id: 'backspace' }],
  ]
  displayDigits = [null, null, null, null, null, null]
  myPin = ''

  get pin() {
    return this.myPin
  }

  set pin(v) {
    this.myPin = v
    for (let i = 0; i < this.displayDigits.length; i++) {
      this.displayDigits[i] = i < this.myPin.length ? this.myPin[i] : null
    }
    if( this.myPin?.length==6 && this.autoSubmit){
      this.done.emit( this.myPin )
    }
  }

  ngOnInit(): void {

  }

  inputPin(key) {
    if (key == 'backspace') {
      this.pin = this.pin.substring(0, this.pin.length - 1)
    } else if (this.pin.length >= 6) {
      return
    } else if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 0].includes(key)) {
      this.pin += key.toString()
    }
  }
}
