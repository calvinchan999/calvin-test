import { Component, ElementRef, ViewChild, Input, Output, AfterViewInit , EventEmitter } from '@angular/core';
import * as nipplejs from 'nipplejs';
import { Observable, fromEvent, BehaviorSubject, combineLatest, Subject } from 'rxjs';
import { takeUntil, tap, switchMap, publishReplay, refCount, take, map, delay, repeat, mergeMap, debounceTime, debounce, filter } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'uc-joystick',
  templateUrl: './joystick.component.html',
  styleUrls: ['./joystick.component.scss']
})
export class JoystickComponent implements AfterViewInit {
  @ViewChild('joystick') joystick: ElementRef;
  @Input() isRemoteController = false
  @Input() remoteControlTurboOn = false
  @Input() options: nipplejs.JoystickManagerOptions;
  @Input() position = {
    left: '50%',
    top: '50%',
    right: null,
    bottom: null,
  }
  // @Input() height 
  // @Input() width 
  @Output() move = new EventEmitter()
  @Output() hold = new EventEmitter()

  moveSubj = new BehaviorSubject(null)
  onDestroy = new Subject()
  // private lastEvent: nipplejs.JoystickOutputData;
  // private refireFrequency: 1000;
  // private lastInterval: any;
  private joystickManager: nipplejs.JoystickManager;

  // joystickStart$ = new Subject<nipplejs.JoystickOutputData>();
  // joystickMove$ = new Subject<nipplejs.JoystickOutputData>();
  // joystickRelease$: Subject<nipplejs.JoystickOutputData> = new Subject<nipplejs.JoystickOutputData>();

  joystricMoveAfterDelay$: Observable<nipplejs.JoystickOutputData>;
  holdCount = 0

  constructor(private dataSrv : DataService , private util : GeneralUtil) { }

  ngAfterViewInit() {
    setTimeout(()=> this.create() , 500) //to fix the wrong position bug. IDK WHY but it's working
    this.moveSubj.pipe(takeUntil(this.onDestroy), filter((v) => v) , debounceTime(20)).subscribe((data) => this.move.emit(data))
  }

  ngOndestroy(){
    this.onDestroy.next()
  }

  getDataObj = (rawData)=>{
    let angle = 90 - rawData.angle.degree
    angle = angle < 0 ? 360 + angle : angle
    let x = rawData.distance * Math.sin(angle/57.2958)
    let y = rawData.distance * Math.cos(angle/57.2958)
    return { angle: angle, distance: rawData.distance , x : x , y : y , holdCount : this.holdCount}
  }

  publishSignalR(updown, leftright) {
    this.dataSrv.signalRSrv.invoke('PublishMQTT' ,['rvautotech/fobo/joystick', JSON.stringify({upDown: updown , leftRight : leftright , turboOn : this.remoteControlTurboOn})]);
  }

  create() {
    this.joystickManager = nipplejs.create({
      zone : this.joystick.nativeElement,
      position: {left:'50px' , top:'50px'},
      mode: 'static'
    });

    // this.joystickManager.on('start',  (evt, nipple) =>  {
    //     this.joystickStart$.next(nipple);
    //   });   
    let interval = null
    let resetInterval = ()=>{
      if(interval){
        clearInterval(interval)
      }
    }

    if(this.isRemoteController){
      let updown = 0;
      let leftright = 0;
      let timer

      this.joystickManager.on('start', (event, nipple) =>{
        timer = setInterval(()=>{
          this.publishSignalR(updown, leftright);
        }, this.util.config.JOYSTICK_REMOTE.PUBLISH_INTERVAL);
      });

      this.joystickManager.on('move', (event, nipple)=> {
        updown = nipple.vector.y
        leftright =  nipple.vector.x * -1
        this.publishSignalR(updown , leftright)
        //TBD : move max value to config
        // let max_linear = this.util.config.JOYSTICK_REMOTE.MAX_LINEAR; // m/s
        // let max_angular = this.util.config.JOYSTICK_REMOTE.MAX_ANGULAR; // rad/s
        // let max_distance = this.util.config.JOYSTICK_REMOTE.MAX_DISTANCE;; // pixels;
        // linear_speed = Math.sin(nipple.angle.radian) * max_linear * nipple.distance/max_distance;
				// angular_speed = -Math.cos(nipple.angle.radian) * max_angular * nipple.distance/max_distance;
      });

      this.joystickManager.on('end', () => {
        if (timer) {
          clearInterval(timer);
        }
        this.publishSignalR(0, 0);
      })

    }else{
      this.joystickManager.on('move', (evt, data) => {   
        let tmp = this.getDataObj(data)
        this.moveSubj.next(tmp)
        resetInterval()
        interval = setInterval(()=>{
          this.holdCount = Math.max( 0 ,  data.distance < 50 ?  (this.holdCount -1) : ( this.holdCount + 1))
          let dataObj = this.getDataObj(data)  
          this.hold.emit(dataObj)
        }, 100)
        // this.joystickMove$.next(data);
      });
  
      this.joystickManager.on('end', (evt, nipple) => {
        this.holdCount = 0
        resetInterval()
      })
    }
    // combineLatest(this.joystickStart$, 
    //               this.joystickMove$
    //                   .pipe(tap(evt => console.log(evt)))
    //              )
    // .pipe(
    //   takeUntil(this.joystickRelease$),
    //   //If you want to repeat the observable then use repeat operator
    //   //repeat()
    // ).subscribe(([start, move]) => {});    
  }
}
