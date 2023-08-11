import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http'; 
import { Observable } from 'rxjs';
import { DrawerComponent, DrawerMode, DrawerSelectEvent } from '@progress/kendo-angular-layout';
// import { CustomMessagesService } from './services/custom-messages.service';

//import custom library
import { GeneralUtil } from './utils/general/general.util';
import { environment } from 'src/environments/environment';
import { UiService } from './services/ui.service';
import { AuthService } from './services/auth.service';
import { skip } from 'rxjs/operators';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit, OnDestroy {
    public selected = '';
    public items: Array<any>;
    // public customMsgService: CustomMessagesService;
    public mode: DrawerMode = 'push';
    public mini = true;
    public currentRoute = null
    constructor(public router: Router, 
                private http: HttpClient , 
                public util : GeneralUtil,
                public uiSrv : UiService,
                public authSrv : AuthService
            ) {
        // this.customMsgService = this.msgService as CustomMessagesService;
        
		// this.getConfigJSON().subscribe(data => {
		// 	this.generalUtil.setConfig(data);

        //     // this.getSystemConfiguration();
		// });
    }
    
	// private getConfigJSON(): Observable<any> {
    // 	return this.http.get("assets/config/config.json");
	// }
    
	// private getSystemConfiguration() {
    //     this.systemService.getConfiguration()
    //         .subscribe(
    //             data => {
    //                 this.generalUtil.updateSystemConfig(data);

    //                 this.mqttService.createMqttClient();
    //             },
    //             error => {
    //                 swal.fire('提示!', error.error.message, 'warning');
    //             }
    //         );
    // }

    ngOnInit() {
        // Update Drawer selected state when change router path
        this.router.events.subscribe((route: NavigationStart) => {
            if (route instanceof NavigationStart) {
                this.items = this.drawerItems().map((item) => {
                    if (item.path && item.path === route.url) {
                        item.selected = true;
                        return item;
                    } else{
                        item.selected = false
                        return item;
                    }
                    // else {
                    //     item.selected = item.path == '/home' && route.url == '/' ;
                    //     return item;
                    // }
                });
            }
            this.currentRoute = this.router.url.split('?')[0]       
            this.uiSrv.arcsTabletMode = this.currentRoute.toLowerCase() == '/waypoint' ? 'WAYPOINT' : null
        });

        this.setDrawerConfig();
        this.items = this.drawerItems();
        this.uiSrv.refreshDrawerItems.pipe(skip(1)).subscribe((v)=>{
            this.items = this.drawerItems();            
        })
        // this.customMsgService.localeChange.subscribe(() => {
        //     this.items = this.drawerItems();
        // });

        window.addEventListener('resize', () => {
            this.setDrawerConfig();
        });
    }

    ngOnDestroy() {
        window.removeEventListener('resize', () => {});
    }

    public setDrawerConfig() {
        const pageWidth = window.innerWidth;
        if (pageWidth <= 770) {
            this.mode = 'overlay';
            this.mini = false;
        } else {
            this.mode = 'push';
            this.mini = true;
        }
    }

    private isDrawerItemSelected( path : string){
        return this.router.url.split('?')[0] ==`${path.toLowerCase()}`
    }

    private getRobotTypePaths() {
        let ret = []
        environment.routes.filter(r=>this.util.config.ROBOT_TYPE?.map(t=> ( '/' + t.toLowerCase()))?.includes(r.path)).forEach((r) => {
            ret.push({ text: this.uiSrv.translate(r.text), icon: r.icon, path: r.path, selected: this.isDrawerItemSelected(r.path) })
        })
        return ret
    }

    public drawerItems(robotTyes : string[] | null = null) {
        let selected = (path : string)=> this.isDrawerItemSelected(path)
        if(environment.app.toUpperCase() == 'STANDALONE'){
            return [
                { text: this.uiSrv.translate('Dashboard'),       icon: 'mdi mdi-collage',                    path: '/dashboard',     selected: selected('/dashboard') },
                { text: this.uiSrv.translate('Task'),            icon: 'mdi mdi-clipboard',                  path: '/task',          selected: selected('/task')  },
                { text: this.uiSrv.translate('Map'),             icon: 'mdi mdi-map',                        path: '/map',           selected: selected('/map')  },
                { text: this.uiSrv.translate('Control'),         icon: 'mdi mdi-cogs',                       path: '/control',       selected: selected('/control')  },
                // { text: this.uiSrv.translate('Test Delivery'),   icon: 'mdi mdi-test-tube',                   path: '/testDelivery',   selected: false },
                // { text: this.uiSrv.translate('Test ARCS Functions'),     icon: 'mdi mdi-test-tube',                  path: '/testARCS',      selected: true  },
            ].filter(itm=>this.authSrv.hasAccessToPath(itm.path.replace('/','')) && (itm.path != '/dashboard' || this.uiSrv.withDashboard));
        }else if(environment.app.toUpperCase() == 'ARCS'){
            return [
                { text: this.uiSrv.translate('Dashboard'),       icon: 'mdi mdi-collage',                    path: '/home',          selected: selected('/home')  }
            ].concat(this.getRobotTypePaths().filter(p=> Object.keys(this.uiSrv.robotTypeIconMap).map(t=>t.toLowerCase()).includes(p.path.replace('/','')))).concat([
                { text: this.uiSrv.translate('Setup'),           icon: 'mdi mdi-cogs',                       path: '/setup',         selected: selected('/setup')  },
            ].filter(itm=>{
                //let allowedRobotType = !this.util.config.ROBOT_TYPE || this.util.config.ROBOT_TYPE.map(t=>"/" + t.toUpperCase()).includes(itm.path.toUpperCase())
                if(itm.path == '/setup'){
                    return ['map'].some(func => this.authSrv.hasAccessToPath(func)) 
                }else {
                    return itm.path == '/home'  
                }
            }));
        }
    }

    public toggleDrawer(drawer: DrawerComponent): void {
        drawer.toggle();
    }

    public onSelect(ev: DrawerSelectEvent): void {
        this.router.navigate([ev.item.path]);
        this.selected = ev.item.text;
    }
}

                // { text: this.uiSrv.translate('patrol'),          icon: 'mdi mdi-robot',                      path: '/patrol',        selected: false },
                // { text: this.uiSrv.translate('beverage'),        icon: 'mdi mdi-silverware-fork-knife',      path: '/beverage',      selected: false },
                // { text: this.uiSrv.translate('delivery'),        icon: 'mdi mdi-truck-fast',                 path: '/delivery',      selected: false },
                // { text: this.uiSrv.translate('disinfection'),    icon: 'mdi mdi-spray',                      path: '/disinfection',  selected: false },
                // { text: this.uiSrv.translate('Mobility Chair'),  icon: 'mdi mdi-wheelchair-accessibility',   path: '/mobile_chair',    selected: false },
                // { text: this.uiSrv.translate('forklift'),        icon: 'mdi mdi-forklift',                   path: '/forklift',      selected: false },
                // { text: this.uiSrv.translate('warehouse'),       icon: 'mdi mdi-warehouse',                  path: '/warehouse',     selected: false },
                // { text: this.uiSrv.translate('stocktake'),       icon: 'mdi mdi-package-variant-closed',     path: '/stocktake',     selected: false },
                // { text: this.uiSrv.translate('floorscrub'),      icon: 'mdi mdi-broom',                      path: '/floorscrub',    selected: false },
