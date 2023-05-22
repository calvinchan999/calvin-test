import { Component, AfterViewInit, Input, ViewChild, ElementRef, EventEmitter, Injectable, Inject, Output, ChangeDetectorRef, Renderer2, HostListener, NgZone, OnInit , OnDestroy } from '@angular/core';
import * as PIXI from 'pixi.js';
// import { Pose2D } from 'src/app/models/floor-plan.model';
import { BehaviorSubject, combineLatest, forkJoin, merge, Observable, of, Subject, Subscription, timer } from 'rxjs';
import { debounce, debounceTime, distinctUntilChanged, filter, retry, share, skip, switchMap, take, takeUntil, tap } from 'rxjs/operators';

import { Bezier} from "bezier-js/dist/bezier.js";
import * as Viewport from 'pixi-viewport';
import {ColorReplaceFilter} from '@pixi/filter-color-replace';
import {GlowFilter} from '@pixi/filter-glow';
import {OutlineFilter} from '@pixi/filter-outline';
import {DRAWING_STYLE , PixiGraphicStyle} from './ng-pixi-styling-util'
import { PixiMapViewport } from './ng-pixi-map-viewport';
import { getAngle, getBezierSectionPoints, getOrientation, intersectionsOfCircles } from '../../math/functions';
import { PixiPath, PixiRobotMarker } from './ng-pixi-map-graphics';
import { CLICK_EVENTS, MOVE_EVENTS , CLICK_END_EVENTS } from './ng-pixi-constants';
import { ConvertColorToDecimal } from '../../graphics/style';
import { PixiViewport } from './ng-pixi-base-viewport';
import {GetPixiAngleDescription} from './ng-pixi-functions'



export class PixiToolTip extends PIXI.Graphics implements IDraw{
  drawDone = new EventEmitter()
  pixiText : PIXI.Text = new PIXI.Text('' , {fill:"#FFFFFF" , fontSize : 14})
  parentGraphics : PixiGraphics
  _delay : number  = 500
  mouseOverSubscription : {in :Subscription ,out:Subscription  } 
  set enabled(v){
    if(v && !this.mouseOverSubscription){
      this.mouseOverSubscription = {
        in: this.parentGraphics.events.mouseover.pipe(debounceTime(this._delay)).subscribe(evt => {
          if (this.parentGraphics.isBeingMouseOvered && !this.parentGraphics.selected) {
            this.show(evt)
          }
        }),
        out: this.parentGraphics.events.mouseout.subscribe(evt => this.hide())
      }
    }else if(this.enabled && !v){
      this.mouseOverSubscription.in.unsubscribe()
      this.mouseOverSubscription.out.unsubscribe()
      this.mouseOverSubscription = null
    }
  }

  get enabled(){
    return this.mouseOverSubscription!=null
  }

  set delay(v){
    this._delay = v
    if(this.enabled){ //refresh debounceTime
      this.enabled = false
      this.enabled = true
    }
  }

  get delay(){
    return this._delay
  }
  // hidden = true
  _content: string
  contentBinding : Function
  positionBinding : Function

  set content(v){
    this._content = v
    this.draw(true)
  }
  get content() {
    return this._content
  }

  get stage(){
    return this.parentGraphics.viewport.parent
  }

  constructor(_parent){
    super()
    this.parentGraphics = _parent
    this.addChild(this.pixiText)
    this.visible = false
    this.parentGraphics.events.selected.subscribe(()=> this.hide())
    this.parentGraphics.events.removedOrDestroyed.subscribe(()=>this.parent?.removeChild(this))
  }


  draw(clear = true){
    if(clear){
      this.clear()
    }    
    this.pixiText.text = this.content
    this.beginFill(0x000000 , 0.6).drawRoundedRect(-5, - 5,this.width + 10 ,this.height + 10, 3).endFill()
    this.drawDone.emit()
  }


  show( mouseEvt : PIXI.interaction.InteractionEvent =  null , position : PIXI.Point = null ){
    if (this.contentBinding) {
      let latestContent = this.contentBinding()
      if (this.content != latestContent) {
        this.content = latestContent
      }
    }
    
    if(!this.stage?.children.includes(this)){
      this.stage?.addChild(this)
    }

    if(mouseEvt != null || position != null || this.positionBinding != null ){
      this.position = this.positionBinding ? this.positionBinding() : (position? this.stage.toLocal(position) : mouseEvt?.data?.getLocalPosition(this.stage))
      this.position.y += this.position.y < 40 ? 40 : (-40)
    }
    this.visible = true
  } 

  hide(){
    this.visible = false
  }
}

class PixiEventSubscriptionMap {
  added?: Subscription | null
  destroyed?: Subscription | null
  mouseover?: Subscription | null
  mouseout?: Subscription | null
  dragging?: Subscription | null
  clickEnd?: Subscription | null
  click?: Subscription | null
  removed?: Subscription | null
  removedOrDestroyed?: Subscription | null
  selected?: Subscription | null
  unselected?: Subscription | null
  zoomed?: Subscription | null
  resizing?: Subscription | null
  rotateEnd?: Subscription | null
}


export class PixiGraphics extends PIXI.Graphics {
  public type: string
  public dimensionType: '1D' | '2D'
  public style: PixiGraphicStyle = new PixiGraphicStyle()
  public tmpStyle: PixiGraphicStyle = new PixiGraphicStyle()
  disabled = false
  viewport: PixiViewport
  events = {
    added: new EventEmitter(),
    destroyed: new EventEmitter(),
    mouseover: new EventEmitter(),
    mouseout: new EventEmitter(),
    move: new EventEmitter(),
    clickEnd: new EventEmitter(),
    click: new EventEmitter(),
    removed: new EventEmitter(),
    removedOrDestroyed: new EventEmitter(),
    selected: new EventEmitter(),
    unselected: new EventEmitter(),
    dragStart : new EventEmitter(),
    dragEnd : new EventEmitter(),
    dragging : new EventEmitter(),
    resizing : new EventEmitter(),
    rotateEnd : new EventEmitter(),
  }

  defaultCursor = 'default'
  isBeingMouseOvered = false

  subscriptions: PixiEventSubscriptionMap = {
    added: null,
    destroyed: null,
    mouseover: null,
    mouseout: null,
    dragging: null,
    clickEnd: null,
    click: null,
    removed: null,
    removedOrDestroyed: null,
    selected: null,
    unselected: null,
    zoomed:null,
    resizing: null,
    rotateEnd : null
  }

  // robotIconScale = 0.1
  
  // get METER_TO_PIXEL_RATIO(): number {
  //   return this.viewport.METER_TO_PIXEL_RATIO
  // }

  dataObj
  toolTip: PixiToolTip = new PixiToolTip(this)
  border: PixiBorder
  icon
  _selectable = false
  set selectable(v){
    this._selectable = v
    this.interactive = !this.interactive && v ? true : this.interactive
    if(v && !this.dragModule.instantDrag){
      this.cursor =  this.dragModule.instantDrag || (this.dragModule.enabled && this.selected) ? 'move' : 'pointer'
    }else if(!v){
      this.cursor = this.dragModule.instantDrag || (this.dragModule.enabled && this.selected) ? 'move' : this.defaultCursor
    }
  }

  get selectable(){
    return this._selectable
  }
  
  set selected(v) {
    this.viewport.selectedGraphics = v? this : null
  }

  get selected() {
    return this.viewport.selectedGraphics == this
  }

  
  constructor(viewport: PixiViewport) {
    super()
    this.viewport = viewport
    Object.keys(this.events).filter(k => !['selected', 'unselected', 'click', 'clickEnd', 'move'].includes(k)).forEach(k => this.on(<any>k, (e) => this.events[k].emit(e)))
    // this.on('added', () => this.events.added.next(true))
    this.on('destroyed', () => {
      this.events.removedOrDestroyed.emit(true)
    })
    this.on('mouseover', (evt: PIXI.interaction.InteractionEvent) => {
      this.isBeingMouseOvered = true
    })
    this.on('mouseout', (evt: PIXI.interaction.InteractionEvent) => {
      this.isBeingMouseOvered = false
    })
    this.on('removed', () => {
      this.events.removedOrDestroyed.emit(true)
    })

    CLICK_EVENTS.forEach(e => {
      this.on(e, (evt: PIXI.interaction.InteractionEvent) => {        
        if(this.viewport.createData?.type == 'polygon' && !( this instanceof PixiCircle && this.viewport.previewGraphics.children.includes(this))){
          return
        }        
        if(this.viewport.mode != 'create'){
          evt.stopPropagation()
        }
        this.events.click.emit(evt)
        if (!this.selected && this.selectable) {
          this.events.clickEnd.pipe(take(1)).subscribe(() => this.viewport.selectedGraphics = this)
        }
      })
    })
    
    CLICK_END_EVENTS.forEach(e => {
      this.on(e, (evt: PIXI.interaction.InteractionEvent) => {
        this.events.clickEnd.emit(evt)
      })  
    })

    MOVE_EVENTS.forEach(e => {
      this.on(e, (evt: PIXI.interaction.InteractionEvent) => this.events.move.emit(evt))
    })

    this.events.added.pipe(takeUntil(this.events.destroyed)).subscribe(() => {      
      if (this.autoScaleModule.enabled) {
        this.autoScaleEnabled = false
        this.autoScaleEnabled = true
      }
    })
    
    this.events.unselected.pipe(takeUntil(this.events.destroyed)).subscribe(()=>{
      this.cursor = this.instantDrag ?  this.dragCursor :  (this.selectable ? 'pointer' : this.defaultCursor)
    })

    this.events.selected.pipe(takeUntil(this.events.destroyed)).subscribe(()=>{
      this.cursor = this.draggable ? this.dragCursor : this.defaultCursor
    })
  }

  //TBD : MOVE MODULES INTO CLASSES

  //-------------------------------------------------------------------------------------------------------------------------------------------------------


  //v MOUSEOVER EFFECT MODULE v
  set mouseOverEffectEnabled(v) {
    if (v && !this.mouseOverEffectEnabled) {
      this.mouseOverEffectModule.subscribe()
    } else if (!v && this.mouseOverEffectEnabled) {
      this.mouseOverEffectModule.unsubscribe()
    }
  }
  get mouseOverEffectEnabled() {
    return this.mouseOverEffectModule.subscription != null
  }

  set mouseOverColor(v){
    this.mouseOverEffectModule.fillColor = v
    if(this.mouseOverEffectEnabled){
      this.mouseOverEffectEnabled = false
      this.mouseOverEffectEnabled = true
    }
  }

  get mouseOverColor(){
    return this.mouseOverEffectModule.fillColor
  }

  set mouseOverOutline(v :  {color : number , width : number}){
    this.mouseOverEffectModule.outline= v
    if(this.mouseOverEffectEnabled){
      this.mouseOverEffectEnabled = false
      this.mouseOverEffectEnabled = true
    }
  }

  get mouseOverOutline() {
   return this.mouseOverEffectModule.outline
  }

  private mouseOverEffectModule: { outlineFilter: any, subscription: PixiEventSubscriptionMap, subscribe: Function, unsubscribe: Function, outline: { color: number, width: number }, fillColor: number } = {
    subscription: null,
    outline: null,
    fillColor: DRAWING_STYLE.mouseOverColor,
    outlineFilter: null,
    subscribe: () => {
      this.mouseOverEffectModule.outlineFilter = this.mouseOverEffectModule.outline ? new OutlineFilter(this.mouseOverEffectModule.outline?.width, this.mouseOverEffectModule.outline?.color, 1) : null
      let removeFilter = ()=>{
        const newFilters = this.filters?.slice()?.filter(f=>f!=this.mouseOverEffectModule.outlineFilter)
        this.filters = newFilters?.length == 0 ? null : newFilters
      }
      this.mouseOverEffectModule.subscription = {
        mouseover: this.events.mouseover.pipe(filter(v => !this.selected && this.viewport.mode != 'create'), takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
          if (canReColor(this) && !this.selected && this.mouseOverEffectModule.fillColor != null) {
            this.reColor(this.mouseOverEffectModule.fillColor)
          }
          if (this.mouseOverEffectModule.outlineFilter != null) {
            this.filters = this.filters  ?  this.filters.concat( [<any>this.mouseOverEffectModule.outlineFilter]) :  [<any>this.mouseOverEffectModule.outlineFilter];
          }
        }),
        mouseout: this.events.mouseout.pipe(filter(v => !this.selected), takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
          if (canReColor(this)) {
            this.reColor(this.selected ? DRAWING_STYLE.highlightColor : this.style.fillColor)
          }
          removeFilter()
        }) , 
        selected: this.events.selected.pipe(filter(v => this.mouseOverEffectModule.outlineFilter != null), takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
          removeFilter()
        })
      }
    },
    unsubscribe: () => {
      this.mouseOverEffectModule.outlineFilter = null
      if (this.mouseOverEffectModule.subscription) {
        Object.keys(this.mouseOverEffectModule.subscription).forEach(k => this.mouseOverEffectModule.subscription[k].unsubscribe())
      }
      this.mouseOverEffectModule.subscription = null
    }
  }
  //^MOUSEOVER EFFECT MODULE ^



  //-------------------------------------------------------------------------------------------------------------------------------------------------------



  //v AUTO SCALE MODULE v
  autoScaleModule: { enabled : boolean , counterScaleBinding : Function , zoomSubscription: Subscription | null, setScale: Function , debounce : number , scaleThreshold : {max : number , min : number} } = {
    enabled : false,
    zoomSubscription: null,
    debounce : 0 , 
    scaleThreshold : {max: 0.5,  min: 0.025 },
    counterScaleBinding: () => (this.parent != null ? this.parent.scale.x : 1),
    setScale: () => {
      if (this.dimensionType == '1D' && canDraw(this)) {
        this.draw(true)
      } 
      // else if (this.type == 'waypoint') {
      //   let max = this.autoScaleModule.scaleThreshold.max, min = this.autoScaleModule.scaleThreshold.min
      //   let exceedsThreshold = this.viewport.settings.mapTransformedScale && this.viewport.scale.x < max / this.viewport.settings.mapTransformedScale
      //   let weight = this.selected || !exceedsThreshold ? 1 : Math.min(1, Math.sqrt((Math.min(max, this.viewport.scale.x) - min) / (max - min)))
      //   let scale = DRAWING_STYLE.markerScale * weight / this.viewport.scale.x * (this.autoScaleModule.counterScaleBinding())
      //   this.scale.set(scale, scale)
      // } 
      else {
        this.scale.set(1 / (this.autoScaleModule.counterScaleBinding()* this.viewport.scale.x))
      }
    }
  }

  set autoScaleEnabled(v) {
    if (!this.autoScaleModule.enabled && v) {
      this.autoScaleModule.setScale()
      if (this.autoScaleModule.debounce != 0) {
        this.autoScaleModule.zoomSubscription = this.viewport.zoomed.pipe(takeUntil(this.events.removedOrDestroyed), debounceTime(this.autoScaleModule.debounce)).subscribe(() => {
          this.autoScaleModule.setScale()
        })
      } else {
        this.autoScaleModule.zoomSubscription = this.viewport.zoomed.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
          this.autoScaleModule.setScale()
        })
      }
    } else if (this.autoScaleModule.zoomSubscription && !v) {
      this.autoScaleModule.zoomSubscription.unsubscribe()
    }
    this.autoScaleModule.enabled = v
  }

  get autoScaleEnabled() {
    return this.autoScaleModule.enabled
  }
  //^ AUTO SCALE MODULE ^



  //-------------------------------------------------------------------------------------------------------------------------------------------------------



  //v DRAG MODULE v
  get draggable() {
    return this.dragModule.enabled
  }
  set draggable(v: boolean) {
    this.dragModule.enabled = v
    if (!v) {
      this.dragModule.handleEnd()
      // if(this.dragModule.subscription.end){
      //   this.dragModule.subscription.end.unsubscribe()
      // }
    } else {
      this.dragModule.subscribeStart()
    }
  }

  get instantDrag(){  
    return this.dragModule.instantDrag
  }

  set instantDrag(v){
    if(v){      
      this.dragModule.instantDrag = v
      this.interactive = true
      this.dragModule.enabled = true
      this.dragModule.subscribeStart()
      this.cursor = this.dragCursor
    }
  }

  set dragCursor(v){
    this.dragModule.cursor = v
  }

  get dragCursor(){
    return this.dragModule.cursor
  }

  private dragModule = {
    events : {
      start : this.events.dragStart,
      moving: this.events.dragging,
      end : this.events.dragEnd,
    },
    enabled: false,
    dragging: false,
    cursor : 'move',
    instantDrag: false, //false : draggable only after selected
    dragOffset: new PIXI.Point(),
    subscription: {
      click: null,
      move: null,
      end : null,
      selected : null,
      unselected : null
    },
    subscribeStart: () => { 
      this.dragModule.subscription.click = this.events.click.pipe(filter(v => this.draggable && (this.selected || this.dragModule.instantDrag) && !this.dragModule.dragging)).subscribe((e: PIXI.interaction.InteractionEvent) => {
        this.dragModule.handleStart(e)
      })      
    },
    handleStart: (evt : PIXI.interaction.InteractionEvent)=>{
      this.dragModule.dragging = true;
      this.dragModule.events.start.emit(evt)
      const newPosition = evt.data.getLocalPosition(this.parent);
      this.dragModule.dragOffset.set(newPosition.x - this.x, newPosition.y - this.y);
      this.dragModule.subscription.move = this.events.move.pipe(filter(v => this.dragModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
        const newPosition = evt.data.getLocalPosition(this.parent);
        this.x = newPosition.x - this.dragModule.dragOffset.x;
        this.y = newPosition.y - this.dragModule.dragOffset.y;
        this.dragModule.events.moving.emit(evt)
      })
      this.dragModule.subscription.end = this.viewport.ngEvents.clickEnd.pipe(filter(v => this.dragModule.dragging )).subscribe(() => {
        this.cursor = this.dragCursor
        this.dragModule.handleEnd()
        setTimeout(() => {
          this.dragModule.subscribeStart()
        })
      })
    },
    handleEnd: () => {
      if(this.dragModule.dragging){
        this.dragModule.events.end.emit(true)
      }
      this.dragModule.dragging = false;
      Object.keys(this.dragModule.subscription).forEach(k => {
        if (this.dragModule.subscription[k]) {
          (<Subscription>this.dragModule.subscription[k]).unsubscribe();
        }
        this.dragModule.subscription[k] = null
      })
    }
  }
  
  //^ DRAG MODULE ^

  //-------------------------------------------------------------------------------------------------------------------------------------------------------

  //v ROTATE MODULE v
  set rotatable (v){
    this.rotateModule.enabled = v
    if(v){
      this.rotateModule.subscribeStart()
    }else{
      this.rotateModule.handleEnd()
    }
  }
  get rotatable(){
    return  this.rotateModule.enabled
  }

  set rotateButton(v : PixiGraphics){
    this.rotateModule.rotateHandle = <any>v
  }
  get rotateButton() : PixiGraphics{
    return this.rotateModule.rotateHandle
  }

  private rotateModule = {
    enabled: false,
    dragging: false,
    rotateHandle : this,
    subscription: {
      click: null,
      move: null,
      clickEnd : null 
    },
    subscribeStart: () => {
      this.rotateButton.toolTip.contentBinding = () => GetPixiAngleDescription(this)
      this.rotateModule.subscription.click = this.rotateButton.events.click.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.rotateModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
        this.rotateModule.dragging = true;
        this.rotateModule.subscription.move = this.events.move.pipe(takeUntil(this.events.removedOrDestroyed),filter(v => this.rotateModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
          let pivot = this.viewport.mainContainer.toLocal(this.toGlobal(this.pivot))
          let mousePos = evt.data.getLocalPosition(this.viewport.mainContainer)
          let angle = getAngle(new PIXI.Point(mousePos.x, mousePos.y), new PIXI.Point(pivot.x, pivot.y), new PIXI.Point(pivot.x, 0))
          angle = mousePos.x > pivot.x ? angle : 360 - angle
          this.viewport.ngZone.run(() => this.angle = !isNaN(angle % 360) ? angle % 360 : this.angle)
          this.rotateButton.toolTip.show()
        })
        this.rotateModule.subscription.clickEnd = this.viewport.ngEvents.clickEnd.pipe(takeUntil(this.events.removedOrDestroyed),filter(v => this.rotateModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
          this.rotateModule.handleEnd()
          this.rotateModule.subscribeStart()
        })
      })
    },
    handleEnd: () => {
      if(this.rotateModule.dragging){
        this.events.rotateEnd.emit(true)
      }
      this.rotateButton.toolTip.hide()
      this.rotateModule.dragging = false;
      Object.keys(this.rotateModule.subscription).forEach(k => {
        if (this.rotateModule.subscription[k]) {
          (<Subscription>this.rotateModule.subscription[k]).unsubscribe();
        }
        this.rotateModule.subscription[k] = null
      })
    }
  }

  //^ ROTATE MODULE ^

  //-------------------------------------------------------------------------------------------------------------------------------------------------------

  //v RESIZE MODULE v
  set resizable (v){
    this.resizeModule.enabled = v
    if(v){
      this.resizeModule.subscribeStart()
    }else{
      this.resizeModule.handleEnd()
    }
  }
  get resizable(){
    return  this.resizeModule.enabled
  }

  set resizeButtons(v : PixiGraphics[]){
    this.resizeModule.resizeHandles = <any>v
  }

  get resizeButtons() : PixiGraphics[]{
    return this.resizeModule.resizeHandles
  }

  get isResizing() {
    return this.resizeModule.dragging
  }

  private resizeModule = {
    enabled: false,
    dragging: false,
    resizeHandles : [],
    startPoint : new PIXI.Point(),
    originalWidth : 0,
    originalHeight  : 0,
    subscription: {
      click: null,
      move: null,
      clickEnd : null 
    },
    subscribeStart: () => {
      this.toolTip.contentBinding = () => this.scale.x.toFixed(2) + ' x';
      this.resizeModule.subscription.click = this.resizeModule.resizeHandles.forEach(h=>{
        h.events.click.pipe(filter(v => !this.resizeModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
          this.resizeModule.startPoint = evt.data.getLocalPosition(this.viewport.mainContainer)
          this.resizeModule.originalWidth = this.width
          this.resizeModule.originalHeight = this.height
          this.resizeModule.dragging = true;
          this.resizeModule.subscription.move = this.events.move.pipe(filter(v => this.resizeModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            let mousePos = evt.data.getLocalPosition(this.viewport.mainContainer)
            let getLen = (p1: PIXI.Point, p2: PIXI.Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y)
            let pivotPos = this.viewport.mainContainer.toLocal(this.toGlobal(this.pivot))
            let scale = Math.max(0.05, (getLen(pivotPos, mousePos) / getLen(pivotPos, this.resizeModule.startPoint)))
            this.height = this.resizeModule.originalHeight * scale
            this.width = this.resizeModule.originalWidth * scale;
            this.events.resizing.emit(evt)
            this.toolTip.show(evt)  
          })
          this.resizeModule.subscription.clickEnd = this.viewport.ngEvents.clickEnd.pipe(filter(v => this.resizeModule.dragging)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
            this.resizeModule.handleEnd()
            this.resizeModule.subscribeStart()
          })
        })
      })
    },
    handleEnd: () => {
      this.resizeModule.startPoint = new PIXI.Point()
      this.resizeModule.originalWidth = 0 
      this.resizeModule.originalHeight = 0
      this.toolTip.hide()
      this.resizeModule.dragging = false;
      Object.keys(this.resizeModule.subscription).forEach(k => {
        if (this.resizeModule.subscription[k]) {
          (<Subscription>this.resizeModule.subscription[k]).unsubscribe();
        }
        this.resizeModule.subscription[k] = null
      })
    }
  }

  //^ RESIZE MODULE ^

  //-------------------------------------------------------------------------------------------------------------------------------------------------------



  public addBorder(points, lineColor = DRAWING_STYLE.highlightColor) {
    let border = new PixiBorder( this.viewport , this , points , lineColor)
    this.addChild(border)
    this.border = border
    border.draw()
  }  
}


export interface IDraw{
  drawDone : EventEmitter<any>
  draw(clear : boolean) : void
}

export interface IReColor{
  reColor(color) : void
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

export function canDraw(graphic: IDraw | PIXI.Graphics): graphic is IDraw { //magic happens here
  return (<IDraw>graphic).draw !== undefined;
}

export function canReColor(graphic: IReColor | PIXI.Graphics): graphic is IReColor { //magic happens here
  return (<IReColor>graphic).reColor !== undefined;
}

export class PixiLine extends Pixi1DGraphics implements IDraw{
  drawDone = new EventEmitter()
  private _arrowParent : PixiArrow
  get arrowParent (){
    return this._arrowParent
  }
  public type 
  endpointsSpaces = 0
  get endpointsPositions(){
    let p1 = this.vertices[0], p2 = this.vertices[1]
      let spaceRadius = this.endpointsSpaces * DRAWING_STYLE.markerScale / this.viewport.scale.x
      let spaceScale1 = 5, spaceScale2 = 5
      let or1 = getOrientation(p2, p1)
      let or2 = getOrientation(p1, p2)
      spaceScale1 = or1?.includes('S') ? 10 : 5
      spaceScale2 = or2?.includes('S') ? 10 : 5
      let height = Math.abs(p2.y - p1.y), width = Math.abs(p2.x - p1.x)
      let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width)), yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
      return [
        new PIXI.Point(p1.x + spaceRadius * spaceScale1 * xRatio, p1.y + spaceRadius * spaceScale1 * yRatio),
        new PIXI.Point(p2.x + (-1) * spaceRadius * spaceScale2 * xRatio, p2.y + (-1) * spaceRadius * spaceScale2 * yRatio)
      ]
  }
  tint


  constructor(viewport : PixiViewport , vertices : PIXI.Point[], style = new PixiGraphicStyle() , autoScale = true , endpointsSpace = 0 , parentArrow : PixiArrow = null ){
    super(viewport)
    this.vertices = vertices
    this.style = style
    this.autoScaleEnabled = autoScale
    this.endpointsSpaces = endpointsSpace
    this._arrowParent = parentArrow
    this.type = 'line'
    this.draw()  
    this.events.added.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(()=>this.draw(true))
    this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(()=>{
      this.filters = [<any>new OutlineFilter(3, DRAWING_STYLE.highlightColor , 1)];
    })
    this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(()=>{
      this.filters = [];
    })
  }

  draw(clear = false): void {
    if(clear){
      this.clear() //becareful if option argument != null 
    }
    
    let lineColor = ConvertColorToDecimal(this.style?.lineColor)
    let lineThickness = this.style?.lineThickness / ((this.parent? this.parent.scale.x : 1) * (this.autoScaleEnabled ? this.viewport.scale.x : 1))

    if(this.endpointsSpaces == 0){
      this.lineStyle(lineThickness, lineColor, this.style?.opacity).moveTo(this.vertices[0].x, this.vertices[0].y).lineTo(this.vertices[1].x, this.vertices[1].y);
    } else {    
      let vertices = this.endpointsPositions
      this.lineStyle(lineThickness, lineColor, this.style?.opacity).moveTo(vertices[0].x, vertices[0].y).lineTo(vertices[1].x, vertices[1].y);
    }
    this.zIndex = this.style?.zIndex
    // this.tint = ConvertColorToDecimal(this.tint ? this.style?.lineColor : this.tint)
    // console.log(this.tint)
    
    // this.vertices = ret.vertices ?  ret.vertices : [p1, p2];
    this.type = this.type ? this.type : 'line'
    this.setHitArea()
    this.drawDone.next()
  }
  
  setHitArea(){
    const size = 10
    let p1 =  this.endpointsPositions[0]
    let p2 =  this.endpointsPositions[1]
    let height =  Math.abs(p2.y - p1.y)
    let width = Math.abs(p2.x - p1.x)
    let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width))
    let yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
    let vertices = [new PIXI.Point(p1.x + size * yRatio ,  p1.y - size * xRatio ) , 
                    new PIXI.Point(p1.x - size * yRatio ,  p1.y + size * xRatio ) ,
                    new PIXI.Point(p2.x - size * yRatio ,  p2.y + size * xRatio ) ,
                    new PIXI.Point(p2.x + size * yRatio ,  p2.y - size * xRatio ) ]
    this.hitArea = new PIXI.Polygon(vertices)
  }
  // if(masterComponent ){
  //   masterComponent.onViewportZoomed.pipe(filter(v=>v!=null), takeUntil(masterComponent.onDestroy) , debounceTime(25)).subscribe(()=>draw(true))
  //   ret.on('added', ()=>draw(true))
  // }
  // return ret
}


export class PixiDashedLine extends Pixi1DGraphics implements IDraw {
  drawDone = new EventEmitter()
  dashLen
  spaceLen
  constructor(viewport: PixiViewport, vertices: PIXI.Point[], style = new PixiGraphicStyle(), dashLen: number = 3, spaceLen: number = 2 , autoScale = true) {
    super(viewport)
    this.vertices = vertices
    this.dashLen = dashLen
    this.spaceLen = spaceLen
    this.style = style
    this.type = 'dashed_line'
    this.autoScaleEnabled = autoScale
    this.draw()
    this.on('added', () => this.draw(true))
  }

  draw(clear: boolean = false): void {
    if (clear) {
      this.clear() //becareful if option argument != null 
    }
    let lineThickness = this.style.lineThickness / (this.autoScaleEnabled ?  this.viewport.scale.x * this.autoScaleModule.counterScaleBinding()  : 1)
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
    this.drawDone.emit()
  }
}

export class PixiCurve extends Pixi1DGraphics implements IDraw{
  private _arrowParent : PixiPath
  get arrowParent (){
    return this._arrowParent
  }
  private _editable = false
  get editable(){
    return this._editable
  }
  set editable(v){
    this._editable = v
    this.pixiControlPoint1.position = this.controlPoints[0]
    this.pixiControlPoint2.position = this.controlPoints[1]
    this.pixiControlPoint1.visible = this._editable 
    this.pixiControlPoint2.visible = this._editable && !this.arrowParent?.quadraticCurve
    //########## TO BE CONTINUE
    this.draw()
  }

  get controlPoints(): PIXI.Point[]{
    return [this.vertices[2] , this.vertices[3]]
  }

  endpointsSpaces = 0
  pixiControlPoint1 : PixiCircle
  pixiControlPoint2 : PixiCircle
  get endpointsPositions(){
    let p1 = this.vertices[0] , p2 = this.vertices[1] , cp1 = this.controlPoints[0] , cp2 = this.controlPoints[1]
    let arc_length = new Bezier(p1.x, p1.y, p2.x, p2.y, cp1.x, cp1.y, cp2.x, cp2.y).length()// (cont_net + chord) / 2;
    let t0 = Math.min(0.49, Math.max(0, this.endpointsSpaces * (this.autoScaleEnabled ? Math.sqrt( 1 / (this.viewport.scale.x * this.parent?.scale.x) ): 1)/ arc_length))
    let t1 = 1 - t0
    let pts = getBezierSectionPoints( [p1 , p2], [cp1 , cp2], t0, t1)
    return [
      new PIXI.Point(pts.xa , pts.ya),      
      new PIXI.Point(pts.xd , pts.yd),
      new PIXI.Point(pts.xb , pts.yb),
      new PIXI.Point(pts.xc , pts.yc),
    ]
  }
  drawDone  = new EventEmitter()
  controlPointClicked = new EventEmitter()
  constructor(viewport : PixiViewport , vertices : PIXI.Point[], style = new PixiGraphicStyle() , endpointsSpaces = 0 , arrowParent = null ){
    super(viewport)
    if(vertices.length < 4 ){
      let p1 = vertices[0], p2 = vertices[1]
      let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
      let xratio = (p1.x - p2.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
      let yratio = (p1.y - p2.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
      let len = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4
      vertices[2] = new PIXI.Point(midPt.x + len * (yratio), midPt.y - len * (xratio))
      vertices[3] = new PIXI.Point(midPt.x - len * (yratio), midPt.y + len * (xratio))
    }
    this._arrowParent = arrowParent
    if(this.arrowParent){
      this.initControlPointGraphics()
    }    
    this.type = 'curve'
    this.style = style
    this.vertices = vertices //[p1, p2 ,cp1, cp2]
    this.endpointsSpaces = endpointsSpaces
    this.draw()  
    this.events.added.subscribe(()=>this.draw(true))
    this.autoScaleEnabled = true
  }

  draw(clear = false){    
    if(clear){
      this.clear() //becareful if option argument != null 
    }
    this.children.filter(c=>c != this.pixiControlPoint1 && c!=this.pixiControlPoint2).forEach(c=>this.removeChild(c))
    let p1 = this.vertices[0] , p2 = this.vertices[1] , cp1 = this.controlPoints[0] , cp2 = this.controlPoints[1]
    let lineColor = this.tint ? 0xFFFFFF : this.style?.lineColor
    
    if(this.endpointsSpaces == 0){
      this.lineStyle(this.style.lineThickness / ((this.parent? this.parent.scale.x : 1) * (this.autoScaleEnabled ? this.viewport.scale.x : 1)), lineColor , this.style.opacity).moveTo(p1.x,p1.y).bezierCurveTo(cp1.x, cp1.y , cp2.x , cp2.y , p2.x , p2.y)
    }else{  
      let arc_length = new Bezier(p1.x, p1.y, p2.x, p2.y, cp1.x, cp1.y, cp2.x, cp2.y).length()// (cont_net + chord) / 2;
      let t0 = Math.min(0.49, Math.max(0, this.endpointsSpaces * (this.autoScaleEnabled ? Math.sqrt( 1 / (this.viewport.scale.x * this.parent?.scale.x) ): 1)/ arc_length))
      let t1 = 1 - t0
      let pts = getBezierSectionPoints( [p1 , p2], [cp1 , cp2], t0, t1)
      this.lineStyle(this.style.lineThickness / ((this.parent? this.parent.scale.x : 1) * (this.autoScaleEnabled ? this.viewport.scale.x : 1)), lineColor , this.style.opacity).moveTo(pts.xd, pts.yd).bezierCurveTo(pts.xc, pts.yc, pts.xb, pts.yb, pts.xa, pts.ya)
    }
    this.setHitArea()  
    this.zIndex = this.style.zIndex
    this.tint = this.tint ? this.style.lineColor :  this.tint 
    if(this.editable){
      this.addChild(new PixiDashedLine(this.viewport, [cp2, this.vertices[1]], new PixiGraphicStyle().setProperties({ opacity: 0.15, lineThickness: this.tmpStyle.lineThickness , zIndex : -1})));
      this.addChild(new PixiDashedLine(this.viewport, [cp1, this.vertices[0]], new PixiGraphicStyle().setProperties({ opacity: 0.15, lineThickness: this.tmpStyle.lineThickness , zIndex : -1})));
    }
    this.drawDone.next()
  }

  initControlPointGraphics() {
    let ctrlPtStyle = new PixiGraphicStyle().set('fillColor', DRAWING_STYLE.highlightColor).set('opacity', 0.5).set('lineColor', DRAWING_STYLE.highlightColor)
    this.pixiControlPoint1 = new PixiCircle(this.viewport, new PIXI.Point(0, 0), this.viewport.interactiveControlRadius, ctrlPtStyle)
    this.pixiControlPoint2 = new PixiCircle(this.viewport, new PIXI.Point(0, 0), this.viewport.interactiveControlRadius, ctrlPtStyle);
    [this.pixiControlPoint1, this.pixiControlPoint2].forEach(h => {
      if (this.parent) {
        this.parent.addChild(h)
      } else {
        this.events.added.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => this.parent.addChild(h))
        this.events.removedOrDestroyed.pipe(takeUntil(h.events.removedOrDestroyed)).subscribe(() => h?.parent.removeChild(h));
        [h.events.dragEnd , h.events.dragging].forEach((dragEvt)=>{
          dragEvt.pipe(takeUntil(h.events.removedOrDestroyed)).subscribe((evt : PIXI.interaction.InteractionEvent)=>{
            if (evt?.data) {
              let idx = h == this.pixiControlPoint1 ? 2 : 3;
              this.arrowParent.vertices[idx] = evt.data.getLocalPosition(h.parent.parent)
              this.vertices[idx] = evt.data.getLocalPosition(h.parent)
              if (this.arrowParent.quadraticCurve) {
                this.arrowParent.vertices[3] = this.arrowParent.vertices[2].clone()
                this.vertices[3] = this.vertices[2].clone()
              }
              this.draw(true)
            }
          })
        })
      }
      h.interactive = true
      h.instantDrag = true
      h.visible =  this._editable 
      h.autoScaleEnabled = true
    })
  }

  setHitArea() {
    let vertices = this.endpointsPositions
    let ctrlPts = [vertices[2], vertices[3]]
    let hitAreaVertices1 = []
    let hitAreaVertices2 = []
    let sectionDelta = 0.01
    let prevCenter = { x: vertices[0].x, y: vertices[0].y }
    for (let i = sectionDelta; i < 1; i += sectionDelta) {
      let hitAreaWidth = 10
      let tmpPts = getBezierSectionPoints(vertices, ctrlPts, i, 1)
      let newCenter = { x: tmpPts.xa, y: tmpPts.ya }
      let radius = Math.hypot(newCenter.x - prevCenter.x, newCenter.y - prevCenter.y)
      let intersections = intersectionsOfCircles({ x: newCenter.x, y: newCenter.y, r: radius }, { x: prevCenter.x, y: prevCenter.y, r: radius })
      if (intersections.point_1 && intersections.point_2) {
        let p1 = new PIXI.Point(intersections.point_1.x, intersections.point_1.y)
        let p2 = new PIXI.Point(intersections.point_2.x, intersections.point_2.y)
        let height = Math.abs(p2.y - p1.y)
        let width = Math.abs(p2.x - p1.x)
        let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
        let xRatio = (p2.x - p1.x) / Math.sqrt((height * height) + (width * width))
        let yRatio = (p2.y - p1.y) / Math.sqrt((height * height) + (width * width))
        p1 = new PIXI.Point(midPt.x + hitAreaWidth * xRatio, midPt.y + hitAreaWidth * yRatio)
        p2 = new PIXI.Point(midPt.x - hitAreaWidth * xRatio, midPt.y - hitAreaWidth * yRatio)
        hitAreaVertices1.push(p1.x, p1.y)
        hitAreaVertices2.unshift(p2.x, p2.y)
      }
      prevCenter = { x: newCenter.x, y: newCenter.y }
    }
    this.hitArea = new PIXI.Polygon(hitAreaVertices1.concat(hitAreaVertices2))
  }

  setControlPoints(p1: PIXI.Point, p2: PIXI.Point ) {
    this.pixiControlPoint1.position = p1; //new PIXI.Point(midPt.x + len *  (yratio) , midPt.y + len * (1/xratio));// adjustPos[0] ;
    this.pixiControlPoint2.position = p2; // new PIXI.Point(midPt.x - len *  (yratio) , midPt.y - len * (1/xratio));//adjustPos[1] ;
    this.vertices[2] = p1  
    this.vertices[3] = p2  
    this.draw()
  }
}

export class PixiCircle extends Pixi2DGraphics{
  public radius : number
  public center : PIXI.Point
  constructor(viewport : PixiViewport = null , p: PIXI.Point, radiusPx = 20, style = new PixiGraphicStyle()  , isRelativeScale = false){
      super(viewport)
      this.autoScaleEnabled = isRelativeScale
      this.style = style
      this.radius = radiusPx;
      this.lineStyle(style.lineThickness, style.lineColor).beginFill(style.fillColor, style.opacity).drawCircle(p.x, p.y, radiusPx).endFill();
      this.type = 'circle'
      this.center = p
      this.vertices = this.vertices ? this.vertices : [p];
      this.zIndex = style.zIndex;
      // this.cursor = 'move'
  }
}



export class PixiBorder extends Pixi2DGraphics implements IDraw{
  drawDone = new EventEmitter()
  points : PIXI.Point[]
  lineType  : 'dashed' | 'solid'
  // g : PixiGraphics
  constructor( viewport : PixiViewport , _parent :PixiGraphics , _points :  PIXI.Point[] , _lineColor : number | null = null , lineType : 'dashed' | 'solid' = 'dashed'  ){
    super(viewport)
    this.type = 'border'
    this.style.lineColor =_lineColor
    this.style.lineThickness = DRAWING_STYLE.lineWidth
    this.lineType = lineType
    this.points = _points
    this.filters = [<any>new OutlineFilter(1, DRAWING_STYLE.outlineColor, 1)]
    // this.g = _parent
  }
  
  draw(){
    this.clear()
    let p0 = this.points[this.points.length - 1]
    let style = new PixiGraphicStyle().setProperties({
      lineColor :   this.style.lineColor , 
      lineThickness :  this.style.lineThickness
    })
    // opt.baseGraphics = this
    // opt.lineColor = this.lineColor
    // opt.lineThickness = this.parent.getMasterComponent().lineWidth/(this.parent.scale.x * this.parent.getViewport().scale.x), this.lineColor
    this.lineStyle(style.lineThickness ).moveTo(this.points[this.points.length - 1].x, this.points[this.points.length - 1].y)
    this.points.forEach(p => {
      let line = this.lineType == 'dashed' ? new PixiDashedLine(this.viewport, [p0, p], style) : new PixiLine( this.viewport , [p0, p], style)
      line.autoScaleModule.counterScaleBinding = () => (this.parent != null ? this.parent.scale.x : 1)
      this.addChild(line)
      p0 = p
    })
    this.drawDone.emit()
  }
}


export class PixiArrow extends PixiGraphics implements IDraw, IReColor {
  drawDone = new EventEmitter()
  id
  endpointsLocal
  vertices: PIXI.Point[] = [] // [p1 , p2 , {c1} , {c2}]
  type: 'arrow_curved' | 'arrow_bi_curved' | 'arrow_bi' | 'arrow' = 'arrow'
  arrowType
  parent
  rightHead: PIXI.Graphics
  leftHead: PIXI.Graphics

  // private _fromShape: PixiWayPoint
  // private _toShape: PixiWayPoint

  // set fromShape(v: PixiWayPoint) {
  //   if (this._fromShape) {
  //     this._fromShape.link = this._fromShape.link.filter(l => l.arrow != this)
  //   }
  //   this._fromShape = v
  //   if (this.fromShape && this.toShape) {
  //     this.fromShape.link.push({ arrow: this, waypoint: this.toShape })
  //   }
  //   this.refreshVerticesFromLinkedLocPts()
  // }

  // set toShape(v: PixiWayPoint) {
  //   if (this._toShape) {
  //     this._toShape.link = this._toShape.link.filter(l => l.arrow != this)
  //   }
  //   this._toShape = v
  //   if (this.fromShape && this.toShape) {
  //     this.toShape.link.push({ arrow: this, waypoint: this.fromShape })
  //   }
  //   this.refreshVerticesFromLinkedLocPts()
  // }

  // get fromShape() {
  //   return this._fromShape
  // }

  // get toShape() {
  //   return this._toShape
  // }
  // dataObj: JPath
  _quadraticCurve = false
  get quadraticCurve() {
    return this._quadraticCurve
  }
  set quadraticCurve(v) {
    this._quadraticCurve = v
    if (v) {
      this.vertices[3] = this.vertices[2].clone();
      (<PixiCurve>this.segment).vertices[3] = (<PixiCurve>this.segment).vertices[2].clone();
      (<PixiCurve>this.segment).pixiControlPoint2.visible = false
      this.draw()
    } else if (this.selected) {
      (<PixiCurve>this.segment).pixiControlPoint2.visible = true
      this.draw()
    }
  }

  segment: PixiLine | PixiCurve
  endpointsSpaces = 7.5

  get isCurved() {
    return this.type == 'arrow_curved' || this.type == 'arrow_bi_curved'
  }
  get bidirectional() {
    return this.type == 'arrow_bi_curved' || this.type == 'arrow_bi'
  }

  constructor(viewport: PixiMapViewport, verts: PIXI.Point[], type, opt: PixiGraphicStyle = new PixiGraphicStyle().set('zIndex', 10)) {
    super(viewport)
    this.type = type
    this.vertices = verts
    // if (frLocPt && toLocPt) {
    //   this.fromShape = (<PixiWayPoint>frLocPt)
    //   this.toShape = (<PixiWayPoint>toLocPt)
    // }
    // this.selectable = this.viewport.settings.waypointEditable
    this.interactive = this.selectable
    this.style = opt
    this.tmpStyle = this.style.clone()
    if(verts[0] && verts[1]){
      this.endpointsLocal = [new PIXI.Point(0, 0), new PIXI.Point(this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y)]
      this.draw()
    }
    this.events.added.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(()=>this.draw())
    // this.events.removedOrDestroyed.subscribe(() => {
    //   this.fromShape = null
    //   this.toShape = null
    // })
    if (this.isCurved) {
      this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => (<PixiCurve>this.segment).editable = this.selectable)
      this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => setTimeout(() => (<PixiCurve>this.segment).editable = false))
    }
  }

  reColor(color) {
    this.tmpStyle.fillColor = color
    this.tmpStyle.lineColor = color
    this.draw()
  }

  // refreshVerticesFromLinkedLocPts(redraw = false) {
  //   if (this.fromShape && this.toShape) {
  //     this.vertices[0] = this.fromShape.position
  //     this.vertices[1] = this.toShape.position
  //     if (this.isCurved && this.vertices.length < 4) {
  //       let p1 = this.vertices[0]
  //       let p2 = this.vertices[1]
  //       let xratio = (p1.x - p2.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
  //       let yratio = (p1.y - p2.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
  //       let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
  //       let len = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4
  //       this.vertices[2] = new PIXI.Point(midPt.x + len * (yratio), midPt.y - len * (xratio))
  //       this.vertices[3] = new PIXI.Point(midPt.x - len * (yratio), midPt.y + len * (xratio))
  //     }

  //     if (redraw) {
  //       this.draw()
  //     }
  //   }
  // }

  draw() {
    this.endpointsLocal = [new PIXI.Point(0, 0), new PIXI.Point(this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y)].concat(!this.isCurved ? [] :
      [
        this.toLocal(this.viewport.mainContainer.toGlobal(new PIXI.Point(this.vertices[2].x, this.vertices[2].y))),
        this.toLocal(this.viewport.mainContainer.toGlobal(new PIXI.Point(this.vertices[3].x, this.vertices[3].y)))
      ]
    )
    // this.tmpStyle.lineColor = this.selected ? DRAWING_STYLE.highlightColor : style.lineColor
    // style.fillColor = selected ? DRAWING_STYLE.highlightColor : style.fillColor
    // style.baseGraphics = this
    this.clear()
    this.removeChild(this.segment)
    this.lineStyle(this.tmpStyle.lineThickness, this.tmpStyle.lineColor)
    if (this.isCurved) { //this.children.filter(c => c['type'] == 'bezier_ctrl_pt1').length > 0
      //pending : store local position of control point instead of that to mapContainer
      // this.pixiControlPoint1.visible = this.selected
      // this.pixiControlPoint2.visible = this.selected      
      this.segment = new PixiCurve(this.viewport, this.endpointsLocal.slice(), this.tmpStyle, this.endpointsSpaces, this);//this.getBezierSection(selected, vertices.slice(), [cp1, cp2].slice(), style, 7.5 * Math.sqrt(scale)) //testing
      (<PixiCurve>this.segment).editable = this.selected && this.selectable && this.viewport.settings.waypointEditable
      this.addChild(this.segment)

    } else if (!this.isCurved) {
      this.segment = new PixiLine(this.viewport, [this.endpointsLocal[0], this.endpointsLocal[1]], this.tmpStyle, true, this.endpointsSpaces, this)
      this.addChild(this.segment);
    }

    this.segment.interactive = this.selectable;
    this.segment.buttonMode = this.selectable;


    [this.segment.drawDone, this.segment.events.added].forEach(evt => {
      evt.pipe(takeUntil(this.segment.events.removedOrDestroyed)).subscribe(() => {
        this.drawArrowHead(this.type == 'arrow_bi' || this.type == 'arrow_bi_curved' ? 'both' : 'right')
      })
    })
    this.drawArrowHead(this.type == 'arrow_bi' || this.type == 'arrow_bi_curved' ? 'both' : 'right')
    this.segment.events.click.pipe(takeUntil(this.segment.events.removedOrDestroyed)).subscribe(() => this.selected = true)

    this.position.set(this.vertices[0].x, this.vertices[0].y)
    if (this.viewport.settings?.showRobot) {
      this.hitArea = null
    }
    setTimeout(() => this.zIndex = this.selected ? this.tmpStyle.zIndex + 10 : - 1)
    return this
  }

  drawArrowHead(type: 'left' | 'right' | 'both') {
    this.removeChild(this.leftHead)
    this.removeChild(this.rightHead)

    let PI = Math.PI;
    let d1 = 225 * PI / 180 - 20;
    let d2 = 135 * PI / 180 + 20;
    let scale = 1 / this.viewport.scale.x
    let p1: PIXI.Point, p2: PIXI.Point;
    let cosDelta = (d) => DRAWING_STYLE.arrowHeadLength * scale * Math.cos(Math.atan2(p2.y - p1.y, p2.x - p1.x) + d)
    let sinDelta = (d) => DRAWING_STYLE.arrowHeadLength * scale * Math.sin(Math.atan2(p2.y - p1.y, p2.x - p1.x) + d)


    if (type == 'right' || type == 'both') {
      p1 = this.isCurved ? this.segment?.endpointsPositions[3] : this.segment?.endpointsPositions[0]
      p2 = this.isCurved ? this.segment?.endpointsPositions[1] : this.segment?.endpointsPositions[1]
      this.rightHead = new PIXI.Graphics()
      this.rightHead.beginFill(this.tmpStyle.lineColor).drawPolygon([p2, new PIXI.Point(p2.x + cosDelta(d1), p2.y + sinDelta(d1)), new PIXI.Point(p2.x + cosDelta(d2), p2.y + sinDelta(d2))]).endFill()
      this.addChild(this.rightHead)
    }

    if (type == 'left' || type == 'both') {
      p1 = this.isCurved ? this.segment?.endpointsPositions[0] : this.segment?.endpointsPositions[0]
      p2 = this.isCurved ? this.segment?.endpointsPositions[2] : this.segment?.endpointsPositions[1]
      this.leftHead = new PIXI.Graphics()
      this.leftHead.beginFill(this.tmpStyle.lineColor).drawPolygon([p1, new PIXI.Point(p1.x - cosDelta(d1), p1.y - sinDelta(d1)), new PIXI.Point(p1.x - cosDelta(d2), p1.y - sinDelta(d2))]).endFill()
      this.addChild(this.leftHead)
    }
  }

  // getControlPointGlobalPositions(map: PixiEditableMapImage | PixiMapContainer = null): { x: number, y: number }[] {
  //   let segment = <PixiCurve>this.segment
  //   let getPosFrPoint = (p: PIXI.Point, convert = false) => {
  //     let p2 = convert ? (map ? map.toLocal(this.toGlobal(p)) : this.viewport.mainContainer.toLocal(this.toGlobal(p))) : p
  //     return { x: p2.x, y: p2.y }
  //   }
  //   return [getPosFrPoint(segment.pixiControlPoint1.position, true), getPosFrPoint(segment.pixiControlPoint2.position, true)]
  //   // let segment = <PixiCurve>this.segment
  //   // if(segment.pixiControlPoint1 && segment.pixiControlPoint2){
  //   //   return [getPosFrPoint(segment.pixiControlPoint1.position , true) , getPosFrPoint(segment.pixiControlPoint2.position , true)]
  //   // }else{
  //   //   return [getPosFrPoint(this.fromShape.position) , getPosFrPoint(this.toShape.position)]
  //   // }
  // }
}


// export class PixiEditableImage extends PixiGraphics {
//   mapCode?: string
//   robotBase?: string
//   // dataObj: JMap
//   originX: number
//   originY: number


//   readonly type = "editableImage"
//   initialWidth: number
//   initialHeight: number
//   initialOffset: PIXI.Point
//   ROS: PIXI.Sprite
//   _readonly: boolean

//   constructor(viewport: PixiViewport, readonly = false) {
//     super(viewport)
//     this.readonly = readonly
//     this.selectable = !readonly
//     this.draggable = !readonly
//     this.style.zIndex = 2
//     this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
//       this.addEditableFrame()
//       this.zIndex = 100
//       this.subscriptions.rotateEnd = this.events.rotateEnd.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
//         setTimeout(() => {
//           this.addEditableFrame()
//           this.rotateButton.toolTip.hide()
//         })
//       })
//       this.subscriptions.resizing = this.events.resizing.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
//         this.addEditableFrame()
//         this.border.children.filter(c => c instanceof PixiDashedLine).forEach((c: PixiDashedLine) => c.autoScaleModule.setScale())
//       })
//       this.subscriptions.zoomed = this.viewport.events.zoomed.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
//         this.addEditableFrame()
//       })
//     })

//     this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
//       this.removeEditorFrame()
//       this.zIndex = this.style.zIndex
//       this.subscriptions.selected?.unsubscribe()
//       this.subscriptions.zoomed?.unsubscribe()
//       this.subscriptions.resizing?.unsubscribe()
//       this.subscriptions.rotateEnd?.unsubscribe()
//     })
//   }

//   set readonly(v) {
//     this._readonly = !v
//   }

//   addRectangularBorder(width, height, lineColor = DRAWING_STYLE.highlightColor) {
//     width = width / this.scale.x
//     height = height / this.scale.y
//     let borderWidth = DRAWING_STYLE.lineWidth / (this.scale.x * this.viewport.scale.x)
//     let points = [
//       new PIXI.Point(borderWidth / 2, borderWidth / 2),
//       new PIXI.Point(width - borderWidth / 2, borderWidth / 2),
//       new PIXI.Point(width - borderWidth / 2, height - borderWidth / 2),
//       new PIXI.Point(borderWidth / 2, height - borderWidth / 2)
//     ]
//     this.addBorder(points, lineColor)
//   }

//   addEditableFrame(width = null, height = null) {
//     if (this.viewport.MOBILE_MODE) {
//       return
//     }
//     this.removeEditorFrame()
//     if (this.border == null) {
//       this.addRectangularBorder(this.initialWidth * this.scale.x, this.initialHeight * this.scale.y)
//     }
//     this.border.visible = true

//     width = width ? width : this.width
//     height = height ? height : this.height

//     this.sortableChildren = true
//     let rotateHandle = new PixiRotateHandle(this.viewport, this, width)
//     rotateHandle.toolTip.enabled = !this.isResizing
//     this.addChild(rotateHandle);
//     rotateHandle.draw()


//     this.resizeButtons = [];
//     ['nw', 'ne', 'se', 'sw'].forEach(k => {
//       let resizeHandle = new PixiResizeHandle(this.viewport, this, k, width, height)
//       resizeHandle.toolTip.enabled = !this.isResizing
//       resizeHandle.draw()
//       this.addChild(resizeHandle);
//       this.resizeButtons.push(resizeHandle)
//     })

//     this.resizeButtons = <any>this.children.filter(c => c instanceof PixiResizeHandle)
//     if (!this.isResizing) {
//       this.resizable = false
//       this.resizable = true
//     }
//   }

//   removeEditorFrame() {
//     this.children.filter(c => c instanceof PixiRotateHandle || c instanceof PixiResizeHandle).forEach((c: PixiGraphics) => {
//       this.removeChild(c)
//     })
//     if (this.border) {
//       this.border.visible = false
//     }
//   }
// }


export class PixiEditablePolygon extends PixiGraphics implements IReColor, IDraw {
  readonly type = "polygon"
  _vertices: PIXI.Point[]
  set vertices(v: PIXI.Point[]) {
    this._vertices = v
    this.initCircles()
    this.draw()
  }
  get vertices() {
    return this.circles.map(c => c.position)
  }

  _readonly = true
  set readonly(v: boolean) {
    this._readonly = v
    this.selectable = !v
    this.draggable = !v
  }
  get readonly() {
    return this._readonly
  }

  circles: PixiCircle[] = []
  edges: PixiDashedLine[] = []
  drawDone = new EventEmitter()

  constructor(viewport: PixiMapViewport, vertices: PIXI.Point[], style: PixiGraphicStyle = new PixiGraphicStyle(), readonly = true) {
    super(viewport)
    this.style = style
    this.sortableChildren = true
    this.tmpStyle = style.clone()
    this.vertices = vertices
    this.readonly = readonly
    this.draw(true)
    this.mouseOverColor = null
    this.mouseOverOutline = { color: DRAWING_STYLE.mouseOverColor, width: 3 }
    this.mouseOverEffectEnabled = true
    this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.circles.forEach(c => c.visible = true)
      this.initEdges()
      this.reColor(this.tmpStyle.fillColor)
    })

    this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.circles.forEach(c => c.visible = false)
      this.edges.forEach(e => e.parent?.removeChild(e))
      this.edges = []
      this.reColor(this.tmpStyle.fillColor)
    })
  }

  private initCircles() {
    this.circles.forEach(c => c.parent?.removeChild(c))
    this.clear()
    this.circles = []
    this._vertices.forEach(v => {
      let newCircle = new PixiCircle(this.viewport, new PIXI.Point(0, 0), this.viewport.interactiveControlRadius, new PixiGraphicStyle().setProperties({ fillColor: DRAWING_STYLE.highlightColor, lineColor: DRAWING_STYLE.highlightColor }), true)
      newCircle.filters = [<any>new OutlineFilter(2, DRAWING_STYLE.outlineColor, 1)];
      newCircle.position = v
      newCircle.zIndex = 2
      this.circles.push(newCircle)
      newCircle.visible = this.selected
      newCircle.instantDrag = true
      newCircle.dragCursor = 'grab'
      newCircle.defaultCursor = 'grab'
      newCircle.cursor = 'grab'
      newCircle.events.dragging.pipe(takeUntil(newCircle.events.removedOrDestroyed)).subscribe(() => {
        this.initEdges()
        this.draw(true)
      })
      this.addChild(newCircle)
    })
  }

  initEdges() {
    this.edges.forEach(e => e.parent?.removeChild(e))
    this.edges = []
    this.circles.forEach(c => {
      let nextCircle = c == this.circles[this.circles.length - 1] ? this.circles[0] : this.circles[this.circles.indexOf(c) + 1]
      let edge = new PixiDashedLine(this.viewport, [c.position, nextCircle.position], new PixiGraphicStyle().set('lineColor', DRAWING_STYLE.highlightColor).set('lineThickness', DRAWING_STYLE.lineWidth))
      edge.filters = [<any>new OutlineFilter(1, DRAWING_STYLE.outlineColor, 1)];
      edge.autoScaleEnabled = true
      edge.visible = this.selected
      this.edges.push(edge)
      this.addChild(edge)
    })
  }

  reColor(color: any): void {
    this.tmpStyle.opacity = this.selected ? 0.6 : 1
    // this.tmpStyle.fillColor = color
    this.draw(true)
  }

  draw(clear = true) {
    if (clear) {
      this.clear()
    }
    this.beginFill(this.tmpStyle.fillColor, this.tmpStyle.opacity).drawPolygon(this.vertices).endFill()
    this.drawDone.emit(true)
  }
}


export class PixiResizeHandle extends PixiGraphics {
  readonly type = 'imgEditHandle'
  parentGraphics: PixiGraphics
  orientation: 'nw' | 'ne' | 'se' | 'sw'
  x: number
  y: number
  frameWidth: number
  frameHeight: number
  constructor(viewport: PixiViewport, _parent: PixiGraphics, _orientation: string, _frameWidth: number, _frameHeight: number) {
    super(viewport)
    this.filters = [<any>new OutlineFilter(2, DRAWING_STYLE.outlineColor, 1)]
    this.parentGraphics = _parent
    this.orientation = (<any>_orientation)
    this.frameWidth = _frameWidth
    this.frameHeight = _frameHeight
    this.toolTip.delay = 0
    this.toolTip.contentBinding = () => this.parentGraphics.scale.x.toFixed(2) + ' x'
    this.toolTip.enabled = true
    this.parentGraphics.events.removedOrDestroyed.subscribe(() => this.toolTip.hide())
  }

  draw() {
    let edgeLength = DRAWING_STYLE.imgEditHandleSize * 2 / (this.parentGraphics.scale.x * this.viewport.scale.x)
    let cornersMap = {
      nw: [0, 0],
      ne: [this.frameWidth / this.parentGraphics.scale.x - edgeLength, 0],
      se: [this.frameWidth / this.parentGraphics.scale.x - edgeLength, this.frameHeight / this.parentGraphics.scale.y - edgeLength],
      sw: [0, this.frameHeight / this.parentGraphics.scale.y - edgeLength]
    }
    this.clear()
    this.width = this.frameWidth / this.parentGraphics.scale.x
    this.height = this.frameWidth / this.parentGraphics.scale.y
    this.beginFill(DRAWING_STYLE.highlightColor).drawRect(cornersMap[this.orientation][0], cornersMap[this.orientation][1], edgeLength, edgeLength).endFill();
    this.zIndex = 2;
    this.interactive = true
    this.setCursor()
  }

  setCursor() {
    let orientations = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']
    let index = (orientations.indexOf(this.orientation) + Math.round(Math.max(0, (this.parentGraphics.angle)) / 45)) % 8
    this.cursor = orientations[index] + '-resize'
  }
}

export class PixiRotateHandle extends PixiGraphics {
  readonly type = 'imgEditHandle'
  parentGraphics: PixiGraphics
  frameWidth: number
  polygonVertices
  pos

  constructor(viewport: PixiViewport, _parent: PixiGraphics, _frameWidth: number, _polygonVertices: PIXI.Point[] = null, _position: PIXI.Point = new PIXI.Point(0, 0)) {
    super(viewport)
    this.filters = [<any>new OutlineFilter(2, DRAWING_STYLE.outlineColor, 1)]
    this.parentGraphics = _parent
    this.frameWidth = _frameWidth
    this.polygonVertices = _polygonVertices
    this.parentGraphics.rotateButton = this
    this.parentGraphics.rotatable = false
    this.parentGraphics.rotatable = true
    this.pos = _position
  }

  draw() {
    this.clear()
    if (this.polygonVertices) {
      this.beginFill(DRAWING_STYLE.highlightColor).drawPolygon(this.polygonVertices).endFill();
      this.position.set(this.pos.x, this.pos.y)
    } else {
      this.beginFill(DRAWING_STYLE.highlightColor).drawCircle(this.frameWidth / 2, 0, DRAWING_STYLE.imgEditHandleSize * 1.3 / this.viewport.scale.x).endFill();
    }
    this.width = this.parent.width
    this.height = this.parent.height
    this.zIndex = 2;
    this.interactive = true
    this.cursor = 'crosshair'
    this.toolTip.delay = 0
    //this.toolTip.contentBinding = ()=> this.parent ? ((this.parent?.angle < 180 ? '+' + this.parent?.angle.toFixed(2) : '-' + (360 - this.parent?.angle).toFixed(2)) + "°") : null
    this.toolTip.enabled = true
    this.parentGraphics.events.removedOrDestroyed.subscribe(() => this.toolTip.hide())
    // this.rotateButton = this.parentGraphics
    this.toolTip.positionBinding = () => this.parentGraphics.toGlobal(new PIXI.Point(this.parentGraphics.width / (2 * this.parentGraphics.scale.x), 0));
    // this.rotatable = true
    this.scale.set(1 / (this.parent != null ? this.parent.scale.x : 1), 1 / (this.parent != null ? this.parent.scale.y : 1))
  }
}






  