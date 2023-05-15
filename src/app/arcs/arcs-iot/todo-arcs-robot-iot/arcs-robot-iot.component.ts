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

@Component({
  selector: 'app-arcs-robot-iot',
  templateUrl: './arcs-robot-iot.component.html',
  styleUrls: ['./arcs-robot-iot.component.scss']
})
export class ArcsRobotIotComponent implements OnInit , OnDestroy {
  @Input() robotId : string
  robotSubj : RobotState
  unsubscriber = new Subject()
  constructor( public robotSrv : RobotService, public uiSrv: UiService , public mqSrv : MqService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
  }

  ngOnInit(): void {
    this.robotSubj = this.robotSrv.robotState(this.robotId)
  }

  ngOnDestroy(){
    this.unsubscriber.next()
  }

}
