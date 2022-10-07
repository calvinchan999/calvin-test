import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DataService } from 'src/app/services/data.service';
import { RvHttpService } from 'src/app/services/rv-http.service';
import { UiService } from 'src/app/services/ui.service';
import { GeneralUtil } from 'src/app/utils/general/general.util';
@Component({
  selector: 'app-arcs-setup-export-map',
  templateUrl: './arcs-setup-export-map.component.html',
  styleUrls: ['./arcs-setup-export-map.component.scss']
})
export class ArcsSetupExportMapComponent implements OnInit {
  frmGrp = new FormGroup({
    robotCode: new FormControl(null, Validators.required),
    mapCode: new FormControl(null, Validators.required),
  })
  constructor() { }

  ngOnInit(): void {
  }

}
