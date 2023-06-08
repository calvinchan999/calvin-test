import { Component, NgZone, OnInit, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ListViewComponent } from '@progress/kendo-angular-listview';
import { ConfigService } from 'src/app/services/config.service';
import { DataService } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { ListviewComponent, listViewFocusChangeEvent } from 'src/app/ui-components/listview/listview.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { CmTaskJobComponent } from '../cm-task-job.component';

@Component({
  selector: 'app-cm-task-job-action',
  templateUrl: './cm-task-job-action.component.html',
  styleUrls: ['./cm-task-job-action.component.scss']
})

export class CmTaskJobActionComponent implements OnInit {
  @ViewChild('listview') listview : ListviewComponent
  dialogRef 
  parent : CmTaskJobComponent
  gr 
  dropdownData 
  dropdownOptions
  readonly = false
  frmGrp = new FormGroup({
    site: new FormControl(null),
    building: new FormControl(null),
    floorPlanCode: new FormControl(null),
    floorfloorPlanCode:new FormControl(null),
    pointCode:new FormControl(null),
    actionAlias: new FormControl(null),
    lock: new FormControl(''),
    otp: new FormControl(''),
    navigationMode: new FormControl(null),
  })
  locationCode
  actionListDef = []
  

  actionListData : object[] = []
  otherLocationData 
  definedPathUnreachable = false

  actionNewRow = {}

  constructor(public uiSrv: UiService, private ngZone : NgZone , public dataSrv : DataService , public util : GeneralUtil , public configSrv :  ConfigService) { }

  get currLoc(){
    return this.frmGrp.controls['pointCode'].value
  }

  ngOnInit(): void {
    if(this.readonly){
      Object.keys(this.frmGrp.controls).forEach(k => this.frmGrp.controls[k].disable())
    }
    this.otherLocationData = JSON.parse(JSON.stringify(this.parent.jobListData)).filter(r=>!this.actionListData.map(a=>a['seq']).includes(r['seq']));
    ['floorPlanCode' , 'pointCode'].forEach(k => this.actionNewRow[k] = this.frmGrp.controls[k].value)
    this.actionListDef = [
      { id: 'seq', title: '#', width: 5 },
      { id: 'actionAlias', title: 'Action', width: 25 ,type : 'dropdown' , options : this.dropdownOptions['actions'], translateOption : true}, 
      { id: 'navigationMode', title: 'Navigation Mode', width: 25 ,type : 'dropdown' , options : this.dropdownOptions['navigationMode'] , translateOption : true , hidden : this.configSrv.disabledModule_SA.pathFollowing || this.configSrv.dbConfig.DISABLE_PATH_FOLLOWING }, 
      { id: 'orientation', title: 'Orientation', width: 10 ,type : 'checkbox' }, 
      // { id: 'lock', title: 'Lock', width: 25 , type : 'textbox'},
      // { id: 'otp', title: 'OTP', width: 30 , type : 'textbox'},
      { id: 'append' , type: 'button', action:'append' , title: '', width: 5 , class : 'k-icon mdi mdi-plus',
        newRow:{
          id:'empty'
        }
      },
      {
        id: this.parent.actionRowCfg.parentRowKey, type: 'button', action: '', title: 'Parameters', width: 10, class: 'k-icon mdi mdi-text-box-search-outline',
        newRow: {
          id: ''
        }
      },
      { id: 'remove', type: 'button', action: 'remove', title: '', width: 5, class: 'k-icon mdi mdi-close-thick',
        newRow: {
          id: 'add', type: 'button', action: 'add', class: 'k-icon mdi mdi-check-bold'
        }
      }
      // { id: 'remove' , type: 'button', action:'remove' , title: '', width: 5 , class : 'k-icon mdi mdi-close-thick'},
      //add an add button to append new row to next seq of the row?
    ].filter(def =>!['remove' , 'append'].includes(def.id) || !this.parent.readonly)
    this.refreshSeq()    
    // this.refreshNewRow();
  }

  addRow(){
      this.actionNewRow['actionAlias'] = this.actionNewRow['actionAlias'] ? this.actionNewRow['actionAlias'] : null
      let ret = JSON.parse(JSON.stringify(this.actionNewRow));
      ret['seq'] = this.otherLocationData.length + this.actionListData.length + 1
      ret['navigationMode'] =  ret['navigationMode'] ?  ret['navigationMode'] : null
      // if(this.actionListData.length > 0 && this.actionListData[this.actionListData.length - 1]['seq'] + 1 == ret['seq']){
      //   // ret['navigationMode'] = null
      // }
      this.actionListData.push(ret)
      this.actionListData = JSON.parse(JSON.stringify(this.actionListData))
      console.log(     this.actionListData)
      delete this.actionNewRow[this.parent.actionRowCfg.parentRowKey] 
      // this.refreshNewRow()
    
  }

  refreshSeq(){
    let emptySeqRow = this.actionListData.filter(r=>!r['seq'])[0]
    if(emptySeqRow){ //should never be the first row
      // seq + when add new row
      let newSeq = this.actionListData[this.actionListData.indexOf(emptySeqRow) - 1]['seq']  + 1
      emptySeqRow['seq'] = newSeq
      emptySeqRow['floorPlanCode'] = this.frmGrp.controls['floorPlanCode'].value
      emptySeqRow['pointCode'] = this.currLoc
      this.actionListData.filter(r=> r['seq'] >= newSeq && r!= emptySeqRow).forEach(r => r['seq'] += 1);
      this.otherLocationData.filter(r=> r['seq'] >= newSeq).forEach(r => r['seq'] += 1);
    }
    //seq - when delete row
    this.actionListData.forEach(r =>{
      r['pointCode'] = this.currLoc
      r['floorPlanCode'] =  this.frmGrp.controls['floorPlanCode'].value
    })
    // this.otherLocationData.forEach(r => r['location'] = [null, undefined].includes(r['location']) ? this.getPrevLocRow(r)?.['location'] : r['location']);
    let tempData = this.otherLocationData.concat(JSON.parse(JSON.stringify(this.actionListData)))
    tempData.sort((a, b) => a.seq - b.seq)
    tempData.forEach(r => r['seq'] = tempData.indexOf(r) + 1)
    this.actionListData = tempData.filter(r => r['pointCode'] == this.currLoc || (r['pointCode'] == null && this.getPrevLocRow(r)?.['pointCode'] == this.currLoc))
    this.otherLocationData = tempData.filter(r=>!this.actionListData.map(a=>a['seq']).includes(r['seq']))
    // this.actionListData.forEach(r => {
    //   let prevRow = this.actionListData.filter(r2 => r2['seq'] + 1 == r['seq'])[0]
    //   r['navigationMode'] = prevRow ? null : ([null, undefined].includes(r['navigationMode'])? 'AUTONOMY': r['navigationMode'])
    // })
    // this.refreshNewRow()
  }

  async onClose(){
      this.parent.jobListData = this.otherLocationData.concat(JSON.parse(JSON.stringify(this.actionListData)))
      this.parent.jobListData.sort((a, b) => a['seq'] - b['seq'])
      this.parent.initMapViewStepper()
      this.parent.cleanseAllRows()
      this.dialogRef.close() 
  }

  getPrevLocRow(row = null){ // get the lastest action which is at different location & return its row in jobList
    row == this.actionNewRow ? null : row
    let tempData = this.otherLocationData.concat(JSON.parse(JSON.stringify(this.actionListData)))
    tempData.sort((a, b) => a.seq - b.seq)
    tempData.forEach(r=>r['seq'] = tempData.indexOf(r) + 1)
    return tempData.filter(r=> ![null,undefined].includes(r['pointCode']) && (row == null || row['seq'] > r['seq'])).
                    sort((a,b)=>(b['seq'] - a['seq']))[0]
  }

  refreshGridNavigationOption(evt : listViewFocusChangeEvent){
    if(!this.parent.validatePathFollowing){
      return
    }
    // let prevRow = this.getPrevLocRow(evt.row)
    // evt.disabled = this.parent.forceAutoNavigation(this.currLoc, prevRow?.['pointCode'] , this.parent.selectedFloorfloorPlanCode)
  }

  // setColumnDefNewRowProperty(columnId : string, key :string, value :any){
  //   let def = this.actionListDef.filter(c=>c['id'] == columnId)[0]
  //   def['newRow'] = [null , undefined].includes(def['newRow']) ? JSON.parse(JSON.stringify(def)) : def['newRow']
  //   def['newRow'][key] = value
  // }

  // async checkNoChanges(){
  //   return true
  // }
}
  // refreshNewRow(){
  //   // let disabled = false
  //   //  if( this.actionListData.length > 0 && this.actionListData[this.actionListData.length - 1]['seq'] ==  this.otherLocationData.length + this.actionListData.length ){
  //   //   disabled = true
  //   //  this.actionNewRow['navigationMode'] = null
  //   // }else{
  //   //   if (this.definedPathUnreachable) {
  //   //     disabled = true
  //   //     this.actionNewRow['navigationMode'] = 'AUTONOMY'
  //   //   }
  //   // }
  //   // this.setColumnDefNewRowProperty("navigationMode" , "disabled" , disabled) 
  // }
