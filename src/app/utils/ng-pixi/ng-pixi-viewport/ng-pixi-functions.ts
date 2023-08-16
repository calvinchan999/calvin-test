
import * as PIXI from 'pixi.js';
import { GetImage } from '../../graphics/image';

export const WebGLMaxMobileTextureSize = 4096
export const WebGLMaxPcTextureSize =  8192 //16384
export function GetPixiAngleDescription(pixiGraphics: PIXI.Graphics): string {
    return ((pixiGraphics.angle > 0 ? pixiGraphics.angle : 360 + pixiGraphics.angle) % 360).toFixed(2) + "°"
}

export async function GetSpriteFromUrl(url : string , isMobile : boolean): Promise<PIXI.Sprite> {
    let image: any = await GetImage(url)
    let maxPx = isMobile ? WebGLMaxMobileTextureSize : WebGLMaxPcTextureSize
    let dimiension = [image.width, image.height]
    if ((dimiension[0] >= maxPx || dimiension[1] > maxPx)) {
        console.log('Image Resized to adapt to WEBGL standard')
        let newRatio = maxPx / Math.max(dimiension[0], dimiension[1])
        let canvas = await GetResizedCanvas(image, dimiension[0] * newRatio, dimiension[1] * newRatio)
        let texture = PIXI.Texture.from(canvas.toDataURL("image/png"))
        var ret = PIXI.Sprite.from(texture)
        ret.scale.set(1 / newRatio)
        return ret
    } else {
        return PIXI.Sprite.from(new PIXI.Texture(new PIXI.BaseTexture(image)))
    }
}

export async function GetResizedCanvas(image: any, newWidth: number, newHeight: number) {
    let canvas = document.createElement('canvas')
    canvas.width = newWidth
    canvas.height = newHeight
    let ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, newWidth, newHeight);
    return canvas
}

export async function GetResizedBase64(url: string, newWidth: number, newHeight: number) {
    url = url.startsWith('data:image') ? url : ('data:image/png;base64,' + url)
    let image: any = await GetImage(url)
    let canvas = await GetResizedCanvas(image, newWidth, newHeight)
    return canvas.toDataURL().replace('data:image/png;base64,', '')
}

export async function IsWebGLSupported(){
    return await PIXI.utils.isWebGLSupported()
}