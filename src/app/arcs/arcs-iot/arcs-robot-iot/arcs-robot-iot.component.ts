import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef, OnDestroy } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { ARCS_STATUS_MAP, DropListRobot } from 'src/app/services/data.models';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { MqService } from 'src/app/services/mq.service';
import { RobotService, RobotState } from 'src/app/services/robot.service';
import { ThreejsViewportComponent } from 'src/app/ui-components/threejs-viewport/threejs-viewport.component';

@Component({
  selector: 'app-arcs-robot-iot',
  templateUrl: './arcs-robot-iot.component.html',
  styleUrls: ['./arcs-robot-iot.component.scss']
})
export class ArcsRobotIotComponent implements OnInit , OnDestroy {
  @Input() robotId : string
  @Input() robotType : string
  @Input() robotSubType : string
  robotState : RobotState
  ARCS_STATUS_MAP = ARCS_STATUS_MAP
  threejsElRef : ThreejsViewportComponent

  unsubscriber = new Subject()
  constructor( public robotSrv : RobotService, public uiSrv: UiService , public mqSrv : MqService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
    
  }

  ngOnInit(): void {
    this.robotState = this.robotSrv.robotState(this.robotId)
    this.mqSrv.subscribeMQTTsUntil(<any>['battery' , 'speed' , 'state' , 'arcsRobotDestination'] , this.robotId, this.unsubscriber )
    if(this.robotType?.toUpperCase() == 'PATROL'){
      this.mqSrv.subscribeMQTTUntil( 'ieq', this.robotId , this.unsubscriber )
    }else if((this.robotSubType?.toUpperCase() == 'DELIVERY') || (this.robotSubType?.toUpperCase() == 'CABINET_DELIVERY' || this.robotSubType?.toUpperCase() == 'TRAY_DELIVERY') ){
      this.mqSrv.subscribeMQTTUntil(<any>(this.robotSubType?.toUpperCase() == 'CABINET_DELIVERY' ? 'cabinet'  : 'trayRack' ), this.util.arcsApp ? this.robotId : undefined  , this.unsubscriber)
    }
    // subscribe top module
  }

  ngOnDestroy(){
    this.unsubscriber.next()
  }

}
