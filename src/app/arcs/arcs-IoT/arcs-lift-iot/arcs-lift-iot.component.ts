import { Component, OnInit , ElementRef} from '@angular/core';

@Component({
  selector: 'app-arcs-lift-iot',
  templateUrl: './arcs-lift-iot.component.html',
  styleUrls: ['./arcs-lift-iot.component.scss']
})
export class ArcsLiftIotComponent implements OnInit {
  id
  constructor(public elRef : ElementRef) { }

  ngOnInit(): void {
  }

}
