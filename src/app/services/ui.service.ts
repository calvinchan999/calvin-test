import { Component, Injectable, NgZone, Pipe, PipeTransform } from '@angular/core';
import { DialogRef, DialogService, WindowRef, WindowService } from '@progress/kendo-angular-dialog';
import {MatIconModule} from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { AsyncSubject, BehaviorSubject, Subject } from 'rxjs';
import { NotificationService } from "@progress/kendo-angular-notification";
import { DomSanitizer } from '@angular/platform-browser';
import { DrawingBoardComponent, PixiCommon } from '../ui-components/drawing-board/drawing-board.component';
import { filter, skip, take, takeUntil } from 'rxjs/operators';
import { DatePipe } from '@angular/common'
import { environment } from 'src/environments/environment';
import { Title } from '@angular/platform-browser';
import { DataService } from '@progress/kendo-angular-dropdowns';

export const  dataNotFoundMessage = `[DATA NOT FOUND]`

@Injectable({
  providedIn: 'root'
})
export class UiService {
  public withDashboard = false
  public taskOverlay = false
  refreshDrawerItems = new BehaviorSubject<any>(null)
  loadingTickets = []
  loaderStyle = {
    type: "infinite-spinner",
    themeColor: "secondary",
    size: "large",
  }
  constructor(public dialogSrv: DialogService, public windowSrv : WindowService, private http: HttpClient ,public ngZone: NgZone,private notificationService: NotificationService , private titleSrv: Title , public datePipe : DatePipe) { 
    this.isTablet = this.detectMob() && environment.app.toUpperCase() == 'STANDALONE'
    this.titleSrv.setTitle(this.translate(environment.app.toUpperCase() == 'STANDALONE' ? "RV Robotic System" : "ARCS"))
    // if(this.isTablet){
    //   this.fullScreen()
    // } 
     this.initNotification()
  }
  public isTablet = false
  public langPack = { }
  public langOptions = [{text:'English' , value:'EN'} ,{text:'繁體中文',value :'ZH'}]
  public get selectedLangOption(){
    return this.langOptions.filter(o=>o['value'] == this.lang.value.toUpperCase())[0]
  }
  public lang = new BehaviorSubject<string>('EN')
  public loadingShadeZindex = 999999
  public drawingBoardComponents : DrawingBoardComponent[]  = []
  public dataSrv 


  initNotification(){
    Notification.requestPermission((status) =>{})      
  }

  showBrowserPopupNotification(msg : string , onlyIfAppIsNonActiveTab = true){
    if(onlyIfAppIsNonActiveTab && ! document.hidden){
      return
    }
    if(Notification.permission === "granted"){
     new Notification(msg , { icon: './assets/rvicon.png' , requireInteraction: true , body : this.datePipe.transform(new Date(),'hh:mm:ss aa') });
    }else{
     this.initNotification()
    }
  }

  detectMob() {
    const toMatch = [
        /Android/i,
        /webOS/i,
        /iPhone/i,
        /iPad/i,
        /iPod/i,
        /BlackBerry/i,
        /Windows Phone/i
    ];
    
    return toMatch.some((toMatchItem) => {
        return navigator.userAgent.match(toMatchItem);
    });
  }

  loadAsyncBegin(zIndex = null) {
    this.loadingShadeZindex = zIndex != null ? zIndex : this.loadingShadeZindex
    let ticket = new Object()
    this.loadingTickets.push(ticket)
    return ticket
  }
  
  loadAsyncDone(ticket: object , zIndex = null) {
    this.loadingTickets = this.loadingTickets.filter(t => t != ticket)
    this.loadingShadeZindex = zIndex != null ? zIndex : this.loadingShadeZindex
  }

  awaitSignalRBegin(signalRsubj:Subject<any> , criteria = undefined){
    let ticket = this.loadAsyncBegin()
    signalRsubj.pipe(skip(1), filter(v=>criteria === undefined || criteria == v || Object.keys(criteria).every(k=>criteria[k] === v[k])), take(1)).subscribe(()=>{
      this.loadAsyncDone(ticket)
    })
  }

  async showOkDialog(msg, title = ''){
    return this.showMsgDialog(msg, title , ['OK'],  "notification")
  }


  async showWarningDialog(msg, title = '' , translate = true){
    msg = translate ? this.translate(msg) : msg
    return this.showMsgDialog(msg, title , ['OK'],  "warning")
  }

  async showMsgDialog(msg, title = '', buttons = ['OK'] , customClass = null , translate = true) {
    return this.ngZone.run(async()=>{
      let ret = this.openKendoDialog({
        title: title,
        content: MsgDialogContent,
        actions: buttons.map(b => { return { text: b, index: buttons.indexOf(b) } })
      });
      const content = ret.content.instance;
      content.msg = translate ? this.translate(msg) : msg;
      content.customClass = customClass
      return ret.result.toPromise()
    })
   
    //   const dialogRef = this.dialog.open(MsgDialogContent , {
    //       data: {
    //         icon: icon,
    //         msg : msg,
    //         iconColor : iconColor,
    //         title : title,
    //         buttons : buttons.map(b => { return { text: b , index : buttons.indexOf(b) } })
    //       }
    //     });
    //     return dialogRef.afterClosed().toPromise();
    //   }
  }
  

  async showConfirmDialog(msg, title = '', buttons = ['Yes' , 'No'] , translate = true) {
    msg = translate? this.translate(msg) : msg
    buttons = buttons.map(b=>this.translate(b))
    return this.ngZone.run(async()=>{
      let result = await this.showMsgDialog(msg, title , buttons, "confirm")
      return result['index'] == 0
    })
  }

  openKendoDialog(arg){
    let dialog : DialogRef = this.dialogSrv.open(arg);
    let suspendedPixis = this.suspendBackgroundPixis()
    dialog.result.subscribe(() => {
      suspendedPixis.forEach((orginalSuspended, component) => {
        if (component) {
          component.suspended = orginalSuspended
        }
      })
    })
    return dialog
  }

  suspendBackgroundPixis() {
    let ret = new Map()
    this.drawingBoardComponents.forEach(comp=>{
      ret.set(comp , comp.suspended)
      comp.suspended = true
    })
    return ret
  }

  overlayActivated(el = null){
    return Array.from((el? el : document).getElementsByClassName('k-overlay')).length > 0
  }

  isInsideElement(el, x, y){
    let rect = el.getBoundingClientRect()
    return rect.bottom > y &&  rect.top < y &&  rect.left < x && rect.right > x
  }

  async changeLang(lang){
    // let ticket = this.loadAsyncBegin()
    this.langPack = <any> (await this.http.get('assets/resources/labels/' + lang.toLowerCase() + '.json').toPromise());
    this.lang.next(lang)  
    localStorage.setItem("lang",lang)
    this.refreshDrawerItems.next(true)
    // this.loadAsyncDone(ticket)
  }

  translate(value){
    return value && this.langPack[value] ? this.langPack[value] : value;
  }
  

  public showNotificationBar(msg, type: 'success' | 'none' | 'warning' | 'info' | 'error' = 'info' , closable = false , translate = false , popWhenResumeFromHidden = false): void {
    if( document.hidden && !popWhenResumeFromHidden){
      return
    }
    this.notificationService.show({
      cssClass: "notification" + (type == 'none' ? '' : (' ' + type)),
      content: translate? this.translate(msg) : msg,
      animation: { type: "slide", duration: 400 },
      position: { horizontal: "center", vertical: "bottom" },
      type: { style: type, icon: true },
      closable: closable,
      hideAfter: 2000,
    });
  }

  // public fullScreen() {
  //   try{
  //     let elem = document.documentElement;
  //     let methodToBeInvoked = elem.requestFullscreen || elem['mozRequestFullscreen'] ||  elem['msRequestFullscreen'];
  //     if (methodToBeInvoked) {
  //       methodToBeInvoked.call(elem);
  //     }
  //   }catch(e){
  //     console.log(e)
  //   }
  // }
}




@Pipe({
  name: 'highlight'
})
export class highlightSearchPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) { }

  transform(value: any, args: any): any {
    if (!args) {
      return value;
    }
    // Match in a case insensitive maneer
    const re = new RegExp(args, 'gi');
    const match = value.match(re);

    // If there's no match, just return the original value.
    if (!match) {
      return value;
    }

    const replacedValue = args ? value.replace(re, (match) => `<b>${match}</b>`) : value;
    return this.sanitizer.bypassSecurityTrustHtml(replacedValue)
  }
}

@Pipe({name: 'roundDown'})
export class roundDownPipe implements PipeTransform {
    transform(value: number): number {
        return Math.floor(value);
    }
} 

@Pipe({name: 'roundUp'})
export class roundUpPipe implements PipeTransform {
    transform(value: number): number {
        return Math.ceil(value);
    }
} 

@Pipe({name: 'label'})
export class label implements PipeTransform {
    transform(value: string , translateMap : Object): string {
        return value && translateMap[value] ? translateMap[value] : value;
    }
} 

@Pipe({name: 'cssClassName'})
export class cssClassNamePipe implements PipeTransform {
    transform(value: string , prefix : string = '' ): string {
        return value? prefix  + value.toString().toLowerCase().split(" ").join("-").split("_").join("-") : '';
    }
} 


@Pipe({name: 'dropdownDesc'})
export class dropdownDescPipe implements PipeTransform {
    transform(value: string , options  , valueFld = 'value', textFld = 'text' ){
        let matches = (options?options:[]).filter(o=>o[valueFld] == value)
        return value!== null && matches.length == 0 ? false : matches[0]?.[textFld]
    }
} 


@Pipe({name: 'waypointName'})
export class waypointNamePipe implements PipeTransform {
    transform(value: string ): string {
        return value.split('%')[value.split('%').length - 1]
    }
} 

@Pipe({name: 'dateString'})
export class dateStringPipe implements PipeTransform {
    transform(value: string ): Date {        
        return  !value || value == '0001-01-01T00:00:00' ?  null :  new Date(value);
    }
} 




// @Pipe({name: 'format'})
// export class formatPipe implements PipeTransform {
// 	@Inject(LOCALE_ID) public locale: string
// 	transform(value: string, type: string): string {
// 		if (type && type.toUpperCase() == 'D') {
// 			return formatDate(value, "yyyy-MM-dd", this.locale)
// 		} else {
// 			return value
// 		}
// 	}
// }

@Component({
  selector: 'uc-dialog-tpl',
  template: `<div class = "msg-dialog-content" [class]="customClass">
              <span class="mdi k-icon"></span> 
              <div class="message">{{msg}}</div>
             </div>`
})

export class MsgDialogContent{
  customClass 
  msg
  //template: `<h1 *ngIf = "data.title" mat-dialog-title>{{data.title}}</h1>
  //              <div class = "msg-dialog-content">
  //               <mat-icon *ngIf = "data.icon" [style.color] = "data.iconColor">{{data.icon}}</mat-icon> 
  //               <div>{{data.msg}}</div>
  //              </div>
  //              <div *ngIf = "data.buttons && data.buttons.length > 0">
  //               <button mat-button *ngFor = "let button of data.buttons" (click) = "dialogRef.close(button.index)"> {{button.text}} </button>
  //              </div>`
  // constructor( public dialogRef: MatDialogRef<MsgDialogContent>, @Inject(MAT_DIALOG_DATA) public data) {}
}



