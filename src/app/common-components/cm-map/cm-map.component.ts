import { ChangeDetectorRef, Component, NgZone, OnInit, ViewChild, HostBinding } from '@angular/core';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import { toODataString } from '@progress/kendo-data-query';
import { filter, take } from 'rxjs/operators';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { Map2DViewportComponent } from 'src/app/ui-components/map-2d-viewport/map-2d-viewport.component';
import { TableComponent } from 'src/app/ui-components/table/table.component';
import { CmMapDetailComponent } from './cm-map-detail/cm-map-detail.component';
import { CmMapFloorplanComponent } from './cm-map-floorplan/cm-map-floorplan.component';

@Component({
  selector: 'app-cm-map',
  templateUrl: './cm-map.component.html',
  styleUrls: ['./cm-map.component.scss']
})
export class CmMapComponent implements OnInit {
@ViewChild('table') ucTableRef : TableComponent
@ViewChild('pixi') pixiElRef: Map2DViewportComponent
@HostBinding('class') customClass = 'setup-map'

  constructor(public windowSrv: DialogService, public uiSrv : UiService , public http: RvHttpService , private changeDectector : ChangeDetectorRef,
              private dataSrv : DataService , private ngZone : NgZone) { }

  ngOnInit(){

  }

}
