import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { ARCS_STATUS_MAP, DropListRobot } from 'src/app/services/data.models';
import { MqService } from 'src/app/services/mq.service';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { RobotService } from 'src/app/services/robot.service';

@Component({
  selector: 'app-arcs-lift-iot',
  templateUrl: './arcs-lift-iot.component.html',
  styleUrls: ['./arcs-lift-iot.component.scss']
})
export class ArcsLiftIotComponent implements OnInit {
  liftCode
  floorPlanFloor
  @Input() @HostBinding('class') customClass = 'iot-lift';

  constructor( public robotSrv : RobotService, public mqSrv : MqService, public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
  
  }

  ngOnInit(): void {

  }

}
