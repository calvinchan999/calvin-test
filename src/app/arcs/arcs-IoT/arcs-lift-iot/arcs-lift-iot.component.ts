import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ARCS_STATUS_MAP, DataService, DropListRobot, RobotDetailARCS, signalRType } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';

@Component({
  selector: 'app-arcs-lift-iot',
  templateUrl: './arcs-lift-iot.component.html',
  styleUrls: ['./arcs-lift-iot.component.scss']
})
export class ArcsLiftIotComponent implements OnInit {
  liftId
  floorPlanFloor
  @Input() @HostBinding('class') customClass = 'iot-lift';

  constructor(public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
  
  }

  ngOnInit(): void {

  }

}
