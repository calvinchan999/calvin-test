import { Component, EventEmitter, HostBinding, Input, OnInit, Output, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { from } from 'rxjs';
import { delay, map, switchMap, tap } from 'rxjs/operators';
import { UiService } from 'src/app/services/ui.service';


@Component({
  selector: 'uc-multiselect',
  templateUrl: './multiselect.component.html',
  styleUrls: ['./multiselect.component.scss']
})
export class MultiselectComponent implements OnInit {

  constructor(public uiSrv: UiService) { }
  @ViewChild("multiselect") multiselect;
  @Input() lab
  @Input() frmGrp: FormGroup = new FormGroup({ myControl: new FormControl() })
  @Input() frmCtrl = 'myControl'
  @Input() textFld = 'text'
  @Input() valueFld = 'value'
  @Input() options = []
  @Input() defaultValue = null
  @Input() useTranslation = false
  @Output() change = new EventEmitter()
  @Output() valueChange = new EventEmitter()
  @Input() @HostBinding('class') customClass = 'multiselect-container'
  @Input() clearValueOnOptionRemoved = true
  @Input() noDataMsg = null
  @Input() col = ''
  @Input() filterable = false
  @Input() checkboxes = false
  @Input() disabled = false
  @Input() useSummaryTag = false
  oldValue = null
  myValue
  subscriptions = []
  selectedItem = null
  errMsg = null
  dispOptions = []
  filterVal = null

  ngOnChanges(evt) {
    if (this.clearValueOnOptionRemoved && evt && Object.keys(evt).includes('options') && evt['options']['currentValue'] && evt['options']['previousValue']) {
      if (evt['options']['previousValue'].length > 0 && !evt['options']['currentValue'].map(o => o[this.valueFld]).includes(this.value)) {
        this.value = null
      }
    }
    if (Object.keys(evt).includes('options')) {
      this.value = this.value
      this.dispOptions = JSON.parse(JSON.stringify(this.options))
    }
  }

  @Input() set value(v) {
    if (v && v.length > 0) {
      this.myValue = typeof v[0] == 'object' ? v : this.options.filter(o => v.includes(o[this.valueFld]))
    } else {
      this.myValue = v
    }
    this.frmGrp.controls[this.frmCtrl].setValue(this.myValue?.map(v2 => typeof v2 == 'object' ? v2[this.valueFld] : v2), { emitEvent: false })
  }

  get value() {
    return this.frmGrp.controls[this.frmCtrl].value
  }


  ngOnInit(): void {
    this.frmGrp.controls[this.frmCtrl]['uc'] = this
    this.customClass += ' ' + this.frmCtrl + (this.col ? (' col-' + this.col) : ' col')
    this.subscriptions.push(this.frmGrp.controls[this.frmCtrl].valueChanges.subscribe(v => this.value = v))

    if (this.useTranslation) {
      this.uiSrv.lang.subscribe(() => this.options.forEach(o => {
        o[this.textFld] = this.uiSrv.translate(o[this.textFld])
      }))
    }
    if (this.defaultValue) {
      let matches = this.options.filter(o => o[this.valueFld] == this.defaultValue)
      if (matches.length > 0) {
        this.selectedItem = matches[0]
        this.value = matches[0][this.valueFld]
      }
    }
  }

  ngAfterViewInit() {
    this.multiselect.filterChange.pipe(delay(300)).subscribe((v) => {
      v = v && v.length > 0? v.toLowerCase() : null
      this.filterVal = v
      let exactMatch = this.options.filter(o => o[this.textFld].toLowerCase() == v)
      let startsWith = this.options.filter(o => o[this.textFld].toLowerCase().startsWith(v) && o[this.textFld].toLowerCase() != v)
      let contains = this.options.filter(o => o[this.textFld].toLowerCase().includes(v) && o[this.textFld].toLowerCase() != v && !startsWith.map(o => o[this.valueFld]).includes(o[this.valueFld]))
      this.dispOptions = v? exactMatch.concat(startsWith).concat(contains) : JSON.parse(JSON.stringify(this.options))
    });
  }

  setErrors(errMsg) {
    this.frmGrp.controls[this.frmCtrl].setErrors(errMsg ? { message: errMsg } : null)
  }

  ngOnDestroy() {
    try {
      this.subscriptions.forEach(s => s.unsubsribe())
    } catch {

    }
  }


}
