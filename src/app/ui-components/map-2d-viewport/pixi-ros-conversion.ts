
export function calculateMapOrigin(rvMetaX, rvMetaY, rosHeight, meterToPixelRatio) {
    return [rvMetaX * meterToPixelRatio * -1, (rosHeight + rvMetaY) * meterToPixelRatio]
}


export function calculateMapX(rosX: number , originX : number ,  METER_TO_PIXEL_RATIO : number) { 
    return rosX * METER_TO_PIXEL_RATIO + originX; 
}

export function calculateMapY(rosY: number , originY , METER_TO_PIXEL_RATIO: number) { 
    return originY - (rosY * METER_TO_PIXEL_RATIO);
}

