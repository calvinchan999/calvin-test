import { Component, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { DateInputComponent as KendoDate } from '@progress/kendo-angular-dateinputs';
import { TextBoxComponent } from '@progress/kendo-angular-inputs';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'uc-date-input',
  templateUrl: './date-input.component.html',
  styleUrls: ['./date-input.component.scss']
})
export class DateInputComponent implements OnInit {
  @Input() lab
  @Input() disabled
  @ViewChild('kendoDate') kendoDate : KendoDate
  @Input() frmGrp : FormGroup = new FormGroup({frmCtrl : new FormControl()})
  @Input() frmCtrl : string = "frmCtrl"
  @Input() @HostBinding('class') customClass = 'date-input-container'
  @Input() col = ''
  @Output() valueChange  = new EventEmitter<any>();
  @Input() popupSettings
  kendoDateCssClass = undefined
  myValue = null
  $onDestroy = new Subject()
  constructor(public uiSrv : UiService, public util : GeneralUtil) { }

  @Input() public set value(v){
    if(typeof v === 'string'){
      v = new Date(v)
    }
    this.myValue = v
  }
  public get value(){
    return this.myValue 
  }

  // public get hasFrm(){
  //   return this.frmGrp && this.frmCtrl
  // }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  ngOnInit(): void {
    // if(this.hasFrm){
      let frmCtrl = this.frmGrp.controls[this.frmCtrl]
      let frmValue = frmCtrl.value
      this.myValue =  frmValue ? (typeof frmValue == 'string' ?  new Date(frmValue) : frmValue) : this.myValue
      frmCtrl['uc'] = this
      this.customClass += ' ' + this.frmCtrl + (this.col ? (' col-' + this.col) : ' col' )
      frmCtrl.valueChanges.pipe(takeUntil(this.$onDestroy)).subscribe(v=> {
        this.myValue = typeof v == 'string' ?  new Date(v) : v
      })
      combineLatest([ this.frmGrp.statusChanges , frmCtrl.statusChanges]).subscribe(() => {
        this.kendoDateCssClass = frmCtrl.touched &&  frmCtrl.errors!=null ? `ng-touched ng-pristine ng-invalid` : undefined
      });
    // }
  }

  
  

}
