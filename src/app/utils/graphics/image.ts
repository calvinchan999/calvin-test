export async function GetImageDimensions(srcUrl : string) : Promise<number[]> {
    return new Promise((resolve, reject) => {
        let img = new Image()
        img.onload = () => resolve([img.width, img.height])
        img.onerror = (e) => {
            console.log("Fail to load Image : " + srcUrl)
            console.log(e)
        }
        img.src = srcUrl
    })
}