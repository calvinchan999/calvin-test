import * as Viewport from 'pixi-viewport';
import * as PIXI from 'pixi.js';

export const DRAWING_STYLE = {
    lineWidth : 2,
    imgEditHandleSize: 5,
    highlightColor: 0xFE9802,
    secondaryHighlightColor: 0xFF6358,
    paletes : [0x00CED1 , 0xFF66B9 , 0xFFD700 , 0x87CEFA ,0x9ACD32 , 0xFF8C00 ],
    mouseOverColor: 0x00CED1,
    outlineColor : 0xFF6358,
    arrowTypes: ['arrow', 'arrow_bi', 'arrow_bi_curved', 'arrow_curved'],
    pointTypes: ['location', 'waypoint'],
    curveTypes: ['arrow_bi_curved', 'arrow_curved'],
    markerScale: 0.45,
    arrowHeadScale: 0.45,
    arrowThicknessScale: 0.8,
    arrowHeadLength: 12.5, //17.5 * 0.45
    robotAvatarScale : 0.1
}

const DEFAULT_STYLE = {
    position : new PIXI.Point(0, 0),
    fillColor : 0x0000000 ,
    zIndex : 1,
    opacity : 1,
    lineColor : 0x0000000 , 
    lineThickness : 2
}


export class PixiGraphicStyle {
    public baseGraphics: PIXI.Graphics
    public opacity: number;
    public fillColor: number;
    public position: PIXI.Point;
    public zIndex: number;
    public lineThickness: number;
    public lineColor: number;

    constructor(parentGraphics = new PIXI.Graphics(), pos = new PIXI.Point(0, 0), fillColor = DEFAULT_STYLE.fillColor, zIndex = DEFAULT_STYLE.zIndex, alpha = DEFAULT_STYLE.opacity, lineColor = DEFAULT_STYLE.lineColor, lineThickness = DEFAULT_STYLE.lineThickness, clone = false) {
        this.baseGraphics = parentGraphics
        this.opacity = alpha
        this.fillColor = fillColor
        this.position = pos
        this.zIndex = zIndex
        this.lineColor = lineColor
        this.lineThickness = lineThickness
        if (!clone) {
            this.baseGraphics['graphicStyle'] = this
        }
    }

    set(property: 'baseGraphics' | 'opacity' | 'fillColor' | 'position' | 'zIndex' | 'lineThickness' | 'lineColor', value: any) {
        this[property] = <any>value === undefined ? DEFAULT_STYLE[property] : <any>value
        // console.log( <any>value )
        // console.log(property)
        // console.log(this)
        return this
    }

    setProperties(properties: { baseGraphics?: PIXI.Graphics, opacity?: number, fillColor?: number, position?: PIXI.Point, zIndex?: number, lineThickness?: number, lineColor?: number }) {
        Object.keys(properties).forEach(k => {
            this[k] = properties[k] === undefined ?
                (k == 'baseGraphics' ? new PIXI.Graphics() :
                    (k == 'position' ? new PIXI.Point(0, 0) :
                        DEFAULT_STYLE[k])) :
                <any>properties[k];
        })
        return this
    }

    clone() {
        return new PixiGraphicStyle(this.baseGraphics, new PIXI.Point(this.position.x, this.position.y), this.fillColor, this.zIndex, this.opacity, this.lineColor, this.lineThickness, true)
    }
}


