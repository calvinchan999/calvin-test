import { Component, AfterViewInit, Input, ViewChild, ElementRef, EventEmitter, Injectable, Inject, Output, ChangeDetectorRef, Renderer2, HostListener, NgZone, OnInit , OnDestroy } from '@angular/core';
import * as PIXI from 'pixi.js';
import * as PixiTextInput from 'pixi-text-input';
// import { Pose2D } from 'src/app/models/floor-plan.model';
import { BehaviorSubject, Observable, of, Subject, Subscription, timer } from 'rxjs';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';

import { Bezier} from "bezier-js/dist/bezier.js";
import * as Viewport from 'pixi-viewport';
import {ColorReplaceFilter} from '@pixi/filter-color-replace';
import {GlowFilter} from '@pixi/filter-glow';
import {OutlineFilter} from '@pixi/filter-outline';
import {ColorOverlayFilter} from '@pixi/filter-color-overlay';
import {DropShadowFilter} from '@pixi/filter-drop-shadow';
import {DRAWING_STYLE , PixiGraphicStyle} from './ng-pixi-styling-util'
import { PixiViewport } from './ng-pixi-viewport.component';


export class PixiToolTip extends PIXI.Graphics{
  text : PIXI.Text = new PIXI.Text('' , {fill:"#FFFFFF" , fontSize : 14})
  parent : PixiGraphics
  delay : number | null
  hidden = true
  content : string
  constructor(_parent){
    super()
    this.parent = _parent
    this.addChild(this.text)
  }
  get stage(){
    return this.getViewport()?.parent
  }

  public getViewport(g = this.parent) {
    return g?.children.filter(c=>c instanceof Viewport)[0] ? 
             g?.children.filter(c=>c instanceof Viewport)[0] 
            : (g instanceof Viewport? g : (g.parent ? this.getViewport(<any>g.parent) : null))
  }

  show(content : string , mouseEvt ,position : PIXI.Point ){
    if(!this.stage?.children.includes(this)){
      this.stage.addChild(this)
    }
    this.clear()
    this.content = content
    this.text.text = this.content
    this.position = position? this.stage.toLocal(position) : mouseEvt.data.getLocalPosition(this.stage)
    this.position.y += this.position.y < 40 ? 40 : (-40)
    // this.toolTip.position.x -= this.toolTip.position.x + this.toolTip.width > this.viewport.width ? this.toolTip.width : 0
    this.beginFill(0x000000 , 0.6).drawRoundedRect(-5, - 5,this.width + 10 ,this.height + 10, 3).endFill()
    this.visible = true
    this.hidden = false
  } 

  hide(){
    this.visible = false
    this.delay = null
    this.hidden = true
  }
}
 

export class PixiGraphics extends PIXI.Graphics {
  public type : 'circle' | 'line'| 'curve' | 'dashed_line' | 'polygon' | 'border'
  public dimensionType : '1D' | '2D'
  public style : PixiGraphicStyle
  
  _isRelativeScale
  _refreshScaleSubscription : Subscription

  dataObj
  toolTip? : PixiToolTip
  toolTipDelay = null
  border : PixiBorder

  set isRelativeScale(v){
      if(!this._isRelativeScale && v){
          this._refreshScaleSubscription = this.viewport.zoomed.pipe(filter(v => v != null), takeUntil(this.viewport.onDestroy), debounceTime(25)).subscribe(() => {
              this.refreshScale()
          })
      }else if(this._refreshScaleSubscription && !v){
          this._refreshScaleSubscription.unsubscribe()
      }
      this._isRelativeScale = v
  }
  get isRelativeScale(){
      return this._isRelativeScale
  }
  draggable
  viewport : PixiViewport

  constructor(viewport: PixiViewport) {
      super()
      this.viewport = viewport
  }

  refreshScale(){
      if(this.dimensionType == '1D' && canDraw(this)){
        this.draw(true)
      }else{
        this.scale.set( 1/ ((this.parent? this.parent.scale.x : 1) *   this.viewport.scale.x ))
      }
  } 

  showToolTip(content , evt , position = null , delay = false){
    if(!content || content.length == 0){
      return
    }
    if (delay && this.toolTip.delay == null) {
      this.toolTip.delay = 750
      setTimeout(() => {
        if (this.toolTip.delay!= null) {
          this.toolTip.show(content ,evt , position)
        }
      }, this.toolTip.delay )
    } else if (!delay) {
      this.toolTip.show(content  ,evt , position)
    }    
  }

  hideToolTip(){
    this.toolTip.delay = null
    this.toolTip.hide()
  }
}


export interface Draw{
  draw(clear : boolean) : void
}

export class Pixi1DGraphics extends PixiGraphics {
  public vertices: PIXI.Point[]
  constructor(viewport: PixiViewport) {
    super(viewport)
    this.dimensionType = '1D'
  }

  public getLength() : number { 
    let vertices = this.vertices
    if (this.type == 'curve') {
      return new Bezier(vertices[0].x, vertices[0].y, vertices[3].x, vertices[3].y, vertices[1].x, vertices[1].y, vertices[2].x, vertices[2].y).length()
    } else {
      return Math.hypot(vertices[0].x - vertices[3].x, vertices[0].y - vertices[3].y)
    }
  }
}

export class Pixi2DGraphics extends PixiGraphics {
  public vertices: PIXI.Point[]
  constructor(viewport: PixiViewport) {
    super(viewport)
    this.dimensionType = '2D'
  }
}

function canDraw(graphic: Draw | PIXI.Graphics): graphic is Draw { //magic happens here
  return (<Draw>graphic).draw !== undefined;
}

export class PixiLine extends Pixi1DGraphics implements Draw{
  public type 
  tint
  constructor(viewport : PixiViewport , vertices : PIXI.Point[], style = new PixiGraphicStyle() ){
    super(viewport)
    this.vertices = vertices
    this.style = style
    this.type = 'line'
    this.draw()  
    this.on('added', ()=>this.draw(true))
  }

  draw(clear = false): void {
    if(clear){
      this.clear() //becareful if option argument != null 
    }
    let lineColor = this.tint ? 0xFFFFFF : this.style?.lineColor
    let lineThickness = this.style?.lineThickness / ((this.parent? this.parent.scale.x : 1) * (this.isRelativeScale ? this.viewport.scale.x : 1))
    this.lineStyle(lineThickness, lineColor, this.style?.opacity).
        moveTo(this.vertices[0].x, this.vertices[0].y).lineTo(this.vertices[1].x, this.vertices[1].y);
    this.zIndex = this.style?.zIndex
    this.tint = this.tint ? this.style?.lineColor : this.tint
    // this.vertices = ret.vertices ?  ret.vertices : [p1, p2];
    this.type = this.type ? this.type : 'line'
  }
  // if(masterComponent ){
  //   masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
  //   ret.on('added', ()=>draw(true))
  // }
  // return ret
}

export class PixiDashedLine extends Pixi1DGraphics implements Draw {
  dashLen
  spaceLen
  constructor(viewport: PixiViewport, vertices: PIXI.Point[], style = new PixiGraphicStyle(), dashLen: number = 3, spaceLen: number = 2) {
    super(viewport)
    this.vertices = vertices
    this.dashLen = dashLen
    this.spaceLen = spaceLen
    this.style = style
    this.type = 'dashed_line'
    this.draw()
    this.on('added', () => this.draw(true))
  }

  draw(clear: boolean = false): void {
    if (clear) {
      this.clear() //becareful if option argument != null 
    }
    let lineThickness = this.style.lineThickness / (this.isRelativeScale ?  this.viewport.scale.x  : 1)
    let dashlen = this.dashLen * lineThickness
    let spacelen = this.spaceLen * lineThickness
    let p2 = this.vertices[0] , p1 = this.vertices[1]
    let x = p2.x - p1.x
    let y = p2.y - p1.y
    let hyp = Math.sqrt((x) * (x) + (y) * (y))
    let units = hyp / (dashlen + spacelen)
    let dashSpaceRatio = dashlen / (dashlen + spacelen)
    let dashX = (x/units) * dashSpaceRatio
    let dashY = (y/units) * dashSpaceRatio
    let spaceX = (x/units ) - dashX;
    let spaceY = (y/ units) - dashY;
    let x1= p1.x
    let y1 =p1.y
    this.lineStyle(lineThickness, this.style.lineColor,this.style.opacity)
    this.moveTo(x1 , y1) 
    while(hyp > 0){
      x1 += dashX;
      y1 += dashY;
      hyp -=dashlen;
      if(hyp < 0){
        x1 = p2.x;
        y1 = p2.y
      }
      this.lineTo(x1 , y1)
      x1 += spaceX
      y1 += spaceY
      this.moveTo(x1 , y1)
      hyp -= spacelen
    }
    this.moveTo(p2.x,p2.y)
    this.vertices = this.vertices ? this.vertices : [p1, p2];
  }
}

export class PixiCurve extends Pixi1DGraphics implements Draw{
  controlPoints: PIXI.Point[]
  constructor(viewport : PixiViewport , vertices : PIXI.Point[], style = new PixiGraphicStyle() ){
    super(viewport)
    this.type = 'curve'
    this.style = style
    this.vertices = vertices //[p1, p2 ,cp1, cp2]
    this.controlPoints = [vertices[2] , vertices[3]]
    this.draw()  
    this.on('added', ()=>this.draw(true))
  }

  draw(clear = false){
    if(clear){
      this.clear() //becareful if option argument != null 
    }
    let p1 = this.vertices[0] , p2 = this.vertices[1] , cp1 = this.controlPoints[0] , cp2 = this.controlPoints[1]
    let lineColor = this.tint ? 0xFFFFFF : this.style?.lineColor
    this.lineStyle(this.style.lineThickness / ((this.parent? this.parent.scale.x : 1) * (this.isRelativeScale ? this.viewport.scale.x : 1)), lineColor , this.style.opacity).moveTo(p1.x,p1.y).bezierCurveTo(cp1.x, cp1.y , cp2.x , cp2.y , p2.x , p2.y)
    this.zIndex = this.style.zIndex
    this.tint = this.tint ? this.style.lineColor :  this.tint 
    // this.vertices = this.vertices ?  ret.vertices : [p1, p2 ,cp1, cp2];
  }
  // if(masterComponent ){
  //   masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
  //   ret.on('added', ()=>draw(true))
  // }
  // return ret
}

export class PixiCircle extends Pixi2DGraphics{
  public radius : number
  public center : PIXI.Point
  constructor(p: PIXI.Point, radiusPx = 20, style = null , viewport : PixiViewport = null , isRelativeScale = false){
      super(viewport)
      this.isRelativeScale = isRelativeScale
      this.style = style
      this.lineStyle(style.lineThickness, style.lineColor).beginFill(style.fillColor, style.opacity).drawCircle(p.x, p.y, radiusPx).endFill();
      this.type = 'circle'
      this.center = p
      this.vertices = this.vertices ? this.vertices : [p];
      this.radius = this.radius ? this.radius : radiusPx;
      this.zIndex = style.zIndex;
      this.isRelativeScale = isRelativeScale
  }
}

export class PixiPolygon extends Pixi2DGraphics{
  constructor(viewport : PixiViewport , vertices : PIXI.Point[], style = new PixiGraphicStyle()){
    super(viewport);    
    this.style = style
    this.type = 'polygon'
    this.vertices = vertices;
    this.beginFill(this.style.fillColor, this.style.opacity);
    this.drawPolygon(vertices);
    this.endFill();
  }
 
}

export class PixiBorder extends Pixi2DGraphics implements Draw{
  points : PIXI.Point[]
  parent : Pixi2DGraphics
  constructor( viewport : PixiViewport , _parent :Pixi2DGraphics , _points :  PIXI.Point[] , _lineColor : number | null = null ){
    super(viewport)
    this.type = 'border'
    this.points = _points
    this.parent = _parent
  }
  draw(){
    this.clear()
    let p0 = this.points[this.points.length - 1]
    let style = new PixiGraphicStyle().setProperties({
      baseGraphics : this,
      lineColor : this.style.lineColor , 
      lineThickness : DRAWING_STYLE.lineWidth/(this.parent.scale.x * this.viewport.scale.x)
    })
    // opt.baseGraphics = this
    // opt.lineColor = this.lineColor
    // opt.lineThickness = this.parent.getMasterComponent().lineWidth/(this.parent.scale.x * this.parent.getViewport().scale.x), this.lineColor
    this.lineStyle(style.lineThickness ).moveTo(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y)
    this.points.forEach(p => {
      this.addChild(new PixiDashedLine(this.viewport, [p0, p], style))
      p0 = p
    })
  }
}






  