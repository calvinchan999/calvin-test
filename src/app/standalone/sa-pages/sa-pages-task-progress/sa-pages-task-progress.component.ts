import { Component, ComponentFactoryResolver, OnInit, ViewChild, ViewContainerRef , OnDestroy} from '@angular/core';
import { Subject } from 'rxjs';
import { filter, skip, takeUntil } from 'rxjs/operators';
import { DataService, mqType } from 'src/app/services/data.service';
import { MqService } from 'src/app/services/mq.service';
import { DropListAction } from 'src/app/services/data.models';
import { UiService } from 'src/app/services/ui.service';
import { SaPagesDeliveryFillupComponent } from '../top-modules/delivery/sa-pages-delivery-fillup/sa-pages-delivery-fillup.component';
import { SaPagesDeliveryPickupComponent } from '../top-modules/delivery/sa-pages-delivery-pickup/sa-pages-delivery-pickup.component';
import { RobotService } from 'src/app/services/robot.service';

@Component({
  selector: 'app-sa-pages-task-overlay',
  templateUrl: './sa-pages-task-progress.component.html',
  styleUrls: ['./sa-pages-task-progress.component.scss']
})
export class SaPagesTaskProgressComponent implements OnInit , OnDestroy {
  @ViewChild('vc', {read: ViewContainerRef}) vcRef : ViewContainerRef
  scrollViewIndices = []
  constructor(public robotSrv : RobotService,  public dataSrv: DataService , public uiSrv:UiService , private resolver : ComponentFactoryResolver , public mqSrv : MqService) { }
  actions = {}
  onDestroy = new Subject()
  mqtopics : mqType[] = ['taskProgress','taskArrive','taskDepart','taskPopups']
  onDemandDialogues = {
    "DELIVERY-FILLUP" : {type: SaPagesDeliveryFillupComponent , compRef:null},
    "DELIVERY-PICKUP" : {type: SaPagesDeliveryPickupComponent , compRef:null} 
  }
  dialogueActive = false

  async ngOnInit() {
    let ticket  = this.uiSrv.loadAsyncBegin()
    await this.dataSrv.getRobotMaster()
    this.scrollViewIndices = this.dataSrv.robotMaster.robotType?.toUpperCase() == 'DELIVERY' || !this.uiSrv.withDashboard? [1] : [1,2]
    this.mqSrv.subscribeMQTTs(this.mqtopics)
    let actionDdld = await this.dataSrv.getDropList('actions')
    actionDdld.data.forEach((a: DropListAction) => this.actions[a.alias] = a.name)
    if(this.uiSrv.isTablet){
      this.robotSrv.data.taskPopupRequest.pipe(skip(1) , filter(req=>req!=null) , takeUntil(this.onDestroy)).subscribe(req=>{
        if(Object.keys(this.onDemandDialogues).includes(req.guiId)){
          if(this.onDemandDialogues[req.guiId].compRef == null && !req.invisible){
            const factory = this.resolver.resolveComponentFactory(this.onDemandDialogues[req.guiId].type)
            this.onDemandDialogues[req.guiId].compRef = this.vcRef.createComponent(factory)
          }else if(req.invisible && this.onDemandDialogues[req.guiId].compRef != null){
            this.onDemandDialogues[req.guiId].compRef =  null
            this.vcRef.detach()
          }
        }
        this.dialogueActive = Object.values(this.onDemandDialogues).filter(d=>d.compRef != null).length > 0
      })
    }
    await this.mqSrv.refreshTaskStatus()
    this.uiSrv.loadAsyncDone(ticket)
  }

  ngOnDestroy(){
    this.onDestroy.next()
    this.mqSrv.unsubscribeMQTTs(this.mqtopics)
  }

}
