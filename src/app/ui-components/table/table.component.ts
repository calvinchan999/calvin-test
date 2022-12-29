import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild ,AfterViewInit , OnDestroy} from '@angular/core';
import { DataStateChangeEvent, GridComponent, RowArgs, SelectableSettings ,GridDataResult, SinglePopupService, PopupCloseEvent} from '@progress/kendo-angular-grid';
import { process, State } from '@progress/kendo-data-query';
import { AuthService } from 'src/app/services/auth.service';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import {distinct,filterBy,FilterDescriptor} from "@progress/kendo-data-query";
import { FilterService } from "@progress/kendo-angular-grid";
import { PopupSettings } from "@progress/kendo-angular-dateinputs";
import { addDays } from "@progress/kendo-date-math";
import { Subscription ,Subject} from "rxjs";
import { takeUntil , filter } from "rxjs/operators";

@Component({
  selector: 'uc-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss']
})
export class TableComponent implements OnInit {
  constructor(public uiSrv: UiService, public elRef : ElementRef, private changeDetector : ChangeDetectorRef ,
              public httpSrv: RvHttpService , private dataSrv : DataService , public authSrv : AuthService) { }
  @ViewChild('kGrid') kGrid : GridComponent
   myData = []
  @Input() serverSidePagination = false
  @Input() customButtons: { id: string, label: string, disabled: boolean, icon: string }[] = []
  @Input() set data(v){
    this.myData = v
    this.dataChange.emit(this.data)
  }
   get data(){
    return this.myData
  }
  @Output() dataChange : EventEmitter<any> = new EventEmitter()
  @Input() columnDefs = []
  @Input() useColumnFilter = false
  @Input() showToolbar = true
  @Output() cellClick : EventEmitter<any> = new EventEmitter()
  @Output() createClick :  EventEmitter<any> = new EventEmitter()
  @Output() actionClick :  EventEmitter<any> = new EventEmitter()
  @Output() customButtonClick :  EventEmitter<any> = new EventEmitter()
  @Input() toolbarButtons = {
    new : false,
    action : false
  }
  @Input() disabledButtons = {
    new : false,
    action : false
  }
  @Input() groupable = false
  @Input() reorderable = true
  @Input() resizable = true
  @Input() sortable = true
  @Input() pageable = true
  @Input() filterable = true
  @Input() selectFieldId = 'select'
  @Input() selectedData = []
  @Output() selectedDataChange : EventEmitter<any> = new EventEmitter()
  @Input() isLoading
  @Input() rowsReorderable = false
  @Input() total = 0
  @Output() totalChange : EventEmitter<any> = new EventEmitter()
  @Output() dataStateChange : EventEmitter<any> = new EventEmitter()
  @Input() public defaultPageSize = 15
  @Input() functionId = null

  public buttonCount = 5;
  public info = true;
  public pageSizes = [5,10,15,20,50,100];
  public previousNext = true;
  public position = "bottom";
  public mySelection = []
  public selectableSettings: SelectableSettings = {enabled : false};
  public isRowSelected = (e: RowArgs) => this.selectedData.includes(e.dataItem)
  public state: DataStateChangeEvent = {skip: 0 , take: this.defaultPageSize};
  @Input() defaultState: DataStateChangeEvent = null;
  fixedColumnWidth = 45
  flexTableWidth = null
  columnTtlWidth = 0
  containerWidth
  @Input() dataSourceApiEndpoint
  //PENDING : get title from langPack , refresh columnDef on lang change

  accessObj = {
    edit : false,
    delete : false,
    add : false
  }

  allActions = [
    {text : 'Delete' , actionId : 'delete'}
  ]

  actions = []
  fullData = []
  $onDestroy = new Subject()

  public filter: CompositeFilterDescriptor = { logic: "and", filters: [] };

  public filterChange(filter: CompositeFilterDescriptor): void {
    this.filter = filter;
  }

  ngOnInit(): void {
    this.resetState()
    this.getAccessObj()
    this.uiSrv.lang.pipe(filter(v => v != null), takeUntil(this.$onDestroy)).subscribe(l => {
      this.actions.forEach(a => a.text = this.uiSrv.translate(this.allActions.filter(a2=>a2.actionId == a.actionId)[0]?.text))
      this.actions = JSON.parse(JSON.stringify(this.actions))
    })
  }  

  ngOnChanges(evt){  
    if(Object.keys(evt).includes('data') || Object.keys(evt).includes('selectFieldId') ){
      this.refreshSelectedData()
    }
    if(Object.keys(evt).includes('columnDefs')){
      this.getAccessObj()
      if(this.functionId){
        this.columnDefs.filter(c=> c.id == 'edit' && !this.accessObj.edit).forEach((c)=>{
          c.icon = 'k-icon mdi mdi-text-box-search-outline'
          // c.id = 'view'
        })
      }
      this.columnDefs.filter(c =>c['fixed']).forEach(c=>c['width'] = this.fixedColumnWidth)
      this.autoFitColumns(true)
      this.refreshTableWidth()
      this.resetState()
      this.retrieveData()
    }
  }

  ngDoCheck(){
    this.refreshTableWidth()
  }

  getAccessObj(){
    if(this.functionId != null){
      Object.keys(this.accessObj).forEach(k=>{
        this.accessObj[k] = this.authSrv.userAccessList.includes((this.functionId + '_' + k).toUpperCase())
        this.actions = this.allActions.filter(a=> this.accessObj[a.actionId])
      })
    }else{
      this.actions = this.allActions
    }
  }

  resetState(){
    this.state = this.defaultState ? JSON.parse(JSON.stringify(this.defaultState)) : {
      sort:[],
      skip: 0,
      take: this.defaultPageSize,
      filter: {
        logic: 'and',
        filters: []
      }
    };
  }

  autoFitColumns(forceUpdate = false){
    let fixedWidth = this.getTtlFixedWidth()
    let orgTtl = this.getColDefFlexTtlWidth()
    let targetTtl = this.getContainerWidth() - fixedWidth
    if([targetTtl , orgTtl ].every(w=> !isNaN(Number(w)) && w > 0) && (targetTtl!=this.flexTableWidth || forceUpdate) && this.columnDefs){
      this.columnDefs.forEach(c=>c['width'] =  c['fixed'] ?this.fixedColumnWidth : c['width'] * targetTtl /orgTtl)
      this.flexTableWidth = targetTtl
    }
  }

  refreshColDefsWidth(evt = null){
    if(this.kGrid){
      this.columnDefs.filter(c=>c['id']).forEach(c=>{
        let comp = this.kGrid.columnList.toArray().filter(comp=>comp['field'] == c['id'])[0]
        c['width'] = c['fixed'] || !comp ? this.fixedColumnWidth : comp.width
      })
    }
  }

  refreshTableWidth(forceUpdate = false){   
    let newContainerWidth = this.getContainerWidth()
    if( this.containerWidth != newContainerWidth && newContainerWidth){
      let fixedWidth = this.getTtlFixedWidth() 
      let orgWidth = (this.containerWidth - fixedWidth)
      let orgTtl = this.getColDefFlexTtlWidth()
      let newWidth = (newContainerWidth - fixedWidth) * ( orgWidth ? orgTtl/orgWidth: 1)
      this.columnDefs.filter(c =>!c['fixed']).forEach(c=>c['width'] = c['width'] * newWidth / orgTtl)
      this.containerWidth = newContainerWidth
      this.changeDetector.detectChanges()
    }
  }

  getContainerWidth(){
    return this.kGrid?.wrapper.nativeElement.offsetWidth
  }

  getTtlFixedWidth(){
    return 12 + this.fixedColumnWidth *  this.columnDefs.filter(c =>c['fixed']).length
  }

  getColDefFlexTtlWidth(){
    return this.columnDefs.filter(c =>!c['fixed'] && !isNaN(Number(c['width']))).map(c => Number(c['width'])).reduce((acc, inc) => acc + inc, 0)
  }
  

  toggleAllCheckbox(columnId , evt ){
   let checked = evt.target.checked
   this.data.forEach(r=>r[columnId] = checked)
   this.refreshSelectedData()
  }

  refreshSelectedData(){
    this.selectedData = this.data.filter(r=>r[this.selectFieldId] == true)
    this.selectedDataChange.emit(this.selectedData)
  }

  async retrieveData(evt = this.state){
    let orgEndpoint = this.dataSourceApiEndpoint
    if(this.dataSourceApiEndpoint){
      this.isLoading = true
      let resp = await this.httpSrv.getWithTotalCount(this.dataSourceApiEndpoint + this.dataSrv.getUrlQueryParam(evt))
      this.isLoading = false
      //this.loadData(resp , resp.length)
      if(orgEndpoint == this.dataSourceApiEndpoint){//tabs & dataSourceApiEndpoint may be changed by user during await of response
        this.loadData(resp.data , resp.total)
      }
    }
  }

  loadData(data , total){
    this.data = data
    this.total = total
    if(!this.serverSidePagination){
      this.fullData = JSON.parse(JSON.stringify(data))
      this.kendoDataProcessing()
    }
  }

  kendoDataProcessing() {
    let result = process(this.fullData, this.state)
    this.data = result.data
    this.total = result.total
    this.changeDetector.detectChanges()
  }

}




/**
 * NOTE: Interface declaration here is for demo compilation purposes only!
 * In the usual case include it as an import from the data query package:
 *
 * import { CompositeFilterDescriptor } from '@progress/kendo-data-query';
 */
interface CompositeFilterDescriptor {
  logic: "or" | "and";
  filters: Array<any>;
}

@Component({
  selector: "multicheck-filter",
  template: `
    <ul>
      <li *ngIf="showFilter">
        <input
          class="k-textbox k-input k-rounded-md"
          (input)="onInput($event)"
        />
      </li>
      <li
        #itemElement
        *ngFor="let item of currentData; let i = index"
        (click)="onSelectionChange(valueAccessor(item), itemElement)"
        [ngClass]="{ 'k-selected': isItemSelected(item) }"
      >
        <input
          type="checkbox"
          #notification
          kendoCheckBox
          [checked]="isItemSelected(item)"
        />
        <kendo-label
          class="k-checkbox-label"
          [for]="notification"
          [text]="textAccessor(item) | label : uiSrv.langPack "
        ></kendo-label>
      </li>
    </ul>
  `,
  styles: [
    `
      ul {
        list-style-type: none;
        height: 200px;
        overflow-y: scroll;
        padding-left: 0;
        padding-right: 12px;
      }

      ul > li {
        padding: 8px 12px;
        border: 1px solid rgba(0, 0, 0, 0.08);
        border-bottom: none;
      }

      ul > li:last-of-type {
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
      }

      .k-checkbox-label {
        pointer-events: none;
      }
    `,
  ],
})
export class MultiCheckFilterComponent implements AfterViewInit {
  @Input() public isPrimitive: boolean;
  @Input() public currentFilter: CompositeFilterDescriptor;
  @Input() public data;
  @Input() public textField;
  @Input() public valueField;
  @Input() public filterService: FilterService;
  @Input() public field: string;
  @Output() public valueChange = new EventEmitter<number[]>();
  constructor(public uiSrv : UiService){

  }

  public currentData: unknown[];
  public showFilter = true;
  private value: unknown[] = [];

  public textAccessor = (dataItem: unknown): string =>
    this.isPrimitive ? dataItem : dataItem[this.textField];
  public valueAccessor = (dataItem: unknown): unknown =>
    this.isPrimitive ? dataItem : dataItem[this.valueField];

  public ngAfterViewInit(): void {
    this.currentData = this.data;
    this.value = this.currentFilter.filters.map(
      (f: FilterDescriptor) => f.value
    );

    this.showFilter =  typeof this.textAccessor(this.currentData[0]) === "string";
  }

  public isItemSelected(item: unknown): boolean {
    return this.value.some((x) => x === this.valueAccessor(item));
  }

  public onSelectionChange(item: unknown, li: HTMLLIElement): void {
    if (this.value.some((x) => x === item)) {
      this.value = this.value.filter((x) => x !== item);
    } else {
      this.value.push(item);
    }

    this.filterService.filter({
      filters: this.value.map((value) => ({
        field: this.field,
        operator: "eq",
        value,
      })),
      logic: "or",
    });

    this.onFocus(li);
  }

  public onInput(e: Event): void {
    this.currentData = distinct(
      [
        ...this.currentData.filter((dataItem) =>
          this.value.some((val) => val === this.valueAccessor(dataItem))
        ),
        ...filterBy(this.data, {
          operator: "contains",
          field: this.textField,
          value: (e.target as HTMLInputElement).value,
        }),
      ],
      this.textField
    );
  }

  public onFocus(li: HTMLLIElement): void {
    const ul = li.parentNode as HTMLUListElement;
    const below =
      ul.scrollTop + ul.offsetHeight < li.offsetTop + li.offsetHeight;
    const above = li.offsetTop < ul.scrollTop;

    // Scroll to focused checkbox
    if (above) {
      ul.scrollTop = li.offsetTop;
    }

    if (below) {
      ul.scrollTop += li.offsetHeight;
    }
  }
}


/**
 * NOTE: Interface declaration here is for demo compilation purposes only!
 * In the usual case include it as an import from the data query package:
 *
 * import { CompositeFilterDescriptor } from '@progress/kendo-data-query';
 */
interface CompositeFilterDescriptor {
  logic: "or" | "and";
  filters: Array<any>;
}

const closest = (
  node: HTMLElement,
  predicate: (node: HTMLElement) => boolean
): HTMLElement => {
  while (node && !predicate(node)) {
    node = node.parentNode as HTMLElement;
  }

  return node;
};

@Component({
  selector: "date-range-filter",
  template: `
    <div class="k-form">
      <label class="k-form-field">
        <uc-date-input lab="After"  [value] = "start"  (valueChange)="onStartChange($event)"  [popupSettings]="popupSettings"></uc-date-input>
      </label>
      <label class="k-form-field">
        <uc-date-input lab="Before" [value] = "end"  (valueChange)="onEndChange($event)"  [popupSettings]="popupSettings"></uc-date-input>
      </label>
    </div>
  `,
  styles: [
    `
      .k-form {
        padding: 5px;
      }
    `,
  ],
})
export class DateRangeFilterComponent implements OnInit, OnDestroy {
  @Input() public filter: CompositeFilterDescriptor;
  @Input() public filterService: FilterService;
  @Input() public field: string;

  public start: Date ;
  public end: Date ;

  public get min(): Date {
    return this.start ? addDays(this.start, 1) : null;
  }

  public get max(): Date {
    return this.end ? addDays(this.end, -1) : null;
  }

  public popupSettings: PopupSettings = {
    popupClass: "date-range-filter",
  };

  private popupSubscription: Subscription;

  constructor(
    private element: ElementRef,
    private popupService: SinglePopupService
  ) {
    // Handle the service onClose event and prevent the menu from closing when the datepickers are still active.
    this.popupSubscription = popupService.onClose.subscribe(
      (e: PopupCloseEvent) => {
        if (
          document.activeElement &&
          closest(
            document.activeElement as HTMLElement,
            (node) =>
              node === this.element.nativeElement ||
              String(node.className).indexOf("date-range-filter") >= 0
          )
        ) {
          e.preventDefault();
        }
      }
    );
  }

  public ngOnInit(): void {
    this.start = this.findValue("gte");
    this.end = this.findValue("lte");
  }

  public ngOnDestroy(): void {
    this.popupSubscription.unsubscribe();
  }

  public onStartChange(value: Date): void {
    this.filterRange(value, this.end);
  }

  public onEndChange(value: Date): void {
    this.filterRange(this.start, value);
  }

  private findValue(operator) {
    const filter = this.filter.filters.filter(
      (x) =>
        (x as FilterDescriptor).field === this.field &&
        (x as FilterDescriptor).operator === operator
    )[0];
    return filter ? (filter as FilterDescriptor).value : null;
  }

  private filterRange(start, end) {
    const filters = [];

    if (start && (!end || start < end)) {
      filters.push({
        field: this.field,
        operator: "gte",
        value: start,
      });
      this.start = start;
    }

    if (end && (!start || start < end)) {
      filters.push({
        field: this.field,
        operator: "lte",
        value: end,
      });
      this.end = end;
    }

    this.filterService.filter({
      logic: "and",
      filters: filters,
    });
  }
}
    //
    // if(evt){
    //   let def = this.columnDefs.filter(d=>d['id'] == evt[0].column.field)[0]
    //   def.width = def['width'] * evt[0].newWidth / evt[0].oldWidth      
    // }
    // let fixedWidth = 6 + this.fixedColumnWidth *  this.columnDefs.filter(c =>c['fixed']).length
    // let oldTtl = this.columnDefs.filter(c =>!c['fixed'] && !isNaN(Number(c['width']))).
    //                              map(c => Number(c['width'])).
    //                              reduce((acc, inc) => acc + inc, 0) - fixedWidth
    // let newTtl = this.kGrid?.wrapper.nativeElement.getElementsByTagName("TABLE")[0].offsetWidth  - fixedWidth
    // if(!isNaN(Number(newTtl))){
    //   this.columnDefs.filter(c =>!c['fixed']).forEach(d=>{
    //     d['width'] = d['fixed']? this.fixedColumnWidth : d['width'] * newTtl / oldTtl
    //   })
    // }