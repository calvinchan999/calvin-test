import { Component, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild , OnDestroy } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { DropDownListComponent } from '@progress/kendo-angular-dropdowns';
import { combineLatest, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { dataNotFoundMessage  , UiService } from 'src/app/services/ui.service';

@Component({
  selector: 'uc-dropdown',
  templateUrl: './dropdown.component.html',
  styleUrls: ['./dropdown.component.scss']
})
export class DropdownComponent implements OnInit , OnDestroy {
  //*** For value change subscription , please use the event emitter of this UC for instead of form control --- formControl valueChange is suppressed ***/
  constructor(public uiSrv : UiService) { }
  @Input() showValue = false
  @Input() filterable = false
  @Input() translateOption = false
  @Input() lab
  @Input() frmGrp : FormGroup
  @Input() frmCtrl
  @Input() textFld = 'text'
  @Input() valueFld = 'value'
  _options
  filter = null
  @Input() set options(v){
    this._options = v
    this.handleFilter(this.filter)
  }
  get options(){
    return this._options
  }
  filteredOptions = []
  @Input() defaultValue = null
  @Input() useTranslation = false
  @Output() change = new EventEmitter()
  @Output() valueChange = new EventEmitter()
  @Output() open = new EventEmitter()
  @Output() close = new EventEmitter()
  @Input() @HostBinding('class')  customClass = 'dropdown-container'
  @Input() clearValueOnOptionRemoved = true
  @Input() noDataMsg = null
  @Input() nullValueDesc = null
  @Input() col = ''
  @Input() prefixIconClass 
  @Input() trackMouseoverOption = false
  @Input() mouseoverOption
  @Input() allowClear = true
  @Output() mouseoverOptionChange = new EventEmitter()
  @ViewChild('kDropdown') kDropdown : DropDownListComponent
  @Input() inlineEditRef : {
    row : null,
    id : null
  }
  @Input() customDropItemTemplate = false
  @Input()disabled = false
  oldValue = null
  myValue
  selectedItem = null
  errMsg = null
  optionInitDone = false
  @Input() width
  transitBackground
  dataNotFound = false
  dataNotFoundMsg = dataNotFoundMessage
  kendoCssClass
  $onDestroy = new Subject()
  
  ngOnChanges(evt) {
    if (this.clearValueOnOptionRemoved && evt && Object.keys(evt).includes('options') && evt['options']['currentValue'] && evt['options']['previousValue']) {
      if (evt['options']['previousValue'].length > 0 && !evt['options']['currentValue'].map(o => o[this.valueFld]).includes(this.value)) {
        this.value = null
      }
    }
    if (Object.keys(evt).includes('options')) {
      this.value = this.value
      this.optionInitDone = true
    }
  }

  @Input() set value(v){
    if(this.hasFrm){
      this.frmGrp.controls[this.frmCtrl].setValue(v, { emitEvent: false })
      this.refreshValidityClass()
    }
    let matches = this.options?.filter(o => o[this.valueFld] == v)
    if(this.optionInitDone && matches?.length > 0){
      this.dataNotFound =  v !== null && matches.length == 0
      this.myValue = v != null ? matches[0] : v 
    }else{
      this.myValue = {}
      this.myValue[this.valueFld] = v
      this.myValue[this.textFld] = null
    }
    this.refreshDataNotFoundState()
  }

  refreshDataNotFoundState(){
    this.dataNotFound = this.myValue && this.myValue[this.valueFld] != null && !this.options?.map(o=>o[this.valueFld]).includes(this.myValue[this.valueFld])
  }

  get value() {
    return this.hasFrm ? this.frmGrp.controls[this.frmCtrl].value : this.myValue?.[this.valueFld]
  }

  get hasFrm(){
    return this.frmGrp && this.frmCtrl
  }

  ngOnInit(): void {
    if(this.hasFrm){
      let frmCtrl = this.frmGrp.controls[this.frmCtrl]
      frmCtrl['uc'] = this
      this.customClass += ' ' + this.frmCtrl + (this.col ? (' col-' + this.col) : ' col' )
      frmCtrl.valueChanges.pipe(takeUntil(this.$onDestroy)).subscribe(v=>{
        this.value = v
        this.refreshValidityClass()
      })
      this.frmGrp.statusChanges.pipe(takeUntil(this.$onDestroy)).subscribe(() =>this.refreshValidityClass())
    }else{
      this.customClass += ' ' + (this.col ? (' col-' + this.col) : ' col' )
    }
    if(this.useTranslation){
      this.uiSrv.lang.subscribe(() => this.options.forEach(o=>{
        o[this.textFld] = this.uiSrv.translate(o[this.textFld])
      }))
    }
    if(this.defaultValue){
      let matches = this.options.filter(o=>o[this.valueFld] == this.defaultValue)
      if(matches.length > 0){
        this.selectedItem = matches[0]
        this.value = matches[0][this.valueFld]
      }
    }
  }

  refreshValidityClass(){
    this.kendoCssClass = this.frmGrp?.controls[this.frmCtrl]?.touched && this.frmGrp?.controls[this.frmCtrl]?.errors!=null ? `ng-touched ng-pristine ng-invalid` : undefined
  }

  setErrors(errMsg){
    if(this.hasFrm){
      this.frmGrp.controls[this.frmCtrl].setErrors(errMsg ? {message:errMsg} : null)
    }else{
      this.errMsg = errMsg
    }
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  toggleOptions(){
    if(this.disabled){
      return
    }
    let orgIsOpened = this.kDropdown.isOpen
    this.kDropdown.focus()
    this.kDropdown.toggle()
    if(orgIsOpened){
      this.close.emit()
      this.blurKdropdown() 
    }else{
      this.open.emit()
    }
  }

  setValue(v){
    if( this.options.filter(o => o[this.valueFld] == v)[0] ){
      this.value = v
      this.valueChange.emit(v)
    }
  }

  blurKdropdown(){ 
    setTimeout(()=>this.kDropdown.blur()) //kdropdown call focus on keyboard selection (enter keydown) ?
  }

  onMouseLeaveOption(opt, evt) {
    let spanRect = evt.target.getBoundingClientRect()
    let kpopupRect = evt.target.closest("KENDO-POPUP").getBoundingClientRect()
    let mouseLeaveKpopup = evt.clientY > (kpopupRect.bottom -5 )|| evt.clientY < (kpopupRect.top + 5 ) || spanRect.right < evt.clientX || spanRect.left > evt.clientX 
    if (mouseLeaveKpopup && this.mouseoverOption && this.mouseoverOption[this.valueFld] == opt[this.valueFld]) {
      this.mouseoverOptionChange.emit(null)
    }
  }

  validate(){
    if( this.dataNotFound){
      this.setErrors(this.uiSrv.translate('Invalid Option'))
      return false
    }
    return true
  }

  handleFilter(v) {
    this.filter = v
    v = v && v.length > 0 ? v.toLowerCase() : null
    let exactMatch = this.options.filter(o => o[this.textFld].toLowerCase() == v)
    let startsWith = this.options.filter(o => o[this.textFld].toLowerCase().startsWith(v) && o[this.textFld].toLowerCase() != v)
    let contains = this.options.filter(o => o[this.textFld].toLowerCase().includes(v) && o[this.textFld].toLowerCase() != v && !startsWith.map(o => o[this.valueFld]).includes(o[this.valueFld]))
    this.filteredOptions = v ? exactMatch.concat(startsWith).concat(contains) : JSON.parse(JSON.stringify(this.options))
    // return this.filteredOptions
  }

  // setBackgroundAnimation(){
  //   this.transitBackground = true
  //   // setTimeout(()=>  this.transitBackground = false)
  // }


}
