import { Component, EventEmitter, HostBinding, HostListener, Input, OnInit, Output, Renderer2, ViewChild } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { toJSON } from '@progress/kendo-angular-grid/dist/es2015/filtering/operators/filter-operator.base';
import { NumericTextBoxComponent, TextBoxComponent } from '@progress/kendo-angular-inputs';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DataService } from 'src/app/services/data.service';

@Component({
  selector: 'uc-txtbox',
  templateUrl: './txtbox.component.html',
  styleUrls: ['./txtbox.component.scss'],
})
export class TxtboxComponent implements OnInit {
  @ViewChild("textbox") public textbox: TextBoxComponent;
  @Input() lab
  @Input() col = ''
  @Input() placeholder = ''
  // @Input() customClass = 'txtbox-container'
  @Input() frmGrp : FormGroup
  @Input() frmCtrl : string
  @Input() type
  @Input() isGridCell = false
  @Input() prefixButton
  @Input() suffixButton
  @Input() numeric = false
  @Input() numMax = null
  @Input() numMin = null
  @Input() numDecimals = null
  @Input() numStep = 1 
  @Input() textArea = false
  @Input() focusOnInit = false
  @Input() numTick = 0.5
  @Input() numFormat = 'n2'
  @Input() upper = false
  @Input() dbTable = null
  @Output() prefixButtonClick = new EventEmitter()
  @Output() suffixButtonClick = new EventEmitter()
  @Input() @HostBinding('class') customClass = 'txtbox-container';
  @Input() inlineEditRef : {
    row : null,
    id : null
  }
  @Input() disabled = false
  @Input() width 
  @Input() detectChangeByUserOnly = true //added 20220902 to prevent programmatic valuechange emit 
  subscriptions = []
  maxlength = null
  errMsg = null
  

  myValue = null
  $onDestroy = new Subject()
  
  
  @Input() public set value(v){
    v = v === undefined ? null : v
    this.myValue = v
    if(this.hasFrm){
      this.frmGrp.controls[this.frmCtrl].setValue(this.upper ? v?.toUpperCase() : v, { emitEvent: false })
    }else if(!this.detectChangeByUserOnly){
      this.valueChange.emit(v)
    }
  }
  @Output() valueChange = new EventEmitter()

  constructor(public uiSrv : UiService, public util : GeneralUtil , private renderer: Renderer2 ,public dataSrv : DataService) { 

  }

  public get value(){
    return this.hasFrm ? this.frmGrp.controls[this.frmCtrl].value : this.myValue
  }

  public get hasFrm(){
    return this.frmGrp && this.frmCtrl
  }

  public setValue(v){ //set value safely with base validation
    this.value = v && this.maxlength ? v.trimEnd().substring(0 , Math.min(v.length , this.maxlength)) : v
  }
  

  ngAfterViewInit() {
    if (!this.textArea && !this.numeric) {
      this.textbox.input.nativeElement.type = this.type;
    }
    this.textbox.valueChange.pipe(takeUntil(this.$onDestroy)).subscribe(v=>{
      // this.textbox.value = this.upper ? v?.toUpperCase() : v
      this.value = this.upper ? v?.toUpperCase() : v
      this.valueChange.emit(this.value)
      // if(this.hasFrm){
      //   this.value = this.textbox.value
      // }
    })
    if(this.focusOnInit){
      this.focusTextbox()
    }
  }

  focusTextbox(){
    this.textbox.input.nativeElement.focus()
  }

  ngOnInit(): void {
    if(this.hasFrm){
      this.frmGrp.controls[this.frmCtrl]['uc'] = this
      this.customClass += ' ' + this.frmCtrl + (this.col ? (' col-' + this.col) : ' col' )
      this.subscriptions.push(this.frmGrp.controls[this.frmCtrl].valueChanges.subscribe(v =>{
        this.valueChange.emit(v)
      }))
      // this.class = (this.col ? (' col-' + this.col) : ' col' )
      if(this.util.formConfig?.maxlength){
        this.maxlength = this.util.formConfig?.maxlength.filter(c=> c['key'] == this.frmCtrl && (!this.dbTable || c['table'] == this.dbTable))[0]?.length
      }
    }
    this.customClass += this.numeric ? ' numeric' : ''
  }

  ngOnDestroy(){
    this.subscriptions.forEach(s=>s.unsubscribe())
  }

  setErrors(errMsg){
    if(this.hasFrm){
      this.frmGrp.controls[this.frmCtrl].setErrors(errMsg ? {message:errMsg} : null)
    }else{
      this.errMsg = errMsg
    }
  }

  
  changeNumericValueBy(increment){
    this.value += increment
    let interval = setInterval(()=>{
      if(this.value != null){
        this.value += increment
      }
    }, 200)
    this.renderer.listen(document,'touchend', ()=>{
      clearInterval(interval)
    }) 
    this.valueChange.emit(this.value)
  }
}
