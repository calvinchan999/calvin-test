import * as PIXI from 'pixi.js';

export function createTileMap(rgba: Uint8Array, width: number, height: number) {
    const maxTileWidth = 1024;
    const maxTileHeight = 1024;
    const numRows = Math.ceil(width / maxTileWidth);
    const numCols = Math.ceil(height / maxTileHeight);
    const BYTES_PER_PIXEL = 4;
    console.debug('#rows:', numRows, '#cols:', numCols)
    const container = new PIXI.Container();
    for (let tileX = 0; tileX < numRows; tileX++) {
        for (let tileY = 0; tileY < numCols; tileY++) {
            console.debug('processing tile #(', tileX, ',', tileY, ')')
            const tileData = new Uint8Array(maxTileWidth * maxTileHeight * BYTES_PER_PIXEL);
            // Read sub-texture
            // Not cache-efficient, but in JavaScript ... who cares : -(
            // for (let i = tileY * maxTileWidth; i < Math.min((tileY + 1) * maxTileWidth, width); i++) {
            //   for (let j = tileX * maxTileHeight; j < Math.min((tileX + 1) * maxTileHeight, height); j++) {
            const tileWidth = Math.min(maxTileWidth, width - tileX * maxTileWidth);
            const tileHeight = Math.min(maxTileHeight, height - tileY * maxTileHeight);
            // console.error('tileWidth', tileWidth, ' tileHeight', tileHeight)
            for (let i = 0; i < tileWidth; i++) {
                for (let j = 0; j < tileHeight; j++) {
                    // console.error('Inner Loop!')
                    let local_k = (i + j * maxTileWidth) * BYTES_PER_PIXEL;
                    const global_i = tileX * maxTileWidth + i;
                    const global_j = tileY * maxTileHeight + j;
                    const global_k = (global_i + global_j * width) * BYTES_PER_PIXEL;
                    tileData[local_k] = rgba[global_k] // R
                    tileData[++local_k] = rgba[global_k + 1] // R
                    tileData[++local_k] = rgba[global_k + 2] // R
                    tileData[++local_k] = rgba[global_k + 3] // R
                }
            }
            // console.error('TileData', tileData.length, 'and should be', maxTileHeight * maxTileWidth * BYTES_PER_PIXEL)
            // Create sprite
            const texture = PIXI.Texture.fromBuffer(tileData, maxTileWidth, maxTileHeight);
            const sprite = new PIXI.Sprite(texture);
            sprite.x = tileX * maxTileWidth;
            sprite.y = tileY * maxTileHeight;
            container.addChild(sprite);
        }
    }
    return container;
}