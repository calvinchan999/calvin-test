
import { AfterViewInit, Component, ElementRef, HostListener, Input, NgZone, OnDestroy, OnInit, ViewChild, Output, EventEmitter, Inject } from '@angular/core';
import { ease } from 'pixi-ease';
import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { GeneralUtil } from '../../general/general.util';
import { canReColor, IReColor } from './ng-pixi-base-graphics';
import {DRAWING_STYLE, PixiGraphicStyle} from './ng-pixi-styling-util'
import { PixiEditableMapImage } from './ng-pixi-map-graphics';
import { PixiViewport } from './ng-pixi-base-viewport';
import { CLICK_EVENTS, MOVE_EVENTS } from './ng-pixi-constants';


export class PixiContainer extends PIXI.Container {
  events = {
    click: new EventEmitter(),
    move: new EventEmitter(),
  }
  constructor() {
    super()
    MOVE_EVENTS.forEach(evt => this.on(<any>evt, (e) => this.events.move.emit(e)))
    CLICK_EVENTS.forEach(evt => this.on(<any>evt, (e) => this.events.click.emit(e)))
  }


  addGraphcis(graphics: PIXI.Graphics) {
    this.addChild(graphics)
    return graphics
  }
}