import { Component, AfterViewInit, Input, ViewChild, ElementRef, EventEmitter, Injectable, Inject, Output, ChangeDetectorRef, Renderer2, HostListener, NgZone, OnInit, OnDestroy } from '@angular/core';
import { PixiMapViewport } from '../ng-pixi-viewport/ng-pixi-map-viewport';
import { PixiGraphicStyle } from '../ng-pixi-viewport/ng-pixi-styling-util';
import * as PIXI from 'pixi.js';
// import { Pose2D } from 'src/app/models/floor-plan.model';
import { BehaviorSubject, merge, Observable, of, Subject, Subscription, timer } from 'rxjs';
import { debounce, debounceTime, filter, retry, share, skip, switchMap, take, takeUntil } from 'rxjs/operators';
import { centroidOfPolygon, distance, getAngle, getBezierSectionPoints, getDijkstraGraph, getLength, getOrientation, getOrientationByAngle, inside, intersectionsOfCircles, trimAngle, trimNum } from '../../math/functions';
import * as Viewport from 'pixi-viewport';
import { ColorReplaceFilter } from '@pixi/filter-color-replace';
import { GlowFilter } from '@pixi/filter-glow';
import { OutlineFilter } from '@pixi/filter-outline';
import { ColorOverlayFilter } from '@pixi/filter-color-overlay';
import { GetImage, GetImageDimensions } from '../../graphics/image';
import { ConvertColorToHexadecimal, ConvertColorToDecimal } from '../../graphics/style'
import { DRAWING_STYLE } from '../ng-pixi-viewport/ng-pixi-styling-util';
import { IDraw as IDraw, IReColor, Pixi1DGraphics, PixiBorder, PixiCircle, PixiCurve, PixiDashedLine, PixiLine, PixiGraphics, canDraw, PixiArrow, PixiRotateHandle, PixiResizeHandle, PixiEditablePolygon } from '../ng-pixi-viewport/ng-pixi-base-graphics';
import { calculateMapOrigin, calculateMapX, calculateMapY } from '../../../ui-components/map-2d-viewport/pixi-ros-conversion'
import { JMap, JPath, JPoint } from 'src/app/services/data.models';
import { CLICK_EVENTS, MOVE_EVENTS } from './ng-pixi-constants';
import { GetPixiAngleDescription } from './ng-pixi-functions';

const ROBOT_ACTUAL_LENGTH_METER = 1


export class PixiMapGraphics extends PixiGraphics {
  public type: 'circle' | 'line' | 'curve' | 'dashed_line' | 'polygon' | 'border' | 'arrow_curved' | 'arrow_bi_curved' | 'imgEditHandle' |
    'arrow_bi' | 'arrow' | 'mapLayer' | 'pointGroup' | 'waypoint' | 'childPoint' | 'mapContainer' | 'origin' | 'brush' | 'tag' | 'eventMarker'

  viewport: PixiMapViewport
  constructor(viewport: PixiMapViewport) {
    super(<any>viewport)
  }
  //TBD : MOVE MODULES INTO CLASSES

  //-------------------------------------------------------------------------------------------------------------------------------------------------------

  //v AUTO SCALE MODULE v
  autoScaleModule: { enabled: boolean, counterScaleBinding: Function, zoomSubscription: Subscription | null, setScale: Function, debounce: number, scaleThreshold: { max: number, min: number } } = {
    enabled: false,
    zoomSubscription: null,
    debounce: 0,
    scaleThreshold: { max: 0.5, min: 0.025 },
    counterScaleBinding: () => (this.parent != null ? this.parent.scale.x : 1),
    setScale: () => {
      if (this.dimensionType == '1D' && canDraw(this)) {
        this.draw(true)
      } else if (this.type == 'waypoint' || this.type == 'eventMarker') {
        let max = this.autoScaleModule.scaleThreshold.max, min = this.autoScaleModule.scaleThreshold.min
        let exceedsThreshold = this.viewport.settings.mapTransformedScale && this.viewport.scale.x < max / this.viewport.settings.mapTransformedScale
        let weight = this.selected || !exceedsThreshold ? 1 : Math.min(1, Math.sqrt((Math.min(max, this.viewport.scale.x) - min) / (max - min)))
        let scale = DRAWING_STYLE.markerScale * weight / this.viewport.scale.x * (this.autoScaleModule.counterScaleBinding())
        this.scale.set(scale, scale)
      } else {
        this.scale.set(1 / (this.autoScaleModule.counterScaleBinding() * this.viewport.scale.x) , 1 / (this.autoScaleModule.counterScaleBinding() * this.viewport.scale.y))
      }
    }
  }
}

//#######################################################################################################################################################


export class PixiTaskPath extends Pixi1DGraphics {
  targetCodes?
  taskItemIndex?
}

//#######################################################################################################################################################

//#######################################################################################################################################################

export class PixiWaypointAngleIndicator extends PixiMapGraphics {
  bgCircle: PIXI.Graphics
  parentGraphics: PixiMapGraphics

  constructor(viewport: PixiMapViewport, _parentGraphics, points = null) {
    super(viewport)
    this.parentGraphics = _parentGraphics
    points = points ? points : [new PIXI.Point(-10, - 65), new PIXI.Point(10, -65), new PIXI.Point(0, - 90)]
    this.lineStyle(0).beginFill(DRAWING_STYLE.highlightColor, 0.8).drawPolygon(points).endFill()
    this.bgCircle = new PIXI.Graphics()
    this.bgCircle.lineStyle(2, DRAWING_STYLE.highlightColor, 0.5).beginFill(DRAWING_STYLE.highlightColor, 0.1).drawCircle(0, 0, 65).endFill()
    this.parentGraphics.addChild(this.bgCircle)
    this.hide()
    this.interactive = true
    this.cursor = 'crosshair'
    this.zIndex = 10
    this.parentGraphics.addChild(this)
    this.rotatable = true
    this.toolTip.positionBinding = () => this.toGlobal((new PIXI.Point(this.position.x - 10, this.position.y - 65)))
    this.toolTip.delay = 100
    this.toolTip.contentBinding = () => GetPixiAngleDescription(this)
    this.toolTip.enabled = true
  }

  hide() {
    this.visible = false
    this.bgCircle.visible = false
    this.toolTip.hide()
  }

  show() {
    this.visible = true
    this.bgCircle.visible = true
  }
}

export class PixiPointGroup extends PixiMapGraphics { //########## implements IReColor
  readonly type = 'pointGroup'
  parentPoint: PixiWayPoint
  pixiChildPoints: PixiChildPoint[]
  settings: {
    custom: boolean,
    space: number,
    pivot: { x: number, y: number },
    position: { x: number, y: number },
    relativePosition: { x: number, y: number },
    angle: number,
    bgWidth: number,
    bgHeight: number,
    width: number,
    height: number,
    scale: number,
    robotCount: number,
    row: number,
    column: number,
    neverCustomized: boolean,
  } = {
      custom: false,
      space: 1,
      pivot: null,
      position: null,
      relativePosition: null,
      angle: 0,
      width: 0,
      height: 0,
      bgWidth: 0,
      bgHeight: 0,
      scale: 1,
      robotCount: 3,
      row: 1,
      column: 3,
      neverCustomized: true
    }
  rotateHandle: PixiRotateHandle
  bgRectangle = new PixiMapGraphics(this.viewport)
  currentFormation = {
    row: 0,
    column: 0,
    space: 0,
    robotCount: 0
  }
  maxRow
  maxCol
  iconSprite: PIXI.Sprite
  iconSpriteDimension
  svgUrl = 'assets/icons/arrow-up.svg'
  rotateHandlePos = new PIXI.Point(0, 0)

  constructor(viewport: PixiMapViewport, _parentPoint) {
    super(viewport)
    this.iconSprite = new PIXI.Sprite(PIXI.Texture.from(this.svgUrl))
    this.interactive = true
    this.sortableChildren = true
    this.parentPoint = _parentPoint
    this.viewport.mainContainer.addChild(this)
    this.parentPoint.events.unselected.pipe(takeUntil(this.parentPoint.events.removedOrDestroyed)).subscribe(() => {
      this.refreshGraphics()
    })
    this.parentPoint.events.selected.pipe(takeUntil(this.parentPoint.events.removedOrDestroyed)).subscribe(() => {
      this.refreshGraphics()
    })
    if (this.parentPoint.selected) {
      this.refreshGraphics()
    }
    this.addChild(this.bgRectangle)


    this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.refreshGraphics()
      this.draw()
      this.parentPoint.draw()
    })
    this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      setTimeout(() => this.viewport.selectedGraphics = this.parentPoint)
      this.refreshGraphics()
      this.draw()

      // this.viewport.selectedGraphics = this.parentPoint
    })
  }

  // this.angleHandle = new PixiAngleAdjustHandle(this, [new PIXI.Point(0, 0), new PIXI.Point(this.settings.scale * ROBOT_ACTUAL_LENGTH_METER /2, 0) ,  new PIXI.Point(this.settings.scale * ROBOT_ACTUAL_LENGTH_METER / 4, this.settings.scale * ROBOT_ACTUAL_LENGTH_METER / 2 )])
  // this.angleHandle.pivot.set(this.angleHandle.width / 2 , - (this.settings.scale * ROBOT_ACTUAL_LENGTH_METER + this.bgRectangle.height / 2))
  async draw() {
    // if(!this.settings.custom && !this.selected ){
    //   this.refreshRotateHandle()
    // }
    let top = Math.min.apply(null, this.pixiChildPoints.map(p => p.position.y))
    let left = Math.min.apply(null, this.pixiChildPoints.map(p => p.position.x))
    let right = Math.max.apply(null, this.pixiChildPoints.map(p => p.position.x)) + this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    let btm = Math.max.apply(null, this.pixiChildPoints.map(p => p.position.y)) + this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    this.drawBackground(new PIXI.Point(right, btm), new PIXI.Point(left, top))
    this.pixiChildPoints?.forEach(c => {
      c.robotIconScale = this.settings.scale
      c.editable = this.settings.custom
      c.draw()
    })
    this.cursor = this.selected ? 'move' : 'pointer'
  }

  refreshGraphics() { //TBD : enhance performance by getting single sprite for all PixiChildPoint instead of multiple
    let rosMapScale = (<any>Object.values(this.viewport.mapLayerStore)[0])?.scale?.x
    let scale = rosMapScale * this.viewport.METER_TO_PIXEL_RATIO
    let scaleChanged = this.settings.scale != scale
    this.settings.scale = scale
    if ((!this.settings.custom && (scaleChanged || !this.pixiChildPoints))) {
      this.createNewUniformChildPoints()
    } else if (scaleChanged || this.pixiChildPoints) {
      this.loadChildWayPoints()
    }
    this.draw()
    // this.refreshParentPointGraphic()
    this.visible = this.selected || this.parentPoint?.selected || this.pixiChildPoints.some(c => c.selected)
    this.selectable = (this.selected || this.parentPoint?.selected) && !this.settings.custom
    // this.instantDrag = this.selected
    this.draggable = this.selected
    if (this.pixiChildPoints.includes(<any>this.viewport.selectedGraphics) && !this.settings.custom) {
      setTimeout(() => this.viewport.selectedGraphics = this.parentPoint)
    }
    // this.pixiChildPoints.forEach(c=>c.scale.set(1/this.parentPoint.scale.x , 1/this.parentPoint.scale.y))
  }

  loadChildWayPoints() {
    if (!this.settings.relativePosition) {
      this.refreshRelativePosition()
    }
    this.pixiChildPoints.forEach(c => c.draw())
  }

  createNewUniformChildPoints() {
    this.clear()
    let scale = this.settings.scale
    this.resetChildPoints()
    this.pixiChildPoints = []
    let spacePx = Math.round(scale * this.settings.space)
    let lengthPx = Math.round(scale * ROBOT_ACTUAL_LENGTH_METER)
    let k = 0
    let columnCntOfRemainderRow = this.settings.robotCount % this.settings.column == 0 ? this.settings.column : (this.settings.robotCount % this.settings.column)
    for (let i = 0; i < this.settings.row; i++) {
      let lastRowPaddingX = i == this.settings.row - 1 ? ((this.settings.column - columnCntOfRemainderRow) * (lengthPx + spacePx)) / 2 : 0
      let withOneRobotOnly = this.settings.robotCount - this.pixiChildPoints.length <= this.settings.row - i
      for (let j = 0; j < (withOneRobotOnly ? 1 : (i == this.settings.row - 1 ? columnCntOfRemainderRow : this.settings.column)); j++) {
        lastRowPaddingX = withOneRobotOnly ? (lengthPx + lengthPx) * (this.settings.column - 1) / 2 : lastRowPaddingX
        k = k + 1
        let childPoint = new PixiChildPoint(this.viewport, this, scale, k)
        childPoint.position.set(lastRowPaddingX + j * (spacePx + lengthPx), i * (spacePx + lengthPx))
        this.pixiChildPoints.push(childPoint)
      }
    }
    this.settings.bgWidth = spacePx * Math.max(0, this.settings.column - 1) + (scale * ROBOT_ACTUAL_LENGTH_METER) * this.settings.column
    this.settings.bgHeight = spacePx * Math.max(0, this.settings.row - 1) + (scale * ROBOT_ACTUAL_LENGTH_METER) * this.settings.row
    this.pivot.set(this.settings.bgWidth / 2, this.settings.bgHeight / 2)
    if (!this.settings.relativePosition) {
      this.settings.relativePosition = { x: 0, y: - (this.settings.bgHeight + (scale * ROBOT_ACTUAL_LENGTH_METER)) / 2 }
    }
    this.position.set(this.parentPoint.x + this.settings.relativePosition.x, this.parentPoint.y + this.settings.relativePosition.y)
  }

  resetChildPoints() {
    this.pixiChildPoints?.forEach(c => c.parent.removeChild(c))
    this.pixiChildPoints = null
  }

  adjustRowCount() {
    this.settings.column = this.settings.column > this.settings.robotCount ? this.settings.robotCount : this.settings.column
    this.viewport.ngZone.run(() => this.settings.row = Math.ceil(this.settings.robotCount / this.settings.column))
    this.resetChildPoints()
    this.refreshGraphics()
  }

  adjustColumnCount() {
    this.settings.row = this.settings.row > this.settings.robotCount ? this.settings.robotCount : this.settings.row
    this.viewport.ngZone.run(() => this.settings.column = Math.ceil(this.settings.robotCount / this.settings.row))
    this.resetChildPoints()
    this.refreshGraphics()
  }

  refreshPosition() {
    this.position.set(this.parentPoint.position.x + this.settings.relativePosition.x, this.parentPoint.position.y + this.settings.relativePosition.y)
  }

  refreshRelativePosition() {
    this.settings.relativePosition = new PIXI.Point(this.position.x - this.parentPoint.position.x, this.position.y - this.parentPoint.position.y)
  }

  refreshRotateHandle(position: PIXI.Point = this.rotateHandlePos) {
    this.rotateHandle?.parent?.removeChild(this.rotateHandle)
    if (!this.settings.neverCustomized) {
      return
    }
    let len = this.settings.scale * ROBOT_ACTUAL_LENGTH_METER
    this.rotateHandle = new PixiRotateHandle(this.viewport, this, this.settings.bgWidth, [new PIXI.Point(0 - len / 4, - len / 5), new PIXI.Point(0, - len / 1.5), new PIXI.Point(len / 4, - len / 5)], position)
    this.addChild(this.rotateHandle);
    this.rotateHandle.draw()
    this.rotateHandle.visible = true
  }

  drawBackground(bottomRightCorner: PIXI.Point = new PIXI.Point(0, 0), topLeftCorner: PIXI.Point = new PIXI.Point(0, 0)) {
    let selected = this.selected  //&& !this.settings.custom // this.masterComponent.editObj.graphics == this
    //this.bgRectangle.interactive = !this.settings.custom
    // this.bgRectangle.cursor = selected ? "move" : (!this.settings.custom ? 'pointer' : 'default')
    this.bgRectangle.zIndex = -1
    let color = selected ? DRAWING_STYLE.highlightColor : 0xdddddd
    this.bgRectangle.clear()
    if (!this.settings.custom) {
      this.rotateHandlePos.x = topLeftCorner.x + (bottomRightCorner.x - topLeftCorner.x) / 2
      this.rotateHandlePos.y = topLeftCorner.y
      this.settings.bgWidth = bottomRightCorner.x - topLeftCorner.x
      this.settings.bgHeight = bottomRightCorner.y - topLeftCorner.y
      this.refreshRelativePosition()
      this.bgRectangle.lineStyle(0.1 * this.settings.scale, color, selected ? 0.4 : 0.7, 1).moveTo(topLeftCorner.x, topLeftCorner.y).lineTo(bottomRightCorner.x, topLeftCorner.y).lineTo(bottomRightCorner.x, bottomRightCorner.y).lineTo(topLeftCorner.x, bottomRightCorner.y).lineTo(topLeftCorner.x, topLeftCorner.y)
      this.bgRectangle.beginFill(color, selected ? 0.2 : 0.7).drawRect(topLeftCorner.x, topLeftCorner.y, this.settings.bgWidth, this.settings.bgHeight).endFill()

    }
    if (selected) {
      this.refreshRotateHandle()
    } else {
      this.rotateHandle?.parent?.removeChild(this.rotateHandle)
    }
  }
}

export class PixiChildPoint extends PixiMapGraphics implements IReColor {
  readonly type = 'childPoint'
  pixiPointGroup: PixiPointGroup
  robotIconScale
  actualLengthPx
  icon: PIXI.Graphics
  _editable = false
  _angle = this.angle
  seq = 0
  _selected
  textSprite: PIXI.Sprite
  set robotAngle(v) {
    this._angle = v
    this.icon.angle = v
  }

  get robotAngle() {
    return this._angle
  }

  set editable(v) {
    this._editable = v
    this.interactive = v
    this.cursor = v ? 'pointer' : 'default'
    this.zIndex = v ? 20 : 1
  }
  get editable() {
    return this._editable
  }
  constructor(viewport: PixiMapViewport, _pointGroup: PixiPointGroup, _robotIconScale: Number, seq: number) {
    super(viewport)
    this.seq = seq
    this.style = new PixiGraphicStyle().set('fillColor', DRAWING_STYLE.mouseOverColor)
    this.tmpStyle = this.style.clone()
    this.pixiPointGroup = _pointGroup
    this.robotIconScale = _robotIconScale
    this.zIndex = 10
    this.draw()
    this.pixiPointGroup.addChild(this)
    this.pixiPointGroup.parentPoint.events.selected.pipe(takeUntil(this.events.destroyed)).subscribe(() => {
      this.selectable = this.pixiPointGroup.settings.custom
      this.draggable = this.pixiPointGroup.settings.custom
    })
    this.events.selected.pipe(takeUntil(this.events.destroyed)).subscribe(() => {
      this.pixiPointGroup.parentPoint.draw()
      this.cursor = 'move'
    })
    this.events.unselected.pipe(filter(v => this.pixiPointGroup.pixiChildPoints.every(c => this.viewport.selectedGraphics != c)), takeUntil(this.events.destroyed)).subscribe(() => {
      setTimeout(() => {
        this.viewport.selectedGraphics = this.pixiPointGroup.parentPoint
      })
    })
  }

  reColor(color: any): void {
    this.tmpStyle.fillColor = color
    this.draw()
    this.icon.filters = null
    this.icon.filters = [<any>new ColorReplaceFilter(0x000000, color, 1)]
    this.icon.clear()
    this.icon.beginFill(color, 0.2).lineStyle(0.1 * this.robotIconScale, color, 1, 0).drawRoundedRect(0, 0, this.actualLengthPx, this.actualLengthPx, 0.1 * this.robotIconScale).endFill()
  }

  async draw() {
    if (!this.icon || (this.robotIconScale * ROBOT_ACTUAL_LENGTH_METER != this.actualLengthPx)) { //|| this._selected != selected
      // this._selected = selected
      let color = this.tmpStyle.fillColor// selected ? DRAWING_STYLE.highlightColor : DRAWING_STYLE.mouseOverColor
      this.actualLengthPx = this.robotIconScale * ROBOT_ACTUAL_LENGTH_METER
      this.icon?.parent?.removeChild(this.icon)
      this.icon = new PIXI.Graphics()
      let iconSprite = new PIXI.Sprite(this.pixiPointGroup.iconSprite.texture)
      if (!this.pixiPointGroup.iconSpriteDimension) {
        this.pixiPointGroup.iconSpriteDimension = await GetImageDimensions(this.pixiPointGroup.svgUrl)
      }
      iconSprite.scale.set(this.actualLengthPx / this.pixiPointGroup.iconSpriteDimension[0], this.actualLengthPx / this.pixiPointGroup.iconSpriteDimension[1])
      this.icon.addChild(iconSprite)
      this.icon.filters = [<any>new ColorReplaceFilter(0x000000, color, 1)]
      this.icon.pivot.set(this.actualLengthPx / 2, this.actualLengthPx / 2)
      this.icon.position.set(this.actualLengthPx / 2, this.actualLengthPx / 2)
      this.icon.angle = this.robotAngle
      this.icon.beginFill(color, 0.2).lineStyle(0.1 * this.robotIconScale, color, 1, 0).drawRoundedRect(0, 0, this.actualLengthPx, this.actualLengthPx, 0.1 * this.robotIconScale).endFill()
      let text = new PIXI.Text(this.seq.toString(), { fontFamily: 'Arial', fontSize: 50, fill: '#FFFFFF' })
      this.textSprite = new PIXI.Sprite(text.texture)
      this.textSprite.zIndex = 20
      this.textSprite.pivot.set(text.width / 2, text.height / 2)
      this.textSprite.position.set(this.icon.pivot.x, this.icon.pivot.y)
      this.textSprite.scale.set(iconSprite.height / (3 * this.textSprite.height), iconSprite.height / (3 * this.textSprite.height))
      this.textSprite.angle = this.pixiPointGroup.angle * - 1
      this.sortableChildren = true
      this.addChild(this.textSprite)
      this.addChild(this.icon)
    }
    if (!this.selected) {
      this.cursor = this.editable ? 'pointer' : 'default'
    }
    // this.pixiPointGroup.refreshParentPointGraphic()
  }
}


export class PixiWayPoint extends PixiMapGraphics implements IDraw, IReColor {
  drawDone = new EventEmitter()
  id
  waypointName // full code
  robotBases = [];
  robotBasesOptions = [];
  set hasPointGroup(v) {
    if (!this.pixiPointGroup && v) {
      this.pixiPointGroup = new PixiPointGroup(this.viewport, this)
      this.centerAndZoom()
    } else if (this.pixiPointGroup && !v) {
      this.pixiPointGroup.parent.removeChild(this.pixiPointGroup)
      this.pixiPointGroup = null
    }
  }
  get hasPointGroup() {
    return this.pixiPointGroup != null && this.pixiPointGroup != undefined
  }
  pixiPointGroup?: PixiPointGroup
  onDelete = new Subject()
  get code() {
    return this.text
  }
  link: { arrow: PixiPath, waypoint: PixiWayPoint }[] = []
  button: PixiMapGraphics
  readonly = false
  iconType = null
  pointType = "NORMAL"
  onInputBlur: EventEmitter<any> = new EventEmitter()
  get orientationAngle() {
    return this.angleIndicator?.angle
  }
  set orientationAngle(v) {
    if (this.angleIndicator) {
      this.angleIndicator.angle = v
    }
  }
  get text() {
    return this.myText
  }
  set text(t) {
    this.myText = t
    this.refreshPixiText()
  }
  myText = null
  badge: PIXI.Graphics
  badgeCnt = 0
  angleIndicator: PixiWaypointAngleIndicator
  taskItemSeqLabel: PixiTaskSeqMarker
  taskSeq = ''
  seqMarkerColor = DRAWING_STYLE.secondaryHighlightColor
  seqMarkerFlashInterval = null
  toolTipContent
  taskItemIndex: number
  dataObj: JPoint
  icon: PIXI.Sprite
  iconContainer = new PIXI.Graphics();
  _iconUrl
  set iconUrl(base64) {
    this._iconUrl = base64 && base64.length > 0 ? base64 : null
    this.icon = this.iconUrl ? PIXI.Sprite.from(this.iconUrl) : null
    this.iconDimension = null
    this.draw()
  }

  get iconUrl() {
    return this._iconUrl
  }
  pixiText = new PIXI.Text("")
  rosX
  rosY
  get enabled(){
    return this._enabled
  }
  set enabled(v){
    this._enabled = v
    this.alpha = this._enabled ? 1 : 0.4
  }
  _enabled = true
  iconDimension
  txtBg = new PIXI.Graphics()


  constructor(viewport: PixiMapViewport, text = null, style: PixiGraphicStyle = new PixiGraphicStyle, editable = false, iconUrl = null, iconType = 'NORMAL') {
    super(viewport)
    this.multiSelectable = true
    style.zIndex = -1
    style.fillColor = ConvertColorToDecimal(this.viewport.selectedStyle.marker.color) 
    this.addChild(this.txtBg)
    this.type = 'waypoint'
    this.readonly = !editable
    this.draggable = !this.readonly
    this.autoScaleEnabled = true
    this.iconType = iconType
    // this.icon = iconUrl ? PIXI.Sprite.from(iconUrl) : null
    this.iconUrl = iconUrl
    this.style = style
    this.tmpStyle = style.clone()
    this.sortableChildren = true
    this.text = text
    this.zIndex = 5
    this.selectable = true
    this.initNodeButton()
    this.initAngleIndicator()
    this.initEventHandlers()
    this.toolTip.contentBinding = () => this.text
    this.toolTip.enabled = true
    this.mouseOverEffectEnabled = true;
    [this.events.dragEnd, this.events.dragging].forEach(e => e.subscribe(() => this.onPositionChange()))
    this.events.removedOrDestroyed.subscribe(() => {
      this.pixiPointGroup?.pixiChildPoints?.forEach(p => p.events.removedOrDestroyed.emit(true))
      this.pixiPointGroup?.events.removedOrDestroyed.emit(true)
    })
    // this.events.move.pipe(filter(v=>!this.pixiPointGroup?.selected) ,takeUntil(this.events.removedOrDestroyed)).subscribe(()=> this.onPositionChange())
  }

  focusInput() {
    (<any>document.getElementsByClassName('waypoint-name-textbox')[0]?.getElementsByTagName('INPUT')[0])?.focus()
  }

  initEventHandlers() {
    this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      if (this.angleIndicator) {
        this.angleIndicator.show()
      }
      this.pixiText.visible = true
      this.txtBg.visible = true

    })

    this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      if (this.angleIndicator) {
        this.angleIndicator.hide()
      }
      this.pixiText.visible = this.viewport.toggleModule.flags.showWaypointName
      this.txtBg.visible = this.viewport.toggleModule.flags.showWaypointName
    })

    this.events.added.subscribe(() => this.draw())
  }

  initNodeButton() {
    this.button = new PixiMapGraphics(this.viewport)
    this.button.beginFill(0x000000, 0.15).drawRoundedRect(-40, -40, 80, 100, 5).endFill()
    this.button.zIndex = 0
    // this.button['type'] = 'button'
    this.button.interactive = true
    this.button.cursor = 'pointer'
    this.button.visible = false
    this.button.events.click.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe((e: PIXI.interaction.InteractionEvent) => e.stopPropagation())
    this.addChild(this.button)
  }

  initAngleIndicator() {
    if (!this.readonly) {
      this.angleIndicator = new PixiWaypointAngleIndicator(this.viewport, this)
      this.angleIndicator.zIndex = -1
      return
    }
  }

  refreshRosPositionValue() {
    let map: PixiMap = <PixiEditableMapImage>(this.viewport.mainContainer.children.filter(c => c instanceof PixiEditableMapImage)[0]);
    if (this.viewport.APP_BUILD == 'STANDALONE' && map) {
      let globalPosition = (<any>map).toLocal(this.viewport.mainContainer.toGlobal(new PIXI.Point(this.position.x, this.position.y)))
      let positions = map.calculateRosPosition({ x: globalPosition.x, y: globalPosition.y })
      this.rosX = positions.x
      this.rosY = positions.y
    } else if (!map) {
      this.rosX = undefined
      this.rosY = undefined
    }
  }

  refreshPositionByRosValue() {
    let map: PixiMap = <PixiEditableMapImage>(this.viewport.mainContainer.children.filter(c => c instanceof PixiEditableMapImage)[0]);
    if (this.viewport.APP_BUILD == 'STANDALONE' && map) {
      let mapPosition = { x: map.calculateMapX(this.rosX), y: map.calculateMapY(this.rosY) }
      let localPosition = this.viewport.mainContainer.toLocal((<any>map).toGlobal({ x: mapPosition.x, y: mapPosition.y }))
      this.position.set(localPosition.x, localPosition.y)
      this.refreshLinkedArrowPosition()
      //##########
      // drawingBoard.refreshArrows(this)
      //##########
    }
  }

  onPositionChange() {
    this.refreshLinkedArrowPosition()
    this.pixiPointGroup?.refreshPosition();
    if (this.viewport.selectedGraphics instanceof PixiWayPoint) {
      (<PixiWayPoint>this.viewport.selectedGraphics).refreshRosPositionValue()
    }

    // this.getMasterComponent()?.refreshArrows(this);
    // this.pixiPointGroup?.refreshPosition();
    // this.getMasterComponent()?.ngZone.run(()=> (<PixiWayPoint>this.getMasterComponent()?.selectedGraphics).refreshRosPositionValue())
  }

  toggleButton(show) {
    this.interactive = !show
    this.button.visible = show
  }

  reColor(color) {
    this.tmpStyle.lineColor = color//highlight ? DRAWING_STYLE.highlightColor : ( isMouseOver ? DRAWING_STYLE.mouseOverColor : style.lineColor)
    this.tmpStyle.fillColor = color //highlight ? DRAWING_STYLE.highlightColor : ( isMouseOver ? DRAWING_STYLE.mouseOverColor : style.fillColor)
    this.draw()
  }

  get needHighlight() {
    //TBR : this.pixiPointGroup?.pixiChildPoints?.some(c=>c.selected) not working
    return this.pixiPointGroup?.selected || this.pixiPointGroup?.pixiChildPoints?.some(c => c.selected)
  }

  async draw() {
    this.clear()
    if (this.taskItemSeqLabel) {
      this.iconContainer?.parent?.removeChild(this.iconContainer)
      this.taskItemSeqLabel.tint = this.tmpStyle.fillColor == DRAWING_STYLE.mouseOverColor ? DRAWING_STYLE.mouseOverColor : DRAWING_STYLE.secondaryHighlightColor
      if (this.taskItemSeqLabel.isHollow) {
        this.taskItemSeqLabel.text.style.fill = this.taskItemSeqLabel.tint
        this.taskItemSeqLabel.text.style.fill = this.taskItemSeqLabel.tint
      }
    }
    this.refreshPixiText()

    if (this.taskSeq?.length == 0) {
      if (this.icon) {
        // console.log(this.icon.scale.x)
        this.iconContainer?.parent?.removeChild(this.iconContainer)
        this.icon.parent?.removeChild(this.icon)
        this.iconContainer = new PIXI.Graphics()
        this.iconContainer.height = 50
        this.iconContainer.width = 50
        this.iconContainer.position.set(-25, -40)
        this.iconDimension = this.iconDimension ? this.iconDimension : await GetImageDimensions(this.iconUrl)
        if (this.iconDimension[0] > 50 || this.iconDimension[1] > 50) {
          this.icon.scale.set(50 / (Math.max(this.iconDimension[0], this.iconDimension[1])))
        }
        this.iconContainer.addChild(this.icon)
        this.icon.filters = [<any>new ColorReplaceFilter(0x000000, this.needHighlight ? DRAWING_STYLE.highlightColor : this.tmpStyle.fillColor, 0)]
        this.icon.position.set(this.iconDimension[0] > this.iconDimension[1] ? 0 : (50 - this.iconDimension[0] * this.icon.scale.x) / 2, this.iconDimension[1] > this.iconDimension[0] ? 0 : (50 - this.iconDimension[1] * this.icon.scale.y) / 2)
        this.addChild(this.iconContainer)
      } else {
        this.iconContainer?.parent?.removeChild(this.iconContainer)

        //########## */ this.getCircle(new PIXI.Point(0, 0), 10,  style)
        //this.children.filter(c=> c instanceof PixiCircle).forEach(c=>c.parent.removeChild(c))
        this.beginFill(this.needHighlight ? DRAWING_STYLE.highlightColor : this.tmpStyle.fillColor).drawCircle(0, 0, 10).endFill()
        // this.addChild(new PixiCircle(this.viewport ,  new PIXI.Point(0, 0) , 3 , style , false))
      }
    }

    this.interactive = true

    this.cursor = this.instantDrag? 'move': ( this.selected && !this.readonly ? 'move' : 'pointer')
    // this.autoScale()
    this.zIndex = this.selected ? 20 : 5

    if (!this.isBeingMouseOvered && !this.selected) {
      this.autoScaleModule.setScale()
    }

    this.refreshRosPositionValue()

    // if(this.pixiPointGroup){
    //   this.pixiPointGroup.refreshGraphics()
    //   this.pixiPointGroup.visible = this.selected
    // }

    this.drawDone.emit()
    return this
  }

  refreshPixiText() {
    this.txtBg.zIndex = -1
    if (!this.children.includes(this.pixiText)) {
      this.pixiText.anchor.set(0.5)
      this.pixiText.position.set(this.pixiText.position.x, 35)
      this.addChild(this.pixiText)
    }
    this.pixiText.text = this.text?.length > 15 ? this.text?.substring(0, 15) + '...' : this.text
    //let color = this.selected ? this.tmpStyle.fillColor : (this.taskSeq?.length > 0 ? this.tmpStyle.fillColor == DRAWING_STYLE.mouseOverColor ? DRAWING_STYLE.mouseOverColor : this.seqMarkerColor : this.tmpStyle.fillColor)
    this.pixiText.style.fill = this.taskItemSeqLabel ? this.taskItemSeqLabel.tint : (this.needHighlight ? DRAWING_STYLE.highlightColor : this.tmpStyle.fillColor)
    let bgColor = Math.abs(0xffffff - this.style.fillColor) < Math.abs(0x000000 - this.style.fillColor) ? 0x444444 : 0xffffff
    this.txtBg.clear()
    this.txtBg.lineStyle(0).beginFill(bgColor, 0.7).drawRect(-this.pixiText.width / 2 - 10, this.pixiText.height - 10, this.pixiText.width + 20, this.pixiText.height + 5).endFill()
  }


  setTaskItemSeq(v: string, color: number = DRAWING_STYLE.secondaryHighlightColor, hollow = false, flash = false) {
    this.taskSeq = v
    this.drawTaskItemIndexLabel(color, hollow)
    if (flash) {
      this.seqMarkerFlashInterval = setInterval(() => { this.drawTaskItemIndexLabel(color, !this.taskItemSeqLabel?.['isHollow']) }, 1500)
    } else if (this.seqMarkerFlashInterval) {
      clearInterval(this.seqMarkerFlashInterval)
    }
  }


  drawTaskItemIndexLabel(color: number, hollow) {
    let textColor = hollow ? color : 0xFFFFFF
    if (this.taskItemSeqLabel) {
      this.removeChild(this.taskItemSeqLabel)
    }
    if (this.taskSeq?.length > 0) {
      this.taskItemSeqLabel = new PixiTaskSeqMarker()
      this.taskItemSeqLabel.isHollow = hollow
      this.addChild(this.taskItemSeqLabel)
      const textSprite = new PIXI.Text(this.taskSeq, { fontFamily: 'Arial', fill: textColor, fontSize: 35, strokeThickness: 1, stroke: textColor });
      this.taskItemSeqLabel.addChild(textSprite)
      this.seqMarkerColor = color
      this.taskItemSeqLabel.tint = this.seqMarkerColor
      textSprite.position.set((-1 / 2) * textSprite.width, 0)
      this.taskItemSeqLabel.text = textSprite
      this.taskItemSeqLabel.lineStyle(2, 0xffffff).beginFill(0xffffff, hollow ? 0 : 1).drawRect((-1 / 2) * textSprite.width - 10, 0, textSprite.width + 20, textSprite.height).endFill()
      this.taskItemSeqLabel.position.set(0, -textSprite.height * 0.75)
    }else{
      this.taskItemSeqLabel  = null
    }
    setTimeout(() => this.draw())
    // this.iconContainer?.parent?.removeChild(this.iconContainer)
  }



  centerAndZoom() {
    if (this.pixiPointGroup?.pixiChildPoints?.[0]) {
      let zoomWidth = (this.pixiPointGroup.pixiChildPoints?.[0]?.robotIconScale * ROBOT_ACTUAL_LENGTH_METER) * this.viewport.METER_TO_PIXEL_RATIO
      let vp = this.viewport
      let idx = Math.floor(this.pixiPointGroup?.pixiChildPoints?.length / 2)
      let zoomPos = this.viewport.mainContainer.toLocal(this.pixiPointGroup?.toGlobal(new PIXI.Point(this.pixiPointGroup.pixiChildPoints?.[idx]?.x, this.pixiPointGroup.pixiChildPoints?.[idx]?.y)))
      vp?.snapZoom({ removeOnComplete: true, width: zoomWidth, interrupt: false, time: 1500, center: zoomPos })
      for (let i = 0; i < 60; i++) {
        setTimeout(() => {
          this.viewport.zoomed.next(true)
          //########## 
          // this.getMasterComponent()?.refreshArrows()    
          //##########   
        }, i * 25)
      }
    }
  }

  refreshLinkedArrowPosition() {
    this.viewport.allPixiPaths.filter(a => a.fromShape == this || a.toShape == this).forEach(a => a.refreshVerticesFromLinkedLocPts(true))
  }
}

export class PixiTaskSeqMarker extends PIXI.Graphics {
  isHollow = false
  text: PIXI.Text
  type
  constructor() {
    super()
    this.type = 'remarks'
  }
}


//#######################################################################################################################################################
export class PixiRosMapOriginMarker extends PixiMapGraphics {
  constructor(viewport: PixiMapViewport) {
    super(viewport);
    this.type = 'origin'
    this.lineStyle(3, 0xFF0000).moveTo(- 15, 0).lineTo(15, 0);
    this.lineStyle(3, 0xFF0000).moveTo(0, - 15).lineTo(0, 15);
    this.events.added.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => this.resize())
    this.viewport.events.zoomed.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => this.resize())
  }
  resize() {
    if (this.viewport && this.parent) {
      let scale = 1 / (this.viewport.scale.x * this.parent?.scale.x)
      this.scale.set(scale, scale)
    }
  }
}

export class PixiPath extends PixiArrow implements IDraw, IReColor {
  velocityLimit = 1
  direction = 'FORWARD'

  private _fromShape: PixiWayPoint
  private _toShape: PixiWayPoint

  set fromShape(v: PixiWayPoint) {
    if(this._fromShape){
      this._fromShape.link = this._fromShape.link.filter(l => l.arrow != this)
    }
    this._fromShape = v    
    this.refreshLocationLinks()
    this.refreshVerticesFromLinkedLocPts()
  }

  set toShape(v: PixiWayPoint) {
    if(this._toShape){
      this._toShape.link = this._toShape.link.filter(l => l.arrow != this)
    }
    this._toShape = v    
    this.refreshLocationLinks()
    this.refreshVerticesFromLinkedLocPts()
  }

  private refreshLocationLinks(){
    if (this.fromShape && this.toShape) {
      this._toShape.link = this._toShape.link.filter(l => l.arrow != this)
      this._fromShape.link = this._fromShape.link.filter(l => l.arrow != this)
      this.fromShape.link.push({ arrow: this, waypoint: this.toShape })
      this.toShape.link.push({ arrow: this, waypoint: this.fromShape })
    }
  }

  get fromShape() {
    return this._fromShape
  }

  get toShape() {
    return this._toShape
  }

  dataObj: JPath
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

  constructor(viewport: PixiMapViewport, verts: PIXI.Point[], type, opt: PixiGraphicStyle = new PixiGraphicStyle().set('zIndex', 10), frLocPt: PixiWayPoint = null, toLocPt: PixiWayPoint = null) {
    super(<any>viewport , verts, type , opt)
    if (frLocPt && toLocPt) {
      this.fromShape = (<PixiWayPoint>frLocPt)
      this.toShape = (<PixiWayPoint>toLocPt)
    } 
    this.selectable = this.viewport.settings.waypointEditable
    this.endpointsLocal = [new PIXI.Point(0, 0), new PIXI.Point(this.vertices[1].x - this.vertices[0].x, this.vertices[1].y - this.vertices[0].y)]
    this.draw()
    this.events.removedOrDestroyed.subscribe(() => {
      this.fromShape = null
      this.toShape = null
    })
  }

  refreshVerticesFromLinkedLocPts(redraw = false) {
    if (this.fromShape && this.toShape) {
      this.vertices[0] = this.fromShape.position
      this.vertices[1] = this.toShape.position
      if (this.isCurved && this.vertices.length < 4) {
        let p1 = this.vertices[0]
        let p2 = this.vertices[1]
        let xratio = (p1.x - p2.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
        let yratio = (p1.y - p2.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
        let midPt = new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
        let len = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 4
        this.vertices[2] = new PIXI.Point(midPt.x + len * (yratio), midPt.y - len * (xratio))
        this.vertices[3] = new PIXI.Point(midPt.x - len * (yratio), midPt.y + len * (xratio))
      }

      if (redraw) {
        this.draw()
      }
    }
  }



  getControlPointGlobalPositions(map: PixiEditableMapImage  = null): { x: number, y: number }[] {
    let segment = <PixiCurve>this.segment
    let getPosFrPoint = (p: PIXI.Point, convert = false) => {
      let p2 = convert ? (map ? map.toLocal(this.toGlobal(p)) : this.viewport.mainContainer.toLocal(this.toGlobal(p))) : p
      return { x: p2.x, y: p2.y }
    }
    return [getPosFrPoint(segment.pixiControlPoint1.position, true), getPosFrPoint(segment.pixiControlPoint2.position, true)]
  }
}

export class PixiMap extends PixiMapGraphics {
  mapCode?: string
  robotBase?: string
  originX: number
  originY: number
  ROS: PIXI.Sprite
  initialWidth: number
  initialHeight: number
  dataObj: JMap
  base64Image: string
  get guiOriginX(): number {
    return this.guiOrigin[0]
  }
  get guiOriginY(): number {
    return this.guiOrigin[1]
  }
  get guiOrigin() {
    return calculateMapOrigin(this.originX, this.originY, this.initialHeight / this.viewport.METER_TO_PIXEL_RATIO, this.viewport.METER_TO_PIXEL_RATIO)
  }

  public calculateMapX(rosX: number) { //TO BE REVISED
    return calculateMapX(rosX, this.guiOriginX, this.viewport.METER_TO_PIXEL_RATIO); //TBR : save METER_TO_PIXEL_RATIO to DB
  }

  public calculateMapY(rosY: number) { //TO BE REVISED
    return calculateMapY(rosY, this.guiOriginY, this.viewport.METER_TO_PIXEL_RATIO)
  }

  public calculateRosPosition(position: { x: number, y: number }) {
    return {
      x: trimNum((position.x - this.guiOriginX) / this.viewport.METER_TO_PIXEL_RATIO, 5),
      y: trimNum((this.guiOriginY - position.y) / this.viewport.METER_TO_PIXEL_RATIO, 5)
    }
  }
  public calculateRosY(mapY: number) {
    return trimNum((this.guiOriginY - mapY) / this.viewport.METER_TO_PIXEL_RATIO, 5)
  }

  public calculateRosX(mapX: number) {
    return trimNum((mapX - this.guiOriginX) / this.viewport.METER_TO_PIXEL_RATIO, 5)
  }
}

export class PixiEditableMapImage extends PixiMap {
  mapCode?: string
  robotBase?: string
  dataObj: JMap
  originX: number
  originY: number


  readonly type = "mapLayer"
  initialWidth: number
  initialHeight: number
  initialOffset: PIXI.Point
  ROS: PIXI.Sprite
  _readonly: boolean

  constructor(viewport: PixiMapViewport, readonly = false) {
    super(viewport)
    this.readonly = readonly
    this.selectable = !readonly
    this.draggable = !readonly
    this.style.zIndex = 2
    this.events.selected.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
      this.addEditableFrame()
      this.zIndex = 100
      this.subscriptions.rotateEnd = this.events.rotateEnd.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
        setTimeout(() => {
          this.addEditableFrame()
          this.rotateButton.toolTip.hide()
        })
      })
      this.subscriptions.resizing = this.events.resizing.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
        this.addEditableFrame()
        this.border.children.filter(c => c instanceof PixiDashedLine).forEach((c: PixiDashedLine) => c.autoScaleModule.setScale())
      })
      this.subscriptions.zoomed = this.viewport.events.zoomed.pipe(takeUntil(this.events.removedOrDestroyed), filter(v => !this.readonly)).subscribe(() => {
        this.addEditableFrame()
      })
    })

    this.events.unselected.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.removeEditorFrame()
      this.zIndex = this.style.zIndex
      this.subscriptions.selected?.unsubscribe()
      this.subscriptions.zoomed?.unsubscribe()
      this.subscriptions.resizing?.unsubscribe()
      this.subscriptions.rotateEnd?.unsubscribe()
    })
  }

  set readonly(v) {
    this._readonly = !v
  }

  addRectangularBorder(width, height, lineColor = DRAWING_STYLE.highlightColor) {
    width = width / this.scale.x
    height = height / this.scale.y
    let borderWidth = DRAWING_STYLE.lineWidth / (this.scale.x * this.viewport.scale.x)
    let points = [
      new PIXI.Point(borderWidth / 2, borderWidth / 2),
      new PIXI.Point(width - borderWidth / 2, borderWidth / 2),
      new PIXI.Point(width - borderWidth / 2, height - borderWidth / 2),
      new PIXI.Point(borderWidth / 2, height - borderWidth / 2)
    ]
    this.addBorder(points, lineColor)
  }

  addEditableFrame(width = null, height = null) {
    if (this.viewport.MOBILE_MODE) {
      return
    }
    this.removeEditorFrame()
    if (this.border == null) {
      this.addRectangularBorder(this.initialWidth * this.scale.x, this.initialHeight * this.scale.y)
    }
    this.border.visible = true

    width = width ? width : this.width
    height = height ? height : this.height

    this.sortableChildren = true
    let rotateHandle = new PixiRotateHandle(this.viewport, this, width)
    rotateHandle.toolTip.enabled = !this.isResizing
    this.addChild(rotateHandle);
    rotateHandle.draw()


    this.resizeButtons = [];
    ['nw', 'ne', 'se', 'sw'].forEach(k => {
      let resizeHandle = new PixiResizeHandle(this.viewport, this, k, width, height)
      resizeHandle.toolTip.enabled = !this.isResizing
      resizeHandle.draw()
      this.addChild(resizeHandle);
      this.resizeButtons.push(resizeHandle)
    })

    this.resizeButtons = <any>this.children.filter(c => c instanceof PixiResizeHandle)
    if (!this.isResizing) {
      this.resizable = false
      this.resizable = true
    }
  }

  removeEditorFrame() {
    this.children.filter(c => c instanceof PixiRotateHandle || c instanceof PixiResizeHandle).forEach((c: PixiMapGraphics) => {
      this.removeChild(c)
    })
    if (this.border) {
      this.border.visible = false
    }
  }
}


export class PixiMapContainer extends PixiMap {
  mapCode?: string
  robotBase?: string
  originX: number
  originY: number
  readonly type = "mapContainer"
  ROS: PIXI.Sprite
  initialWidth: number
  initialHeight: number
  dataObj: JMap
  base64Image: string

}


export class PixiBuildingPolygon extends PixiEditablePolygon implements IReColor {
  public pixiRobotCountTag: PixiRobotCountTag
  private _buildingName = null
  get buildingName() {
    return this._buildingName
  }
  set buildingName(v) {
    this._buildingName = v
    this.toolTip.content = v
    this.toolTip.enabled = v != null
  }
  public buildingCode = null
  outline: PixiBorder
  _readonly = true
  set readonly(v: boolean) {
    this._readonly = v
    this.draggable = !v
    this.selectable = !v
    this.buttonMode = v
    // this.filters = v ? null :  [<any>new OutlineFilter(3, DRAWING_STYLE.mouseOverColor, 1)]
    if (this.pixiRobotCountTag) {
      this.pixiRobotCountTag.instantDrag = !v
      this.pixiRobotCountTag.readonly = v
      this.pixiRobotCountTag.subscriptions.click?.unsubscribe()
      this.pixiRobotCountTag.subscriptions.dragging?.unsubscribe()
      this.pixiRobotCountTag.subscriptions.click = this.pixiRobotCountTag.events.dragStart.pipe(takeUntil(this.events.removedOrDestroyed)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
        let lastPos = new PIXI.Point(this.pixiRobotCountTag.position.x, this.pixiRobotCountTag.position.y)
        this.pixiRobotCountTag.subscriptions.dragging = this.pixiRobotCountTag.events.dragging.pipe(takeUntil(this.events.dragEnd)).subscribe((evt: PIXI.interaction.InteractionEvent) => {
          if (!inside(this.pixiRobotCountTag.position, this.vertices)) {
            this.pixiRobotCountTag.position = new PIXI.Point(lastPos.x, lastPos.y)
          }
          lastPos = new PIXI.Point(this.pixiRobotCountTag.position.x, this.pixiRobotCountTag.position.y)
        })
      })
    }
    // if (v) {
    //   this.toolTip.positionBinding = ()=> this.buildingName
    //   this.toolTip.enabled = true
    // }
  }
  get readonly() {
    return this._readonly
  }

  constructor(viewport: PixiMapViewport, _vertices: PIXI.Point[], _graphicOption: PixiGraphicStyle = new PixiGraphicStyle().setProperties({ opacity: 0.0001, fillColor: DRAWING_STYLE.mouseOverColor }), _showRobotBuilding: boolean = false) {
    super(viewport, _vertices)
    this.pixiRobotCountTag = new PixiRobotCountTag(<any>this.viewport, this, new PixiGraphicStyle().set('fillColor', DRAWING_STYLE.mouseOverColor))
    this.vertices = _vertices
    this.mouseOverEffectEnabled = false
    this.style = _graphicOption
    this.tmpStyle = this.style.clone()
    this.interactive = true
    this.sortableChildren = true
    this.readonly = this.viewport.readonly || this.viewport.settings.showRobot
    this.setTagPosition(new PIXI.Point(centroidOfPolygon(this.vertices).x, centroidOfPolygon(this.vertices).y))
    this.addChild(this.pixiRobotCountTag)
    this.pixiRobotCountTag.autoScaleEnabled = true
    this.draw()
    this.events.mouseover.pipe(filter(v => this.readonly && this.outline && !this.outline.visible), takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.outline.visible = true
    })
    this.events.mouseout.pipe(filter(v => this.readonly && this.outline?.visible), takeUntil(this.events.removedOrDestroyed)).subscribe(() => {
      this.outline.visible = false
    })
  }

  reColor(color: any): void {
    // this.tmpStyle.opacity = this.selected ? 0.6 : 1
    this.tmpStyle.fillColor = color
    this.draw(true)
  }


  draw(clear = true) {
    if (clear) {
      this.clear()
    }
    this.circles.forEach(c => c.filters = [<any>new OutlineFilter(2, DRAWING_STYLE.mouseOverColor, 1)])
    this.outline?.parent?.removeChild(this.outline)
    this.outline = new PixiBorder(this.viewport, this, this.vertices, DRAWING_STYLE.mouseOverColor, 'solid')
    this.outline.style.lineThickness = DRAWING_STYLE.lineWidth * 2
    this.outline.zIndex = 0
    this.outline.visible = !this.readonly
    this.outline.draw()
    this.addChild(this.outline)
    this.beginFill(this.tmpStyle.fillColor, this.tmpStyle.opacity).drawPolygon(this.vertices).endFill()
    this.drawDone.emit(true)
  }

  setTagPosition(pos: PIXI.Point) {
    pos = inside(pos, this.vertices) ? pos : new PIXI.Point((this.vertices[0].x + this.vertices[1].x) / 2, (this.vertices[0].y + this.vertices[1].y) / 2)
    this.pixiRobotCountTag.position.set(pos.x, pos.y)
  }
}

export class PixiRobotMarker extends PixiMapGraphics {
  pixiAlertBadge
  _color
  get color() {
    return this._color
  }
  set color(v) {
    this._color = v
    let oldAngle = this.icon.angle
    this.removeChild(this.icon)
    this.icon = this.getAvatar(ConvertColorToDecimal(v))
    this.icon.angle = oldAngle
    this.addChild(this.icon)
  }

  constructor(viewport, fillColor, x = 0, y = 0, angle = 0) {
    super(viewport)
    let pivot = [150, 200]// TO BE RETRIEVED FROM config 
    this.position.set(x, y)
    this.icon = this.getAvatar(fillColor)
    this.icon.angle = angle
    this.addChild(this.icon)
    this.pivot.set(pivot[0], pivot[1])
    this.pixiAlertBadge = new PixiMapGraphics(this.viewport)
    this.pixiAlertBadge.icon = new PixiMapGraphics(this.viewport)
    this.pixiAlertBadge.addChild(this.pixiAlertBadge.icon)
    let badgeOffset = { x: 0, y: -200 }
    this.pixiAlertBadge.icon.beginFill(0xFF0000).drawCircle(0 + badgeOffset.x, 0 + badgeOffset.y, 75).endFill()
    this.pixiAlertBadge.icon.beginFill(0xFFFFFF).drawRect(-10 + badgeOffset.x, -50 + badgeOffset.y, 20, 60).endFill()
    this.pixiAlertBadge.icon.beginFill(0xFFFFFF).drawRect(-10 + badgeOffset.x, 30 + badgeOffset.y, 20, 20).endFill()
    // this.pixiAlertBadge.icon.angle = -90
    this.pixiAlertBadge.scale.set(0.1)
    //this.pixiAlertBadge.addChild(new PIXI.Sprite(PIXI.Texture.from('assets/icons/alert.svg')))
    this.pixiAlertBadge.visible = false
    this.addChild(this.pixiAlertBadge)
    this.pixiAlertBadge.position.set(this.pivot.x, this.pivot.y)
    this.pixiAlertBadge.zIndex = 2
    this.sortableChildren = true
    // this.icon = icon
    this.zIndex = 100//20220611
    // this.autoScaleEnabled = false
    this.autoScaleEnabled = true
    this.events.added.pipe(takeUntil(this.events.destroyed)).subscribe(() => {
      this.parent.sortableChildren = true
      this.parent.zIndex = 1000
      this.zIndex = 1000
      // this.autoScaleEnabled = false
      // this.autoScaleEnabled = true
    })
  }

  public getAvatar(fillColor) {
    let filters = this.getAvatarFilters(fillColor)
    let svgUrl = 'assets/icons/robot.svg'
    let pivot = [150, 200]// TO BE RETRIEVED FROM config
    let icon
    try {
      icon = new PIXI.Sprite(PIXI.Texture.from(svgUrl))
    } catch (err) {
      console.log('An Error has occurred when loading ' + svgUrl)
      console.log(err)
      throw err
    }
    icon.filters = filters.defaultFilters
    icon.pivot.set(pivot[0], pivot[1])
    icon.position.set(pivot[0], pivot[1])
    icon.scale.set(DRAWING_STYLE.robotAvatarScale)
    icon.interactive = true
    icon.cursor = 'pointer'
    icon.on("mouseover", () => icon.filters = filters.mouseOverFilters)
    icon.on("mouseout", () => icon.filters = filters.defaultFilters)
    return icon
  }


  public getAvatarFilters(fillColor) {
    return {
      defaultFilters: [
        <any>new ColorReplaceFilter(0x000000, 0xEEEEEE, 0.8),
        <any>new ColorOverlayFilter(fillColor, 0.4),
        new OutlineFilter(2.5, fillColor, 0.5),
        new GlowFilter({ color: fillColor, distance: 50, outerStrength: 0 })
      ],
      mouseOverFilters: [
        <any>new ColorReplaceFilter(0x000000, 0xEEEEEE, 0.8),
        <any>new ColorOverlayFilter(fillColor, 0.6),
        new OutlineFilter(3.5, fillColor, 0.5),
        new GlowFilter({ color: fillColor, distance: 50, outerStrength: 1 })
      ]
    }
  }
}

export class PixiRobotCountTag extends PixiMapGraphics {
  //########## masterComponent
  readonly type = 'tag'
  option: PixiGraphicStyle
  polygon: PixiBuildingPolygon
  // masterComponent : Map2DViewportComponent
  _robotCount: number = 0
  set robotCount(v) {
    this._robotCount = v
    this.draw()
  }
  get robotCount() {
    return this.robotCount
  }
  readonly = true
  radius = 15
  originalPosition
  textColor = 0xffffff
  pixiText: PIXI.Text

  constructor(viewport: PixiMapViewport, _parent: PixiBuildingPolygon, _option: PixiGraphicStyle = new PixiGraphicStyle(), _readonly = true) {
    super(viewport)
    // this.position = new PIXI.Point(_point.x , _point.y)
    this.polygon = _parent
    this.option = _option
    this.option.baseGraphics = this
    // this.textColor = this.readonly ? 0x000000 : 0xffffff
    this.pixiText = new PIXI.Text(this._robotCount.toString(), { fontFamily: 'Arial', fill: this.textColor, fontSize: this.radius });
    this.pixiText.anchor.set(0.5)
    this.addChild(this.pixiText)
    this.polygon.pixiRobotCountTag = this
    this.readonly = _readonly
    //this.readonly = true // testing
    // _masterComponent.onViewportZoomed.subscribe(() => this.scale.set(1/ (this.masterComponent._ngPixi.viewport.scale.x)))
    // this.polygon.addChild(this)
    this.draw()

  }

  draw() {
    this.clear()
    this.beginFill(this.option.fillColor, this.option.opacity).drawCircle(0, 0, this.radius).endFill()
    this.originalPosition = { x: this.position.x, y: this.position.y }
    this.pixiText.text = this._robotCount?.toString()
    this.pixiText.style = { fontFamily: 'Arial', fill: this.textColor, fontSize: this.radius }

    // if (!this.readonly) {
    //   this.interactive = true
    //   this.cursor = 'move'
    //   this.on('mousedown', (evt: PIXI.interaction.InteractionEvent) => {
    //     this.originalPosition = { x: this.position.x, y: this.position.y }
    //     evt.stopPropagation()
    //     // this.masterComponent?.selectGraphics(this)
    //     // this.masterComponent?.onMouseDownOfGraphics(this, evt)
    //     this.cursor = 'move'
    //   })
    //   // this.masterComponent?.clickEndEvts.forEach(t => {
    //   //   this.on(t, () => {
    //   //     if (!inside(this.position, this.polygon.vertices)) {
    //   //       this.position = new PIXI.Point(this.originalPosition.x , this.originalPosition.y)
    //   //       this.masterComponent?.uiSrv.showNotificationBar('Out of Boundary')
    //   //     }
    //   //   })
    //   // })
    // }
    this.zIndex = 2
  }
}


export class PixiEventMarker extends PixiMapGraphics implements IReColor{
  type = <any>'eventMarker'
  markerType = 'alert'
  svgUrl = 'assets/icons/alert_triangle.svg'
  _scale = 0.35
  icon : PIXI.Sprite
  eventId = null
  robotCode = null

  constructor(viewport: PixiMapViewport,  style: PixiGraphicStyle = new PixiGraphicStyle().set('fillColor' , 0xFFC000), robotId = null , eventId = null) {
    super(viewport)
    this.robotCode = robotId
    this.eventId = eventId
    this.style = style
    this.interactive = true
    this.buttonMode = true
    this.init()
  }

  reColor(color : number){
    this.icon.filters = null
    this.icon.filters = [<any>new ColorReplaceFilter(0x000000, color, 1) ,  new OutlineFilter(1, color == DRAWING_STYLE.highlightColor ? 0xFF0000 : 0x000000  ,  1)]
  }

  async init(){
    try {
      this.icon = new PIXI.Sprite(PIXI.Texture.from(this.svgUrl))
      const dim = await GetImageDimensions(this.svgUrl)
      this.reColor(this.style.fillColor)
      this.icon.pivot.set(dim[0]/2 , dim[1]/2)
      this.icon.position.set(this.icon.pivot[0] , this.icon.pivot[1])
      this.icon.scale.set(this._scale , this._scale)
    } catch (err) {
      console.log('An Error has occurred when loading ' +  this.svgUrl)
      console.log(err)
      throw err
    }  
    this.autoScaleEnabled = true
    // this.mouseOverOutline = {color : 0xFF0000 , width : 2}
    this.mouseOverColor = DRAWING_STYLE.highlightColor
    this.mouseOverEffectEnabled = true
    this.addChild(this.icon)
  }
}


  //#######################################################################################################################################################

