import { Component, OnInit ,Output,EventEmitter } from '@angular/core';
import { DialogRef } from '@progress/kendo-angular-dialog';
import { UiService } from 'src/app/services/ui.service';


@Component({
  selector: 'app-sa-pages-lock-cabinet',
  templateUrl: './sa-pages-lock-cabinet.component.html',
  styleUrls: ['./sa-pages-lock-cabinet.component.scss']
})
export class SaPagesLockCabinetComponent implements OnInit {
  isLoading = false
  title
  dialogRef : DialogRef
  @Output() setPin = new EventEmitter()
  constructor(public uiSrv: UiService) { }
  ngAfterViewInit() {

  }
  
  onClose(){
    this.dialogRef.close()
  }

  ngOnInit(): void {
    
  }


}
