import { Component, OnInit, ViewChild, ElementRef , Input , Output , EventEmitter} from '@angular/core';
import { NgPixiViewportComponent, PixiGraphics } from 'src/app/utils/ng-pixi/ng-pixi-viewport/ng-pixi-viewport.component';
import { PixiCircle } from '../drawing-board/drawing-board.component';



@Component({
  selector: 'uc-workflow-designer',
  templateUrl: './workflow-designer.component.html',
  styleUrls: ['./workflow-designer.component.scss']
})
export class WorkflowDesignerComponent implements OnInit {
  flowchart
  @ViewChild(NgPixiViewportComponent) public _ngPixi: NgPixiViewportComponent;
  @ViewChild('container') container 
  @Input() newNode
  @Output() newNodeChange = new EventEmitter()
  constructor() { }

  ngOnInit(): void {

  }
  
  ngAfterViewInit(): void {
    
  }

  onViewportMouseUp(event){
    if(this.newNode){
      this._ngPixi.viewport.addChild(new PixiCircle())
    }
    this.newNode = null
  }

}

export class FlowChartPixiGraphics extends PixiGraphics{

}

export class ExpressionNode extends FlowChartPixiGraphics{
  results : any[]
}

export class Connection extends FlowChartPixiGraphics{
  fromNode : FlowChartPixiGraphics
  toNode : FlowChartPixiGraphics
  tag
}

export class StatmentNode extends FlowChartPixiGraphics{
  
}

