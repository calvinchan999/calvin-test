import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';


@Component({
  selector: 'uc-workflow-designer',
  templateUrl: './workflow-designer.component.html',
  styleUrls: ['./workflow-designer.component.scss']
})
export class WorkflowDesignerComponent implements OnInit {
  flowchart
  @ViewChild('container') container 
  constructor() { }

  ngOnInit(): void {

  }
  
  ngAfterViewInit(): void {
    
  }


}
