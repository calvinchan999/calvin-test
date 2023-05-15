import { ListRange } from '@angular/cdk/collections';
import {CdkDragDrop, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import { CdkVirtualForOf, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone, OnInit, Output, Pipe, PipeTransform, Renderer2, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { ActionParameter } from 'src/app/services/data.models';
import { UiService , dataNotFoundMessage } from 'src/app/services/ui.service';
import { DropdownComponent } from '../dropdown/dropdown.component';
import { TxtboxComponent } from '../txtbox/txtbox.component';

@Component({
  selector: 'uc-listview',
  templateUrl: './listview.component.html',
  styleUrls: ['./listview.component.scss']
})
export class ListviewComponent implements OnInit {
  constructor(public uiSrv : UiService , private elRef : ElementRef, public changeDetector : ChangeDetectorRef , 
              private renderer: Renderer2 , private ngZone : NgZone, private dataSrv: DataService) { }
  @ViewChild('list') virtualScrollViewport : CdkVirtualScrollViewport
  @ViewChild('container') container
  @ViewChild('textbox') ucTextbox : TxtboxComponent
  @ViewChild('dropdown') ucDropdown : DropdownComponent
  @ViewChild(CdkDropList) dropList : CdkDropList
  @Input() columnDef = []
  @Input()  data  = []
  @Input() editable = true
  @Input() resizableColumns = false
  @Input() customAddRow = false
  @Input() disableAdd = false
  @Output() focusChange = new EventEmitter()
  @Output() valueChange = new EventEmitter()
  @Output() dataChange =  new EventEmitter()
  @Output() buttonClick =  new EventEmitter()  
  @Output() addNewRow =  new EventEmitter()  
  @Input() newRow = {}
  @Output() newRowChange = new EventEmitter()  
  @ViewChild(CdkVirtualForOf, {static: true}) private virtualForOf: CdkVirtualForOf<object[]>;
  rowHeight = 41
  headerHeight = 25
  renderRowCnt = 80
  minColumnWidth = 10
  projectedDropRow = null
  resizeGripWidth = 1
  columnIds = []
  myFocusedCell = null
  draggingRow 
  myDataSource = new BehaviorSubject<object[]>([])
  dropdownOptionsOpened
  currentWidth = null
  widthInitDone = false
  functionKeyCodes = [8, 9, 13, 16, 17, 18, 19, 20, 27, 33, 34, 35, 36, 37, 38, 39, 40, 44, 45, 46, 91, 92, 93,
    106, 107, 109, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 144, 145, 182, 183]
  cellEditObj = {
    copied : false,
    copiedValue : null,
    copiedColumnId : null,
  }
  errorsMap = new Map()
  errorDetail = null
  newRowError = null
  @Input() rowDetailCfg = {
    parentRowKey: null,
    detailRowLabelKey : null,
    detailRowValueKey : null,
  }
  // @Input()disableCommnadColumn = false
  @ViewChild('footerRow') footerRowElRef
  newDetailRowPadding = {left : '0%' , right : '0%'}
  inputTypes = ['textbox', 'dropdown']
  animatedBgMap = new WeakMap()
  dataNotFoundMsg = dataNotFoundMessage
  // dropPreviewEnabled = true

  set focusedCell(v){
    // if(v?.['row'] == this.newRow){
    //   return
    // }
    this.myFocusedCell = v
    if(v){      
      let colDef = this.getColDefById(v['id'])
      if(colDef['type'] == 'dropdown'){ //&& colDef['parentDropdownId']
        v['options'] = v['row'] == this.newRow &&  colDef['newRow']?.['options']  ? colDef['newRow']?.['options']  : (colDef['options'] ? JSON.parse(JSON.stringify(colDef['options'])) : colDef['options'])
      }
      this.myFocusedCell['originalValue'] = v['row']?.[v['id']]? JSON.parse(JSON.stringify(v['row'][v['id']])) : v['row']?.[v['id']]
      this.focusChange.emit(this.myFocusedCell)
    }
  }
  get focusedCell(){
    return this.myFocusedCell
  }
  rowRemoved = new EventEmitter()
  //NEED TO TURN OFF CHANGE DETECTION IF THE LISTVIEW IS RENDERED IN BACKGROUND
  @HostListener('document:click',['$event'])
  onMouseClick(evt){
    let conatinerEl = this.virtualScrollViewport?.elementRef.nativeElement.getElementsByClassName("cdk-virtual-scroll-content-wrapper")[0]
    if( (conatinerEl && !this.uiSrv.isInsideElement(conatinerEl , evt.clientX , evt.clientY)) && 
        (this.footerRowElRef && !this.uiSrv.isInsideElement(this.footerRowElRef.nativeElement , evt.clientX , evt.clientY))){
      this.focusedCell = null
    }
  }

  @HostListener("document:keydown", ["$event"])
  onKeyDown(evt : KeyboardEvent) {
    let colDef = this.focusedCell?.id? this.getColDefById(this.focusedCell?.id) : null
    if(!evt.ctrlKey){
      if(this.ucTextbox && !this.ucTextbox.disabled){
        if (this.ucTextbox.textbox.input.nativeElement !== document.activeElement) {
            if ((evt.key == 'Delete' || evt.key == 'Backspace' || !this.functionKeyCodes.includes(evt.keyCode))) {
              this.ucTextbox.value = null
              this.ucTextbox.valueChange.emit(this.ucTextbox.value)
            }
            if ( evt.key == 'Backspace'|| !this.functionKeyCodes.includes(evt.keyCode) ) {
              this.ucTextbox.textbox.input.nativeElement.focus()
            }
        }else if(evt.key == 'Escape' && this.ucTextbox.textbox){
          this.ucTextbox.textbox.input.nativeElement.blur()
        }
      }else if(colDef && this.ucDropdown && !this.isDropdownOptionOpened  && !this.ucDropdown.disabled){
        if(evt.key == ' '){
          evt.preventDefault()
          this.ucDropdown.toggleOptions()
        }
        if (!colDef?.notNull &&  evt.key == 'Delete'){
          this.ucDropdown.value = null
          this.ucDropdown.valueChange.emit(this.ucDropdown.value)
        }
      }
    }else if(this.focusedCell?.row && this.focusedCell?.id){
      if(evt.key == 'c' || evt.key == 'x'){
       let value = this.focusedCell['row'][this.focusedCell['id']]
       this.cellEditObj.copied = true
       this.cellEditObj.copiedValue = value ? JSON.parse(JSON.stringify(value)) : value
       this.cellEditObj.copiedColumnId = this.focusedCell.id
       if(evt.key == 'x' && !colDef.notNull  && ((this.ucTextbox && !this.ucTextbox.disabled) || (this.ucDropdown && !this.ucDropdown.disabled))){
        this.focusedCell['row'][this.focusedCell['id']] = null
       }
      }else if(evt.key == 'v' &&  this.cellEditObj.copied ){
        if(this.ucDropdown &&  this.cellEditObj.copiedColumnId  == this.focusedCell.id  && !this.ucDropdown.disabled){
          this.ucDropdown.setValue( this.cellEditObj.copiedValue )
        }else if(this.ucTextbox && this.getColDefById(this.cellEditObj.copiedColumnId)['type'] != 'dropdown'  && !this.ucTextbox.disabled){
          this.ucTextbox.setValue( this.cellEditObj.copiedValue)
        }
      }
    }
  }

  get isDropdownOptionOpened(){
    return this.ucDropdown && this.ucDropdown.kDropdown?.isOpen
  }

  @HostListener('document:keydown.arrowdown',['$event'])
  @HostListener('document:keydown.arrowup',['$event'])
  @HostListener('document:keydown.shift.enter',['$event'])
  @HostListener('document:keydown.enter', ['$event'])
  onEnterKeydown(evt) {
    let prevented = evt.defaultPrevented
    evt.preventDefault()
    evt.stopPropagation()
    if (this.focusedCell && !this.isDropdownOptionOpened && !(this.ucDropdown && prevented)) {
      let prev = evt.key == 'ArrowUp' || (evt.shiftKey && evt.key == 'Enter')
      let newRow = this.data[Math.max(0, Math.min(this.data.length - 1, (this.data.indexOf(this.focusedCell.row) + (prev ? -1 : 1))))]
      this.focusedCell = { row: newRow, id: this.focusedCell.id }
      this.scrollFocusedCellIntoView()
    }
  }

  @HostListener('document:keydown.arrowleft',['$event'])
  @HostListener('document:keydown.arrowright',['$event'])
  @HostListener('document:keydown.shift.tab',['$event'])
  @HostListener('document:keydown.tab',['$event'])
  onTabKeydown(evt){
    if(this.focusedCell && !this.isDropdownOptionOpened) {
      evt.preventDefault()
      evt.stopPropagation()
      let prev = evt.key == 'ArrowLeft' || (evt.shiftKey && evt.key == 'Tab')
      let ids = this.columnDef.map(c=>c['id'])
      let newId = ids[Math.max(Math.min( ids.length -1 , (ids.indexOf(this.focusedCell.id) +  (prev ? -1 : 1))) , 0)]
      this.focusedCell = {row :this.focusedCell.row , id: newId}
      this.scrollFocusedCellIntoView()
    }
  }

  @HostListener('document:keydown.esc',['$event'])
  onEscKeydown(evt){
    if(this.focusedCell){      
      this.focusedCell['row'][this.focusedCell['id']] = this.focusedCell['originalValue']
      if(this.isDropdownOptionOpened){
        this.ucDropdown.toggleOptions()
      }
    }
  }

  ngOnInit(): void {
  }

  ngOnChanges(evt){
    if (Object.keys(evt).includes('columnDef')) {
      // if(this.editable && !this.columnDef.map(d=>d.id).includes(this.commandColumnDef.id)){
      //   this.columnDef.push(this.commandColumnDef)
      // }
      this.columnDef.forEach(c => { //dont use columnDef = filter ... avoid dead loop
        if(this.uiSrv.isTablet && c['type']=='drag'){
          this.columnDef.splice(this.columnDef.indexOf(c) ,1)
          return
        }
      })

      this.refreshWidth()
      this.cellEditObj = {
        copied : false,
        copiedValue : null,
        copiedColumnId : null,
      }
      
      let newRowTtlWidth = this.columnDef.filter(r => !isNaN(Number(r['width']))).map(r => r['width']).reduce((acc, inc) => inc + acc, 0)
      let padLeft = 0
      let padRight = 0
      let firstInput = false
      this.columnDef.forEach(c => {
        let tmpWidth = c['width'] * 100 / newRowTtlWidth
        if (this.inputTypes.includes(c['type'])) {
          firstInput = true
        }
        if (!c['newRow']) {
          c['newRow'] = JSON.parse(JSON.stringify(c))
          c['newRow']['width'] = tmpWidth
        }
        padLeft = firstInput ? padLeft : (padLeft + tmpWidth)
        padRight = c['type'] != 'button' ? 0 : (padRight + tmpWidth)
      })   
      // this.newDetailRowPadding = { left: padLeft + '%', right: padRight + '%' }
      
    }
  }

  ngAfterViewInit(){
    this.refreshWidth()
  }

  ngDoCheck() {
    let width = this.virtualScrollViewport?.elementRef?.nativeElement?.offsetWidth
    if(this.currentWidth!= width){
      this.refreshWidth()
    }
  }

  refreshWidth(){
    let parentEl = this.elRef.nativeElement?.parentElement
    let containerWidth = parentEl?.offsetWidth ?  parentEl.offsetWidth - 8 : null // - scrollbar width
    if(containerWidth == null){
      console.log('resizing editable grid ...')
      setTimeout(()=>this.refreshWidth())
    }else{
      this.columnIds = this.columnDef.map(c=>c['id'])
      let ttlWidth = this.getColumnTotalWidth()
      let newWidth = this.widthInitDone && this.currentWidth ? (ttlWidth * containerWidth /  this.currentWidth ) : containerWidth
      this.columnDef.filter(c => !isNaN(Number(c['width']))).forEach(c =>  c['width'] = Number(c['width']) * newWidth / ttlWidth )
      this.widthInitDone = true
      this.currentWidth = containerWidth
    }
  }

  getColumnTotalWidth(){
    return this.columnDef.filter(c => c['hidden']!=true && !isNaN(Number(c['width']))).map(c => Number(c['width'])).reduce((acc, inc) => acc + inc, 0)
  }

  onColumnResize(event, id) {
    let colDef = this.getColDefById(id)
    let startX = event.clientX
    let orgWidth = colDef['width']
    let mouseMoveListener = this.renderer.listen('document' , 'mousemove', (evt)=>{
      colDef['width'] = Math.max((orgWidth + (evt.clientX - startX) ) , this.minColumnWidth)
    })
    let mouseUpListener = this.renderer.listen('document' , 'mouseup', (evt)=>{
      if(mouseMoveListener){
        mouseMoveListener()
      }
      if(mouseUpListener){
        mouseUpListener()
      }
    })
  }

  getColDefById(id){
    return this.columnDef.filter(c=>c['id'] == id)[0] ?  this.columnDef.filter(c=>c['id'] == id)[0] : this.columnDef.filter(c=>c['newRow']?.['id'] == id)[0]
  }

  dragStarted(evt , row){
    this.draggingRow = row
    document.body.style.cursor = 'move'; 
    const rowHeight = this.rowHeight
    const headerHeight = this.headerHeight
    this.data = this.data.filter(r=>r!=this.draggingRow)
    this.projectedDropRow = this.draggingRow
    let mouseMoveListener = this.renderer.listen('document','mousemove',(evt)=>{
      let offsetY = (this.virtualScrollViewport.measureScrollOffset() + (evt.clientY - headerHeight - this.virtualScrollViewport.elementRef.nativeElement.getBoundingClientRect().top))
      let rowIdx = offsetY <= rowHeight ? 0 : Math.floor(offsetY / rowHeight)
      rowIdx = Math.max( 0 , Math.min(this.data.length -1 , rowIdx))
      if(offsetY > (rowHeight *this.data.length )){
        this.projectedDropRow = null
        return
      }else if(rowIdx > 0){
        rowIdx = Math.max(rowIdx , Math.floor((this.virtualScrollViewport.measureScrollOffset())/this.rowHeight + 1))
        rowIdx = Math.min(rowIdx , (Math.floor((this.virtualScrollViewport.measureScrollOffset() + this.virtualScrollViewport.getViewportSize())/this.rowHeight  - 1 )))  
      }
      this.projectedDropRow = this.data[rowIdx]
    })
    let mouseUpListener = this.renderer.listen('document' , 'mouseup', (evt)=>{
      document.body.style.cursor = 'default'; 
      this.data.splice(this.projectedDropRow ? this.data.indexOf(this.projectedDropRow) : this.data.length , 0 , JSON.parse(JSON.stringify(this.draggingRow)))
      this.draggingRow = null
      this.projectedDropRow = null
      this.refreshSeq()
      this.dataChange.emit(this.data)
      if(mouseMoveListener){
        mouseMoveListener()
      }
      if(mouseUpListener){
        mouseUpListener()
      }
    })
  }

  buttonClicked(row, colDef){
    if(colDef['action'] == 'remove'){
      this.removeRow(row)    
    }else if(colDef['action'] == 'append'){
      this.addRow(JSON.parse(JSON.stringify(row)) , row)
    }else if(colDef['action'] == 'add' && row == this.newRow && !this.disableAdd  && !this.customAddRow){
        this.addRow(JSON.parse(JSON.stringify(this.newRow)) , null) 
        Object.keys(this.newRow).forEach(k=>delete this.newRow[k]) 
    }
    if(row != this.newRow || !this.disableAdd){
      this.buttonClick.emit({row:row , id: colDef['id']})
    }
  }

  addRow(newRow , afterRow){
    if(afterRow){
      this.data.splice(this.data.indexOf(afterRow) + 1,0, newRow)
    }else{
      this.data.push(newRow)
    }
    this.refreshSeq()
    this.dataChange.emit(this.data)
  }

  removeRow(row){
    this.rowRemoved.emit(row)
    this.data = this.data.filter(r=> r!=row)
    this.refreshSeq()
    this.dataChange.emit(this.data)
  }

  loadData(data){
    this.data = data
    this.dataChange.emit(this.data)
    this.refreshSeq()
  }

  refreshSeq() {
    let seqColumnDef = this.columnDef.filter(c=>c['type'] == 'seq')[0]
    if(seqColumnDef){
      this.data.forEach(r => r[seqColumnDef['id']] = this.data.indexOf(r) + 1)
    }
    this.refreshVirtualScrollView()
  }

  refreshVirtualScrollView(){
    if(!this.virtualScrollViewport){
      return
    }
    let start = this.virtualScrollViewport.getRenderedRange().start
    this.data = this.data ? JSON.parse(JSON.stringify(this.data)) : this.data
    // console.log(  this.data )
    this.virtualScrollViewport.setRenderedRange({start : start, end:  Math.min(this.data.length - 1 , start + this.renderRowCnt)})
  }

  scrollFocusedCellIntoView(){
    const rowHeight = this.rowHeight
    if(this.focusedCell?.row){
      let viewportHeight = this.virtualScrollViewport.getViewportSize()
      let scrollOffset = this.virtualScrollViewport.measureScrollOffset()
      let focusedRowIdx = this.data.indexOf(this.focusedCell.row) 
      if(focusedRowIdx * rowHeight < scrollOffset){
        this.virtualScrollViewport.scrollToOffset(focusedRowIdx * rowHeight )
      }else if((focusedRowIdx  + 1)  * rowHeight > (viewportHeight + scrollOffset)){
        this.virtualScrollViewport.scrollToOffset((focusedRowIdx + 1)* rowHeight - viewportHeight + viewportHeight % rowHeight )
      }
    }
  }

  setErrors(rowIndex , columnId , message = null){
    setTimeout(()=>{
      this.errorsMap.set( this.data[rowIndex] , {id: columnId , message : ` - #${rowIndex + 1} - ${message}`})
      this.errorDetail = this.errorsMap.get(this.data[rowIndex])
      this.focusedCell = {row : this.data[rowIndex] , id : columnId}
    })
  }

  clearErrorState(row = null){
    if(row){
      this.errorsMap.delete(row)
    }else{
      this.errorsMap.clear()
    }
    this.errorDetail = this.errorsMap.values[0]
  }

  getRowSummary(row){
    let ret = []
    this.columnDef.filter(c=>Object.keys(row).includes(c.id) && c.id !=this.rowDetailCfg.parentRowKey).forEach(def=>{
      ret.push({
        label : def['title'] , 
        value : def['type'] == 'dropdown' ?  this.dataSrv.getDropListDesc(def['options'], row[def['id']]) : row[def['id']]?.toString() 
      })
    })
    return ret
  }

  setNewRowError(message){
    //pending : set red border for uc
    this.newRowError = {message : message}
  }

  setAnimatedBackground(row, columnId){
    let tmp = this.animatedBgMap.get(row) ?  this.animatedBgMap.get(row) : {}
    tmp[columnId] = true
    this.animatedBgMap.set(row , tmp)
    setTimeout(()=>{
      this.animatedBgMap.delete(row )
    },1250)
  }

  emitValueChange(evt){
    this.clearErrorState()
    this.valueChange.emit(evt)
  }

  validate(){
    let ret = true
    if(!this.validateDropdowns()){
      ret =  false
    }
    if(!ret){
      this.uiSrv.showMsgDialog('Invalid row(s) found')
    }
    return ret
  }

  validateDropdowns(){
    let dropdownCols = this.columnDef.filter(c=> c.type == 'dropdown' && c.options)
    let ret = true
    dropdownCols.forEach(c=>{
      for(let i = 0 ; i < this.data.length ; i ++){
        let value = this.data[i][c.id]
        if( value !== null && !c.options.map(o=>o['value']).includes(value)){
          this.setErrors(i,c.id , this.uiSrv.translate(this.dataNotFoundMsg))
          ret = false
          return
        }
      }
    })
    return ret
  }

  // setDropdownOptions(options , row , id ){
  //   if(row == this.focusedCell?.row){
  //     this.focusedCell.options = options
  //   }else if(row == this.newRow){
  //     this.columnDef.filter(c=>c.id == id)[0]['newRow']['options'] = options
  //   }
  // }

}

export class listViewFocusChangeEvent{
  options
  row
  id
  originalValue
  disabled
}


@Pipe({ name: 'rowDetailToolTip' })
export class rowDetailToolTipPipe implements PipeTransform {
  transform(details: object[], labelKey, valueKey, resource = null): string {
    let translate = (value) => {
      return value && resource?.[value] ? resource[value] : value;
    }
    let getConvertedValue = (value, struct: ActionParameter) => {
      if (struct?.enumList.length > 0) {
        let ret = struct?.enumList.filter(itm => itm.value == value)[0]?.label
        return ret ? ret : value
      } else if (struct?.parameterType == 'BOOLEAN') {
        return translate((value == "true" || value == true) ? 'Yes' : 'No')
      } else {
        return value
      }
    }
    return details?.filter(d => ![null, undefined].includes(d[valueKey])).map(d => `${translate(d[labelKey])} : ${getConvertedValue(d[valueKey], d['struct'])}`).join("\n")
  }
} 
