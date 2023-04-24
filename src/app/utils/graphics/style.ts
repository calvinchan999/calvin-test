export function ConvertColorToDecimal(color: string | number) {
    if((<any>color) instanceof String || typeof color === 'string'){
        return Number(color.toString().replace("#", '0x'))
    }else{
        return Number(color)
    }
}

export function ConvertColorToHexadecimal(color: number | string) {
    if(color.toString().startsWith('#') && color.toString()?.length == 7){
        return color.toString()
    }else{
        return "#" + color.toString(16).padStart(6, '0')
    }
}
