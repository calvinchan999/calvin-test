import { Component, OnInit , Input, HostBinding, ViewChildren, ElementRef } from '@angular/core';
import { List } from '@zxing/library/esm/customTypings';
import { BehaviorSubject , Subject} from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ARCS_STATUS_MAP, DataService, DropListRobot, RobotDetailARCS, signalRType } from 'src/app/services/data.service';
import { UiService } from 'src/app/services/ui.service';
import { VideoPlayerComponent } from 'src/app/ui-components/video-player/video-player.component';
import { GeneralUtil } from 'src/app/utils/general/general.util';
@Component({
  selector: 'app-arcs-turnstile-iot',
  templateUrl: './arcs-turnstile-iot.component.html',
  styleUrls: ['./arcs-turnstile-iot.component.scss']
})
export class ArcsTurnstileIotComponent implements OnInit {
  turnstileId
  showDetail = false
  mouseOver = false
  constructor(public uiSrv: UiService , public dataSrv : DataService , public util : GeneralUtil , public elRef : ElementRef) { 
  
  }
  ngOnInit(): void {
  }

}
