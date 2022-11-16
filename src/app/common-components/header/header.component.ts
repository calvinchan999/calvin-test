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

@Component({
    selector: 'app-header-component',
    templateUrl: './header.component.html'
})

export class HeaderComponent {
    @Output() public toggle = new EventEmitter();
    @Input() public selectedPage: string;
    @ViewChild("settingMenu") settingMenu : MenuComponent
    @ViewChild("langButton") langButton : DropDownButtonComponent
    @ViewChild("syncMenu") syncMenu : MenuComponent
    syncMenuItems =[]
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

    constructor(public intlService: IntlService , public uiSrv : UiService , public dialogSrv: DialogService, public dataSrv: DataService,
                public authSrv : AuthService , public router : Router, public util : GeneralUtil , public ngZone : NgZone  ) {
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
        this.syncMenuItems = this.dataSrv.alertFloorPlans.concat(<any> this.dataSrv.signalRSubj.arcsSyncLog.value ) 
        this.updateUnreadCount()
        setTimeout(()=> this.syncMenu.toggle(true , '0'))
    }

    public updateUnreadCount(){
        this.dataSrv.unreadSyncMsgCount.next(0)
        this.dataSrv.setlocalStorage('unreadSyncMsgCount' ,JSON.stringify(0))
    }

    public updateUnreadLog(){
        let processingLogs = (this.dataSrv.signalRSubj.arcsSyncLog.value ? this.dataSrv.signalRSubj.arcsSyncLog.value : []).filter(l=>l.dataSyncStatus == 'TRANSFERRING')
        this.dataSrv.signalRSubj.arcsSyncLog.next( processingLogs)
        this.dataSrv.setlocalStorage('syncDoneLog' , JSON.stringify([]))
    }

    public onSyncMenuClose(){
        this.updateUnreadLog()
        this.syncMenuItems = []
    }

}
