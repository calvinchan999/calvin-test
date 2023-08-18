import { ChangeDetectorRef, Component, EventEmitter, Inject, Input, LOCALE_ID, NgZone, Output, ViewChild } from '@angular/core';
import { CldrIntlService, IntlService } from '@progress/kendo-angular-intl';
// import { CustomMessagesService } from '../services/custom-messages.service';
// import { locales } from 'src/app/resources/locales';
import { UiService } from '../../services/ui.service';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { DropDownButtonComponent } from '@progress/kendo-angular-buttons';
import { MenuComponent } from '@progress/kendo-angular-menu';
import { take } from 'rxjs/operators';
import { DialogRef, DialogService } from '@progress/kendo-angular-dialog';
import {ChangePasswordComponent} from './change-password/change-password.component';
import { environment } from 'src/environments/environment';
import { WifiComponent } from './wifi/wifi.component';
import { CmLoginComponent } from '../cm-login/cm-login.component';
import { DataService } from 'src/app/services/data.service';
import { style } from '@angular/animations';
import { MqService } from 'src/app/services/mq.service';
import { MapService } from 'src/app/services/map.service';

@Component({
    selector: 'app-header-component',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss']
})

export class HeaderComponent {
    @Output() public toggle = new EventEmitter();
    @Input() public selectedPage: string;
    @ViewChild("settingMenu") settingMenu : MenuComponent
    @ViewChild("langButton") langButton : DropDownButtonComponent
    @ViewChild("syncMenu") syncMenu : MenuComponent
    @ViewChild('anchor') anchor 
    syncMenuItems =[]
    syncMenuOpened = false
    // public customMsgService: CustomMessagesService;


    public app = environment.app.toUpperCase()
    public selectedLanguage = { locale: 'English', localeId: 'en-US' };
    // public locales = locales;
    public popupSettings = { width: '150' };
    public themes = [
        {
            href: 'assets/kendo-theme-default/dist/all.css',
            text: 'Default'
        },
        {
            href: 'assets/kendo-theme-bootstrap/dist/all.css',
            text: 'Bootstrap'
        },
        {
            href: 'assets/kendo-theme-material/dist/all.css',
            text: 'Material'
        }
    ];

    showSettings = false
    hasUserManagementRight = false

    public selectedTheme = this.themes[0];
    langMenuOpened = false

    public closeMenu(){
        setTimeout(()=>{
            this.langMenuOpened = false ; 
            this.settingMenu.toggle(false , '0')
        })
    }

    constructor(public mapSrv : MapService, public intlService: IntlService , public uiSrv : UiService , public dialogSrv: DialogService, public dataSrv: DataService,
                public authSrv : AuthService , public router : Router, public util : GeneralUtil , public ngZone : NgZone , public mqSrv : MqService  ) {
        this.hasUserManagementRight = this.authSrv.hasAccessToPath('user');
        // this.uiSrv.lang.subscribe(()=>this.changeDectector.detectChanges())
        // this.localeId = this.selectedLanguage.localeId;
        // this.setLocale(this.localeId);
        // this.customMsgService = this.messages as CustomMessagesService;
        // this.customMsgService.language = this.selectedLanguage.localeId;
    }

    navigateToHome(){
        this.router.navigate([this.uiSrv.isTablet ? "login" : "home"])
    }

    public changeTheme(theme) {
        this.selectedTheme = theme;
        const themeEl: any = document.getElementById('theme');
        themeEl.href = theme.href;
    }

    public changeLanguage(item): void {
        // this.customMsgService.language = item.localeId;
        // this.setLocale(item.localeId);
    }

    public setLocale(locale): void {
        (this.intlService as CldrIntlService).localeId = locale;
    }

    public onButtonClick(): void {
        this.toggle.emit();
    }

    public showDialog(componentId) {
        const componentMap = {
            pw: ChangePasswordComponent,
            wifi: WifiComponent,
            login: CmLoginComponent
        }
        const dialog: DialogRef = this.uiSrv.openKendoDialog({
            content: componentMap[componentId],
            preventAction: () => true
        })
        //  this.uiSrv.openKendoDialog({
        //     content: componentMap[componentId],
        //     preventAction : ()=>true
        //   }
        // );
        const content = dialog.content.instance;
        content.parent = this
        content.dialogRef = dialog
        if (componentId == 'login') {
            content.toExitGuestMode = true
            content.guestMode = false
            content.showTabletLoginDialog = true
        }
    }

    public logout(){
        if(this.uiSrv.isTablet){
            this.authSrv.isGuestMode = true
            this.dataSrv.setSessionStorage('isGuestMode', JSON.stringify(true))
            this.router.navigate(['/login'])
        }else{            
            this.authSrv.logout()
        }
    }    

    public openSyncMenu(){
        this.syncMenuOpened = true
        this.syncMenuItems = this.mapSrv.outSyncFloorPlans.concat(<any> this.mqSrv.data.arcsSyncLog.value ) 
        this.updateUnreadCount()
        setTimeout(()=> this.syncMenu.toggle(true , '0'))
    }

    public updateUnreadCount(){
        this.dataSrv.unreadSyncMsgCount.next(0)
        this.dataSrv.setLocalStorage('unreadSyncMsgCount' ,JSON.stringify(0))
    }

    public updateUnreadLog(){
        let processingLogs = (this.mqSrv.data.arcsSyncLog.value ? this.mqSrv.data.arcsSyncLog.value : []).filter(l=>l.dataSyncStatus == 'TRANSFERRING')
        this.mqSrv.data.arcsSyncLog.next( processingLogs)
        this.dataSrv.setLocalStorage('syncDoneLog' , JSON.stringify([]))
    }

    public closeSyncMenu(){
        this.syncMenuOpened = false
        this.syncMenu.toggle(false , '0')
        this.onSyncMenuClose()
    }

    public onSyncMenuClose(){
        this.syncMenuOpened = false
        this.updateUnreadLog()
        this.syncMenuItems = []
    }

}
