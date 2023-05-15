import { BehaviorSubject } from "rxjs"

export class floorPlan3DSettings {
    floorPlanCode
    fileName
    scale
    positionX
    positionY
    positionZ
    rotationX
    rotationY
    rotationZ
  }
  
  export class robotPose{
    x
    y
    angle
    mapName
  }
  
  export class Site{
    locationId?
    locationCode?
    defaultZoom?
    defaultX?
    defaultY?
    imgSrc?
  }
  
  export class FloorPlanDataset {
    floorPlan?: {
      planId?
      planCode?
      planName?
      siteId?
      buildingId?
      mapIds?
      originalWidth?
      originalHeight?
      posX?
      posY?
      scale?
      rotation?
      originX?
      originY?
      zIndex?
      defaultZoom?
      defaultX?
      defaultY?
      fileId?
      documentType?
      documentName?
      displayName?
      imgSrc?
      remarks?
      updatedDate?
      shapes?:ShapeJData[]
    }
    maps: MapJData []
    shapes?: ShapeJData []  //Only in Superset
  }
  
  export class MapJData{
    mapId?
    mapCode?
    mapName?
    parentId?
    originalWidth?
    originalHeight?
    posX?
    posY?
    scale?
    rotation?
    originX?
    originY?
    zIndex?
    imgDisplayName?
    imgSrc?
    defaultZoom?
    defaultX?
    defaultY?
    createdDate?
    createdBy?
    updatedDate?
    updatedBy?
    shapes?:ShapeJData[]
    locationsLinks?
  }
  
  
  export class ShapeJData {
    shapeId?
    shapeCode?
    mapId?
    shapeType? : 'arrow' |'arrow_bi' | 'arrow_bi_curved' | 'arrow_curved' | 'arrow_bi_curved' | 'arrow_curved' | 'location' | 'waypoint' | 'polygon'
    posX?
    posY?
    rotation?
    imgSrc?
    fillColor?
    lineThickness?
    lineColor?
    opacity?
    zIndex?
    vertices?
    bezierPoints?
    fromId?
    toId?
    fromCode?
    toCode?
    brushId?
    lineType?
    originX?
    originY?
    createdDate?
    createdBy?
    updatedDate?
    updatedBy?
  
    pathVelocity?
    pathDirection?
  }
  
  
  export class MapDataset{
    maps: MapJData[]
    locations : [
      {
        mapLocationId?
        mapId?
        hapeId?
        linkMapId?
        linkShapeId?
        actionId?
        createdDate?
        createdBy?
        updatedDate?
        updatedBy?
      }
    ]
    shapes : ShapeJData[]
  }
  
  export class DataStorage {
    id : string
    data 
    updatedDate: string 
  }
  
  export class SaveRecordResp {
      result : boolean
      msg ? : string
      exceptionDetail? : string
      validationResults?:[]
  }
  
  export class RobotMaster{
    robotCode
    name?
    robotType
    robotSubType
  }
  
  export class DropListDataset {
    actions?: DropListAction[]
    buildings?: DropListBuilding[]
    floorplans? : DropListFloorplan[]
    maps?: DropListMap[]
    locations?:DropListLocation[]
    sites?: DropListSite[]
    types?: DropListType[]
    subTypes?:DropListSubType[]
    robots? : DropListRobot[]
  }
  
  export class DropListLocation {
    floorPlanCode
    pointCode
    pointType
    // shapeCode
    // shapeType
  }
  
  export class DropListAction {
    alias: string
    name: string
    allowedRobotTypes: string[]
    allowedPointTypes : string[]
    parameterList: ActionParameter[]
  }
  
  export class ActionParameter {
    name: string
    parameterCode: string
    defaultValue: string
    parameterType: string
    regex?: string
    min: number
    max: number
    enumList:
      {
        code: string,
        label: string,
        value: string
      }[]
  }
  
  
  export class DropListBuilding{
    buildingCode
    name
    defaultPerSite
    polygonCoordinates
    labelX
    labelY
  }
  
  export class DropListSite{
    
  }
  
  export class DropListUserGroup{
    userGroupCode
    name
  }
  
  
  export class DropListMap{
    mapCode
    robotBase
    floorPlanCode
    name
  }
  
  export class DropListFloorplan{
    floorPlanCode
    name
    buildingCode
    defaultPerBuilding?
  }
  
  export class DropListType{
    enumName
    description
    // typeId
    // robotCode
    // typeCode
    // typeName
    // subTypeName
  }
  
  export class DropListSubType{
    enumName
    description
    // typeId
    // robotCode
    // typeCode
    // typeName
    // subTypeName
  }
  
  export class DropListRobot{
    robotCode : string
    name : string
    robotBase : string
    robotType : string
    robotSubType : string
  }
  
  export class DropListPointIcon{
    code : string
    name: string
    base64Image: string
    modifiedDateTime: number
  }
  
  
  
  
  // =========================================================================================================
  
  export class JTask {
    taskId?:string
    missionId?:string
    cronExpress? : string
    executingFlag? :string
    expiration? : number
    remark?: string
    taskItemList : TaskItem[]
    reasonCode ? : string
    reasonMessage ? : string
    state? : string
  }
  
  export class TaskItem{
      index? : string
      actionListTimeout : number
      movement : {
        floorPlanCode : string,
        pointCode: string,
        navigationMode : string,
        orientationIgnored : boolean,
        fineTuneIgnored : boolean,
      }
      actionList: { 
        alias: string,
        properties: { }
      }[]
  }
  
  export class JFloorPlan {
    floorPlanCode : string
    name? : string
    viewZoom : number
    viewX : number
    viewY : number
    fileName? : string
    pointList: JPoint[]
    pathList: JPath[]
    mapList?:JMap[]
    defaultPerBuilding? : boolean
    base64Image: string
    modifiedDateTime?: Date
  }
  
  export class JPoint {
    floorPlanCode?: string
    mapCode?: string
    robotBase?: string
    pointCode: string
    positionX?: number
    positionY?: number
    angle?: number
    guiX: number
    guiY: number
    guiAngle: number
    userDefinedPointType : string
    pointType: string
    groupMemberPointList? : JPoint []
    groupPointCode? : string
    groupProperties? : string
  }
  
  export class JChildPoint{
    pointCode: string
    guiX: number
    guiY: number
    guiAngle: number
  }
  
  export class JPath{
    floorPlanCode? : string
    mapCode? : string
    robotBase? : string
    sourcePointCode : string
    destinationPointCode: string
    direction : string
    maximumVelocity : number
    controlPointList : {x : number , y : number}[]
    length? : number 
  }
  
  export class JMap {
    floorPlanCode : string
    mapCode: string
    robotBase : string
    name: string
    originX : number 
    originY : number
    resolution : number
    imageWidth : number
    imageHeight : number
    transformedPositionX : number
    transformedPositionY : number
    transformedScale : number
    transformedAngle : number
    pointList : JPoint[]
    pathList : JPath[]
    base64Image: string
    modifiedDateTime?: Date
  }
  
  export class JBuilding {
    buildingCode: string
    name: string
    labelX: number
    labelY: number
    siteCode: string
    polygonCoordinates: {x : number , y : number}[]
    defaultPerSite: boolean
    floorPlanCodeList: string[]
    defaultFloorPlanCode: string
  }
  
  export class JSite {
    siteCode: string
    name: string
    fileName: string
    base64Image: string
    viewZoom: number
    viewX: number
    viewY: number
    remark: string
  }
  
  export class RobotTaskInfoARCS{
    robotType: string
    floorPlanCode: string
    executingTaskCount: number
    completedTaskCount: number
    waitingTaskCount: number
    robotCode: string
  }
  
  export class RobotStatusARCS {
    robotType: string
    robotCode: string
    floorPlanCode: string
    robotStatus: string
    obstacleDetected : boolean
    tiltDetected : boolean
    estopped : boolean
    cabinetDTO? : any
    ieqDTO ? : any
  }
  
  // export class RobotDetailARCS{
  //   robotCode : string
  //   robotStatus: string
  //   modeState: string
  //   batteryPercentage: number
  //   speed : number
  //   obstacleDetected : boolean
  //   tiltDetected : boolean
  //   estopped : boolean
  // }
  
  
  export const ARCS_STATUS_MAP = {
    IDLE : "Idle",
    CHARGING : "Charging",
    EXECUTING : "Working",
    UNKNOWN : "Offline",
    HOLD : "Reserved"
  } 
  
  export class loginResponse{
    result?: boolean
    msgCode?: string
    msg?: string
    auth2FASegment ? :string
    validationResults? :{
      accessFunctionList? : {functionCode : string}[]
      access_token? : string
      refresh_token? : string
      password_expires_in ? : number
      tenant_id ? : string
      user_id ? : string
      user_name ? : string
      configurations: { configKey: string, configValue: string }[]
    }
  }
  
  export type RobotStateTypes = 'speed'| 'batteryRounded' | 'state' | 'ieq' |  'estop' | 'obstacleDetected' | 'tiltActive' | 'status' | 'destination' | 'availContainersCount' | 'totalContainersCount' | 'containersAvail' | 'containersDoorStatus'

  
  export const TaskStateOptions = [{text : "Pending" , value : "WAITING"} , {text : "Executing" , value : "EXECUTING"},{text : "Completed" , value : "SUCCEEDED"} , {text : "Canceled" , value : "CANCELED"} , {text : "Failed" , value : "FAILED"}, {text : "Busy" , value : "BUSY"}]
  
  
  
  
  