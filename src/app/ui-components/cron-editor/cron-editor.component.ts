import { Component, EventEmitter, Input, OnInit, Output , OnDestroy } from '@angular/core';
import { UiService } from 'src/app/services/ui.service';
import { isValidCronExpression } from 'cron-expression-validator'
import cronstrue from 'cronstrue'
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { FormControl, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'uc-cron-editor',
  templateUrl: './cron-editor.component.html',
  styleUrls: ['./cron-editor.component.scss']
})
export class CronEditorComponent implements OnInit , OnDestroy{
  _customCron
  @Input() set customCron(v){
    if(v){
      this.ngModel.repeated = "CUSTOM"
    }
    this._customCron = v
  } 
  get customCron(){
    return this._customCron
  } 
  @Output() customCronChange = new EventEmitter()
  @Input() frmGrp = new FormGroup({myControl : new FormControl()})
  @Input() frmCtrl = 'myControl'
  $onDestroy = new Subject()
  dropdownOptions = {
    mode:[
      {value : "/" , text : "Every ..."},
      {value : "" , text : "At Specific Time ..."},
    ],
    repeated:[
      {value : null , text : "One Time Only" },
      {value : "H" , text : "Hourly" },
      {value : "D" , text : "Daily" },
      {value : "W" , text : "Weekly" },
      {value : "CUSTOM" , text : "Custom"}
    ],
    weekday:[
      {value : "MON" , text : "Monday"},
      {value : "TUE" , text : "Tuesday"},
      {value : "WED" , text : "Wednesday"},
      {value : "THU" , text : "Thursday"},
      {value : "FRI" , text : "Friday"},
      {value : "SAT" , text : "Saturday"},
      {value : "SUN" , text : "Sunday"},
    ],
    hour:[],
    minute:[],
  }
  ngModel = {
    mode:"",
    repeated : null,
    at: new Date(1900 , 1 , 1),
    hour : 0 ,
    minute : 0,
    dayOfWeek: this.dropdownOptions.weekday.map(w=>w.value),
    startHour: 0,
    // startMin: null,
    endHour: 23,
    // endMin: null
  }
  weekDayValues = this.dropdownOptions.weekday.map(d=>d.value)
  cronDescription
  range = false
  to = false

  @Input() set value(v){
    this.frmGrp.controls[this.frmCtrl].setValue(v , {emitEvent : false})
  }

  @Output() valueChange = new EventEmitter();
  
  get value():string{
    return  this.frmGrp.controls[this.frmCtrl].value
  }

  myValue = null

  constructor(public uiSrv : UiService, public util : GeneralUtil) { 
  }

  ngOnDestroy(){
    this.$onDestroy.next()
  }

  ngOnInit(): void {
    this.frmGrp.controls[this.frmCtrl].valueChanges.pipe(takeUntil(this.$onDestroy)).subscribe((v)=> setTimeout(()=>{
      if(!v || v == ''){
        this.ngModel.repeated =  null
      }else if(this.customCron){
        this.refreshDescription()
      }else{
        this.parseCron()
      }
    }))
  }

  refreshCron(){
    let oldCustom = this.customCron
    this.customCron = this.ngModel.repeated == "CUSTOM"
    if(oldCustom != this.customCron){
      this.customCronChange.emit(this.customCron)
    }
    if(oldCustom && !this.customCron){
      this.value = '0 0 * ? * *'
    }
    let dayOfWeek = this.ngModel.repeated == "W" && this.ngModel.dayOfWeek && this.ngModel.dayOfWeek.length > 0 ? this.ngModel.dayOfWeek.join(","):'*'    
    let hourRange = this.range ? `${this.util.trimNum(this.ngModel.startHour , 0) }-${this.util.trimNum(this.ngModel.endHour , 0) }`: '0' 
    //let minuteRange = this.ngModel.repeated == 'H' ? `${this.from ? this.util.trimNum(this.ngModel.startMin , 0)  : '0'}${this.to ? '-' + this.util.trimNum(this.ngModel.endMin , 0) : ''}`: '0'
    let hour = this.ngModel.repeated != 'H' ? ( this.ngModel.mode == '/' ? `${hourRange}/${this.ngModel.hour}` : this.ngModel.hour ): (hourRange == '0' ? '*' : hourRange)
    let minute = this.ngModel.mode == '/' && this.ngModel.repeated == 'H' ?  `0/${this.ngModel.minute}` : this.ngModel.minute
    if(this.ngModel.mode == '' && this.ngModel.repeated != 'H' ){
      hour = this.ngModel.at.getHours()
      minute = this.ngModel.at.getMinutes()
    }
    this.value = `0 ${minute ?  minute : 0} ${hour ? hour : 0 } ? * ${dayOfWeek}`
    this.refreshDescription()
  }

  validateCron(){
    return this.value && isValidCronExpression(this.value);
  }

  refreshDescription(){
    try{
      this.cronDescription = cronstrue.toString(this.value)
    }catch{
      this.cronDescription = null
    }
  }

  parseCron() {
    this.refreshDescription()
    // if (this.validateCron()){
    if (this.customCron) { return }
      try{
        let minute = this.value.split(" ")[1]
        let hour = this.value.split(" ")[2]
        let dayOfWeek = this.value.split(" ")[5] 
        this.ngModel.repeated = dayOfWeek != '*' ? 'W' : (hour != '*' && (!hour?.includes("-") || hour?.includes("/")) ? 'D' : 'H')
        this.ngModel.mode = minute.includes("/") || hour.includes("/") ? "/" : ""
        if(this.ngModel.mode == "/" || this.ngModel.repeated == 'H'){
          this.ngModel.minute = Number(minute.split("/")[minute.split("/").length - 1])
          this.ngModel.hour = hour == '*' ? 0 :  Number(hour.split("/")[hour.split("/").length - 1])
          this.ngModel.endHour =  hour.includes("-") ? Number(hour.split("/")[0].split("-")[1]) : null
          // this.ngModel.endMin = this.ngModel.repeated == 'H' && minute.includes("/") && minute.split("/")[0]?.includes("-") ? Number(minute.split("/")[0].split("-")[1]) : null
          this.ngModel.startHour = hour.includes("-") ? Number(hour.split("/")[0].split("-")[0]): null
          // this.ngModel.startMin = this.ngModel.repeated == 'H' && minute.includes("/") ? Number(minute.split("/")[0].split("-")[0]): null
          this.range = hour.includes("-") //this.ngModel.startHour!=null && !(this.ngModel.startHour == 0 && this.ngModel.endHour == null) 
                      // this.ngModel.startMin!=null && !(this.ngModel.startMin == 0 && this.ngModel.endMin == null)
          //this.to = this.ngModel.endHour!=null //|| this.ngModel.endMin!=null
        }else{
          this.ngModel.at = new Date(1900 , 1 , 1 , Number(hour == '*' ? 0 : hour) , Number(minute))
          this.ngModel.minute =  Number(minute)
        }
        this.ngModel.dayOfWeek = dayOfWeek == '*' ?  this.dropdownOptions.weekday.map(w=>w.value) : this.transformDayOfWeek(dayOfWeek.split(","))
      }catch(e){
        console.log("Failed to parse cron Expression : " + this.value)
        console.log(e)
      }
    // }
  }

  transformDayOfWeek(dow : string[]){
    for (let i = 0; i < dow.length; i++) {
      dow[i] = dow[i].split("-").map(d => !isNaN(Number(d)) ? this.weekDayValues[Number(d) - 1] : d).join("-")
      let startIdx = this.weekDayValues.indexOf(dow[i].split("-")[0])
      let endIdx = this.weekDayValues.indexOf(dow[i].split("-")[1])
      if (startIdx != endIdx && startIdx != -1 && endIdx != -1) {
        dow[i] = this.weekDayValues.filter(wd => startIdx < endIdx ?
          this.weekDayValues.indexOf(wd) >= startIdx && this.weekDayValues.indexOf(wd) <= endIdx :
          this.weekDayValues.indexOf(wd) >= startIdx || this.weekDayValues.indexOf(wd) <= endIdx).join(",")
      }
    }

    dow = dow.join(",").split(",")
    // if(!getSeparated){
    //   for(let i = 0 ; i < dow.length; i++) {
    //     let startIdx = 
    //   }
    // }

    return dow
  }
}



// validateCron(){
//   return this.value && isValidCronExpression(this.value);
//   // let splitedString =  this.value.split(" ")
//   // let minuteString = splitedString?.[1]
//   // let hourString = splitedString?.[2]
//   // let minuteRange = minuteString?.split("-")
//   // let hourRange =  hourString?.split("-")
//   // let validRanges = (!minuteString?.includes("-") || minuteRange?.length == 2) && (!minuteString?.includes("-") || hourRange?.length == 2)
//   // let combinations = minuteRange.map((m)=>{
//   //   let ret = splitedString.slice()
//   //   ret[1] = m
//   //   return ret.join(" ")
//   // }).concat(
//   //     hourRange.map((h)=>{
//   //       let ret = splitedString.slice()
//   //       ret[2] = h
//   //       return ret.join(" ")
//   //   })
//   // )
//   // let validationResults = [this.value].map(c=> isValidCronExpression(c , {error: true}))
//   // //let validCron = validationResults.every(r => r?.isValid != false) // && ![minute, hour].some(token => (isNaN(Number(token)) && !["*", "-"].some(symbol => token.includes(symbol))))
//   // let invalidCron = validationResults.filter(r=>r?.isValid == false)?.[0]
//   // this.frmGrp.controls[this.frmCtrl].setErrors(!this.value || this.value.length == 0 || invalidCron?
//   //                                               { message: Array.isArray(invalidCron.errorMessage) ? [... invalidCron.errorMessage]?.[0] : invalidCron.errorMessage} : 
//   //                                                null)
//   // return this.value && [null , undefined].includes(invalidCron) && validRanges;
// }
