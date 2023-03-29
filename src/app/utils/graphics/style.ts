export function ConvertColorToDecimal(color: string | number) {
    if(Number.isFinite(color)){
        return Number(color)
    }else{
        return Number(color.toString().replace("#", '0x'))
    }
}

export function ConvertColorToHexadecimal(color: number | string) {
    if(color.toString().startsWith('#') && color.toString()?.length == 7){
        return color.toString()
    }else{
        return "#" + color.toString(16).padStart(6, '0')
    }
}
