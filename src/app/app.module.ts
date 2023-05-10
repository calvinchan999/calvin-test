import { BrowserModule, Title } from '@angular/platform-browser';
import { Router, RouterModule } from '@angular/router';
import { NgModule, LOCALE_ID ,CUSTOM_ELEMENTS_SCHEMA} from '@angular/core';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CommonModule, LocationStrategy, HashLocationStrategy, DatePipe } from '@angular/common';

import { AppComponent } from './app.component';
import { ConfigModule, ConfigService } from './services/config.service';
import { HeaderComponent } from './common-components/header/header.component';
import { BarcodesModule } from '@progress/kendo-angular-barcodes';

// import { RatingComponent } from './components/team/rating.component';
// import { DashboardComponent } from './components/dashboard/dashboard.component';
// import { CardComponent } from './components/planning/cards/card.component';
// import { PlanningComponent } from './components/planning/planning.component';
// import { ProfileComponent } from './components/profile/profile.component';
// import { InfoComponent } from './components/info/info.component';
// import { TeamComponent } from './components/team/team.component';
// import { PatrolComponent } from './components/patrol/patrol.component';
// import { CustomMessagesService } from './services/custom-messages.service';

import { ExcelModule, GridModule, PDFModule } from '@progress/kendo-angular-grid';
import { LabelModule } from '@progress/kendo-angular-label';
import { LayoutModule } from '@progress/kendo-angular-layout';
import { SchedulerModule } from '@progress/kendo-angular-scheduler';
import { ButtonsModule } from '@progress/kendo-angular-buttons';
import { EditorModule } from '@progress/kendo-angular-editor';
import { FileSelectModule } from '@progress/kendo-angular-upload';
import { ChartsModule } from '@progress/kendo-angular-charts';
import { IntlModule } from '@progress/kendo-angular-intl';
import { DateInputsModule } from '@progress/kendo-angular-dateinputs';
import { InputsModule } from '@progress/kendo-angular-inputs';
import { DropDownsModule } from '@progress/kendo-angular-dropdowns';
import { DialogModule, WindowModule } from "@progress/kendo-angular-dialog";
import { ProgressBarModule } from "@progress/kendo-angular-progressbar";
import { NotificationModule } from '@progress/kendo-angular-notification';
import { IndicatorsModule } from '@progress/kendo-angular-indicators';
import { NgPixiModule } from 'src/app/utils/ng-pixi/ng-pixi.module';
import { MenusModule } from '@progress/kendo-angular-menu';
import { TreeViewModule } from "@progress/kendo-angular-treeview";
import { TooltipModule  } from "@progress/kendo-angular-tooltip";
import {TextInput } from 'pixi-text-input'

//import http interceptor
import { CustomHttpInterceptor } from './utils/http/http.interceptor';

//import custom service provider
import { MessageService } from '@progress/kendo-angular-l10n';
import { NotificationService } from '@progress/kendo-angular-notification';
import { AuthGuard } from "./utils/auth/auth.guard.util";
import { AuthService } from './services/auth.service';
// import { TaskTemplateService } from './services/tasktemplate.service';
// import { TaskListService } from './services/tasklist.service';
// import { RobotMapService } from './services/robotmap.service';
import { environment } from 'src/environments/environment';


import {A11yModule} from '@angular/cdk/a11y';
import {ClipboardModule} from '@angular/cdk/clipboard';
import {CDK_DRAG_CONFIG, DragDropModule} from '@angular/cdk/drag-drop';
import {PortalModule} from '@angular/cdk/portal';
import {ScrollingModule} from '@angular/cdk/scrolling';
import {CdkStepperModule} from '@angular/cdk/stepper';
import {CdkTableModule} from '@angular/cdk/table';
import {CdkTreeModule} from '@angular/cdk/tree';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import {MatBadgeModule} from '@angular/material/badge';
import {MatBottomSheetModule} from '@angular/material/bottom-sheet';
import {MatButtonModule} from '@angular/material/button';
import {MatButtonToggleModule} from '@angular/material/button-toggle';
import {MatCardModule} from '@angular/material/card';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatChipsModule} from '@angular/material/chips';
import {MatStepperModule} from '@angular/material/stepper';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatDialogModule} from '@angular/material/dialog';
import {MatDividerModule} from '@angular/material/divider';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatIconModule} from '@angular/material/icon';
import {MatInputModule} from '@angular/material/input';
import {MatListModule} from '@angular/material/list';
import {MatMenuModule} from '@angular/material/menu';
import {MatNativeDateModule, MatRippleModule} from '@angular/material/core';
import {MatPaginatorModule} from '@angular/material/paginator';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatRadioModule} from '@angular/material/radio';
import {MatSelectModule} from '@angular/material/select';
import {MatSidenavModule} from '@angular/material/sidenav';
import {MatSliderModule} from '@angular/material/slider';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import {MatSortModule} from '@angular/material/sort';
import {MatTableModule} from '@angular/material/table';
import {MatTabsModule} from '@angular/material/tabs';
import {MatToolbarModule} from '@angular/material/toolbar';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatTreeModule} from '@angular/material/tree';
import {OverlayModule} from '@angular/cdk/overlay';
import {MsgDialogContent, SafePipe} from  './services/ui.service';
import { PowerBIEmbedModule } from 'powerbi-client-angular';
import { RECAPTCHA_V3_SITE_KEY, RecaptchaV3Module } from "ng-recaptcha";

var routes = [];
var standaloneApp = environment.app.toUpperCase() == 'STANDALONE'
if (standaloneApp) {
    routes = [
        { path: '', redirectTo: 'login', pathMatch: 'full' },
        { path: 'login', component : CmLoginComponent },
        // { path: 'pages/scanqr' , component: SaPagesScanQrComponent,  canActivate: [AuthGuard]},
        // { path: 'pages/msg' , component: SaPagesCommonMessageComponent,  canActivate: [AuthGuard]},
        // { path: 'pages/pin' , component: SaPagesPinComponent,  canActivate: [AuthGuard]},
        { path: 'signalR', component: TestSignalRComponent ,  canActivate: [AuthGuard]},
        { path: 'home', component: SaHomeComponent ,   canActivate: [AuthGuard] },
        { path: 'dashboard', component: SaTopModuleComponent ,   canActivate: [AuthGuard] },
        { path: 'map', component: SaMapComponent ,   canActivate: [AuthGuard] },
        { path: 'control', component: SaControlComponent ,   canActivate: [AuthGuard] },
        { path: 'task', component: SaTaskComponent ,   canActivate: [AuthGuard]},
        { path: 'taskProgress', component: SaPagesTaskProgressComponent ,  canActivate: [AuthGuard]},
        { path: 'user', component: CmUserComponent ,  canActivate: [AuthGuard]},
        // { path: 'arcs/home' , component: ArcsDashboardComponent}, //testing
        // { path: 'arcs/setup' , component: ArcsSetupComponent}, //testing
        // { path: 'arcs/powerbi' , component: PowerBiComponent}, //testing
        { path: '**', redirectTo:'/home' }, //MUST BE THE LAST ITEM
    ]
} else  { //ARCS
    routes = [
        { path: '', redirectTo: 'login', pathMatch: 'full' },
        { path: 'login', component : CmLoginComponent },
        { path: 'resetPassword', component : CmResetPwComponent },
        // { path: 'login/:clientId', component : CmLoginComponent },
        { path: 'home' , component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        { path: 'setup' , component: ArcsSetupComponent,  canActivate: [AuthGuard]},
        // { path: 'delivery',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'patrol',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'disinfection', component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'mobile_chair',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'beverage',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'warehouse',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'forklift',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'stocktake',  component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'floorscrub', component: ArcsDashboardComponent,  canActivate: [AuthGuard]},
        // { path: 'powerbi' , component: PowerBiComponent,  canActivate: [AuthGuard]},//testing
        { path: 'signalR', component: TestSignalRComponent ,  canActivate: [AuthGuard]},//testing
        { path: 'user', component: CmUserComponent ,  canActivate: [AuthGuard]},        
    ].concat(environment.routes?.map(r=>{return {
         path: r.path.replace("/" , ""), component: ArcsDashboardComponent ,  canActivate: [AuthGuard]
    }})).concat(
        <any>[{ path: '**', redirectTo:'/home' }] //MUST BE THE LAST ITEM
    )
}


import 'hammerjs';

import '@progress/kendo-angular-intl/locales/en/all';
import '@progress/kendo-angular-intl/locales/es/all';
import '@progress/kendo-angular-intl/locales/fr/all';
import { SaHomeComponent } from './standalone/sa-home/sa-home.component';
import { CssClassNamePipe, RoundDownPipe, RoundUpPipe , highlightSearchPipe , TranslatePipe , DropdownDescPipe , WaypointNamePipe , DateStringPipe , EnumNamePipe , DynamicPipe , RepalcePipe } from './services/ui.service';
import { Map2DViewportComponent } from './ui-components/map-2d-viewport/map-2d-viewport.component';
import { DateRangeFilterComponent, MultiCheckFilterComponent, TableComponent } from './ui-components/table/table.component';
import { TxtboxComponent } from './ui-components/txtbox/txtbox.component';
import { SaMapComponent } from './standalone/sa-map/sa-map.component';
import { DropdownComponent } from './ui-components/dropdown/dropdown.component';
import { SaControlComponent } from './standalone/sa-control/sa-control.component';
import { SaTaskComponent } from './standalone/sa-task/sa-task.component';
import { ListviewComponent , rowDetailToolTipPipe as RowDetailToolTipPipe } from './ui-components/listview/listview.component';
import { DateInputComponent } from './ui-components/date-input/date-input.component';
import { ChangePasswordComponent } from './common-components/header/change-password/change-password.component';
import { ListViewModule } from '@progress/kendo-angular-listview';
import { MultiselectComponent } from './ui-components/multiselect/multiselect.component';
import { ArcsSetupComponent as ArcsSetupComponent } from './arcs/arcs-setup/arcs-setup.component';
import { ArcsSetupSiteComponent } from './arcs/arcs-setup/arcs-setup-site/arcs-setup-site.component';
import { ArcsSetupBuildingComponent } from './arcs/arcs-setup/arcs-setup-building/arcs-setup-building.component';
import { ZXingScannerModule } from '@zxing/ngx-scanner';
import { ArcsDashboardComponent } from './arcs/arcs-dashboard/arcs-dashboard.component';
import { PowerBiComponent } from './ui-components/power-bi/power-bi.component';
import { SaPagesUnlockCabinetComponent } from './standalone/sa-pages/sa-pages-unlock-cabinet/sa-pages-unlock-cabinet.component';
import { SaPagesCommonMessageComponent } from './standalone/sa-pages/sa-pages-common-message/sa-pages-common-message.component';
import { SaPagesLockCabinetComponent } from './standalone/sa-pages/sa-pages-lock-cabinet/sa-pages-lock-cabinet.component';
import { WifiComponent } from './common-components/header/wifi/wifi.component';
import { TestSignalRComponent } from './common-components/test-signalR/test-signalR.component';
import { CmMapComponent } from './common-components/cm-map/cm-map.component';
import { CmTaskComponent } from './common-components/cm-task/cm-task.component';
import { CmMapDetailComponent } from './common-components/cm-map/cm-map-detail/cm-map-detail.component';
import { CmMapFloorplanComponent } from './common-components/cm-map/cm-map-floorplan/cm-map-floorplan.component';
import { CmTaskJobComponent } from './common-components/cm-task/cm-task-job/cm-task-job.component';
import { CmTaskJobActionComponent } from './common-components/cm-task/cm-task-job/cm-task-job-action/cm-task-job-action.component';
import { CmTaskJobParametersComponent } from './common-components/cm-task/cm-task-job/cm-task-job-parameters/cm-task-job-parameters.component';
import { CmLoginComponent } from './common-components/cm-login/cm-login.component';
import { CmActionComponent } from './common-components/cm-action/cm-action.component';
import { ArcsSetupTypeComponent } from './arcs/arcs-setup/arcs-setup-type/arcs-setup-type.component';
import { ArcsSetupRobotComponent } from './arcs/arcs-setup/arcs-setup-robot/arcs-setup-robot.component';
import { SaPagesAlertOverlayComponent } from './standalone/sa-pages/sa-pages-alert-overlay/sa-pages-alert-overlay.component';
import { JoystickComponent } from './ui-components/joystick/joystick.component';
import { SaPagesTaskProgressComponent } from './standalone/sa-pages/sa-pages-task-progress/sa-pages-task-progress.component';
import { CmUserComponent } from './common-components/cm-user/cm-user.component';
import { CmUserDetailComponent } from './common-components/cm-user/cm-user-detail/cm-user-detail.component';
import { CmUserGroupComponent } from './common-components/cm-user/cm-user-group/cm-user-group.component';
import { SaTopModuleComponent } from './standalone/sa-top-module/sa-top-module.component';
import { SaControlButtonsComponent } from './standalone/sa-control/sa-control-buttons/sa-control-buttons.component';
import { VideoPlayerComponent } from './ui-components/video-player/video-player.component';
import { ScrollViewModule } from '@progress/kendo-angular-scrollview';
import { ArcsDashboardRobotDetailComponent } from './arcs/arcs-dashboard/arcs-dashboard-robot-detail/arcs-dashboard-robot-detail.component';
import { ServiceWorkerModule } from '@angular/service-worker';
import { SaPagesDeliveryFillupComponent } from './standalone/sa-pages/top-modules/delivery/sa-pages-delivery-fillup/sa-pages-delivery-fillup.component';
import { SaPagesDeliveryPickupComponent } from './standalone/sa-pages/top-modules/delivery/sa-pages-delivery-pickup/sa-pages-delivery-pickup.component';
import { CronEditorComponent } from './ui-components/cron-editor/cron-editor.component';
import { ArcsTaskScheduleComponent } from './arcs/arcs-dashboard/arcs-task-schedule/arcs-task-schedule.component';
import { ArcsSetupPointTypeComponent } from './arcs/arcs-setup/arcs-setup-point-type/arcs-setup-point-type.component';
import { ArcsChartsComponent } from './arcs/arcs-dashboard/arcs-charts/arcs-charts.component';
import { ForgetPasswordComponent } from './common-components/cm-login/forget-password/forget-password.component';
import { CmResetPwComponent } from './common-components/cm-reset-pw/cm-reset-pw.component';
import { ArcsSetupImportMapComponent } from './arcs/arcs-setup/arcs-setup-import/arcs-setup-import-map/arcs-setup-import-map.component';
import { ArcsSetupExportMapComponent } from './arcs/arcs-setup/arcs-setup-export/arcs-setup-export-map/arcs-setup-export-map.component';
import { ArcsPasswordPolicyComponent } from './common-components/cm-user/arcs-password-policy/arcs-password-policy.component';
import { SaMapImportComponent } from './standalone/sa-map/sa-map-import/sa-map-import.component';
import { SaMapExportComponent } from './standalone/sa-map/sa-map-export/sa-map-export.component';
import { CmEventLogComponent } from './common-components/cm-event-log/cm-event-log.component';
import { ThreejsViewportComponent } from './ui-components/threejs-viewport/threejs-viewport.component';
import { ArcsSetupImportFloorplanComponent } from './arcs/arcs-setup/arcs-setup-import/arcs-setup-import-floorplan/arcs-setup-import-floorplan.component';
import { ArcsSetupExportFloorplanComponent } from './arcs/arcs-setup/arcs-setup-export/arcs-setup-export-floorplan/arcs-setup-export-floorplan.component';
import { ArcsRobotGroupComponent } from './arcs/arcs-dashboard/arcs-robot-group/arcs-robot-group.component';
import { ArcsAbnormalTasksComponent } from './arcs/arcs-dashboard/arcs-charts/arcs-abnormal-tasks/arcs-abnormal-tasks.component';
import { CmTaskCancelComponent } from './common-components/cm-task/cm-task-cancel/cm-task-cancel.component';
import { ArcsLiftIotComponent } from './arcs/arcs-iot/arcs-lift-iot/arcs-lift-iot.component';
import { ArcsTurnstileIotComponent } from './arcs/arcs-iot/arcs-turnstile-iot/arcs-turnstile-iot.component';
import { ArcsSetupRobotCoopComponent } from './arcs/arcs-setup/arcs-setup-robot-coop/arcs-setup-robot-coop.component';
import { FilterModule } from '@progress/kendo-angular-filter';
import { WorkflowDesignerComponent } from './ui-components/workflow-designer/workflow-designer.component';
import { PinKeypadComponent } from './ui-components/pin-keypad/pin-keypad.component';
import { ArcsSetupFloorplan3dComponent } from './arcs/arcs-setup/arcs-setup-floorplan3d/arcs-setup-floorplan3d.component';
import { ArcsPatrolPlaybackComponent } from './arcs/arcs-dashboard/arcs-patrol-playback/arcs-patrol-playback.component';
// import { WorkflowComponent } from './ui-components/workflow/workflow.component';
// import { SequentialWorkflowDesignerModule } from 'sequential-workflow-designer-angular';

@NgModule({
    declarations: [
        AppComponent,

        HeaderComponent,
        // RatingComponent,
        // DashboardComponent,
        // CardComponent,
        // PlanningComponent,
        // ProfileComponent,
        // InfoComponent,
        // TeamComponent,
        // PatrolComponent,
        Map2DViewportComponent,
        SaHomeComponent,
        DynamicPipe,
        RepalcePipe,
        DateStringPipe,
        EnumNamePipe,
        highlightSearchPipe,    
        RoundDownPipe,
        RoundUpPipe,
        DropdownDescPipe,
        TranslatePipe,      
        WaypointNamePipe,
        CssClassNamePipe,        
        RowDetailToolTipPipe,
        SafePipe,
        
        TableComponent,
        MsgDialogContent,
        TxtboxComponent,
        SaMapComponent,
        DropdownComponent,
        SaControlComponent,
        SaTaskComponent,
        ListviewComponent,
        DateInputComponent,
        ChangePasswordComponent,
        MultiselectComponent,
        ArcsSetupComponent,
        ArcsSetupSiteComponent,
        ArcsSetupBuildingComponent,
        ArcsDashboardComponent,
        PowerBiComponent,
        SaPagesCommonMessageComponent,
        SaPagesLockCabinetComponent,
        SaPagesUnlockCabinetComponent,
        WifiComponent,
        TestSignalRComponent,
        CmMapComponent,
        CmTaskComponent,
        CmMapDetailComponent,
        CmMapFloorplanComponent,
        CmTaskJobComponent,
        CmTaskJobActionComponent,
        CmTaskJobParametersComponent,
        CmLoginComponent,
        CmActionComponent,
        ArcsSetupTypeComponent,
        ArcsSetupRobotComponent,
        SaPagesAlertOverlayComponent,
        JoystickComponent,
        SaPagesTaskProgressComponent,
        CmUserComponent,
        CmUserDetailComponent,
        CmUserGroupComponent,
        SaTopModuleComponent,
        SaControlButtonsComponent,
        VideoPlayerComponent,
        ArcsDashboardRobotDetailComponent,
        SaPagesDeliveryFillupComponent,
        SaPagesDeliveryPickupComponent,
        MultiCheckFilterComponent,
        DateRangeFilterComponent,
        CronEditorComponent,
        ArcsTaskScheduleComponent,
        ArcsSetupPointTypeComponent,
        ArcsChartsComponent,
        ForgetPasswordComponent,
        CmResetPwComponent,
        ArcsSetupImportMapComponent,
        ArcsSetupExportMapComponent,
        ArcsPasswordPolicyComponent,
        SaMapImportComponent,
        SaMapExportComponent,
        CmEventLogComponent,
        ThreejsViewportComponent,
        ArcsSetupImportFloorplanComponent,
        ArcsSetupExportFloorplanComponent,
        ArcsRobotGroupComponent,
        ArcsAbnormalTasksComponent,
        CmTaskCancelComponent,
        ArcsLiftIotComponent,
        ArcsTurnstileIotComponent,
        ArcsSetupRobotCoopComponent,
        WorkflowDesignerComponent,
        PinKeypadComponent,
        ArcsSetupFloorplan3dComponent,
        ArcsPatrolPlaybackComponent,
        // WorkflowComponent        
    ],
    imports: [
        BarcodesModule,
        FilterModule,
        PowerBIEmbedModule,
        ZXingScannerModule,
        A11yModule,
        ClipboardModule,
        CdkStepperModule,
        CdkTableModule,
        CdkTreeModule,
        DragDropModule,
        MatAutocompleteModule,
        MatBadgeModule,
        MatBottomSheetModule,
        MatButtonModule,
        MatButtonToggleModule,
        MatCardModule,
        MatCheckboxModule,
        MatChipsModule,
        MatStepperModule,
        MatDatepickerModule,
        MatDialogModule,
        MatDividerModule,
        MatExpansionModule,
        MatGridListModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        MatMenuModule,
        MatNativeDateModule,
        MatPaginatorModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatRadioModule,
        MatRippleModule,
        MatSelectModule,
        MatSidenavModule,
        MatSliderModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        MatSortModule,
        MatTableModule,
        MatTabsModule,
        MatToolbarModule,
        MatTooltipModule,
        MatTreeModule,
        OverlayModule,
        PortalModule,
        ScrollingModule,
        BrowserModule,
        CommonModule,
        HttpClientModule,
        FormsModule,
        // SequentialWorkflowDesignerModule,
        BrowserAnimationsModule,
        ReactiveFormsModule,
        GridModule,
        PDFModule,
        ExcelModule,
        LabelModule,
        LayoutModule,
        SchedulerModule,
        ButtonsModule,
        EditorModule,
        FileSelectModule,
        ChartsModule,
        IntlModule,
        DateInputsModule,
        InputsModule,
        DropDownsModule,
        DialogModule,
        WindowModule,
        ProgressBarModule,
        RouterModule.forRoot(routes),
        NotificationModule,
        IndicatorsModule,
        NgPixiModule,
        MenusModule,
        ListViewModule,
        ScrollViewModule,
        TreeViewModule,
        TooltipModule,

        RecaptchaV3Module,
        ServiceWorkerModule.register('ngsw-worker.js', {
          enabled: environment.production,
          // Register the ServiceWorker as soon as the app is stable
          // or after 30 seconds (whichever comes first).
          registrationStrategy: 'registerWhenStable:30000'
        })
    ],

    providers: [
        DatePipe,
        { provide: HTTP_INTERCEPTORS, useClass: CustomHttpInterceptor, multi: true },
        { provide: CDK_DRAG_CONFIG, useValue: { zIndex: 100000000 } },
        // { provide: MessageService, useClass: CustomMessagesService },
        { provide: NotificationService, useClass: NotificationService },
        { provide: LOCALE_ID, useValue: 'en-US' },
        { provide: RECAPTCHA_V3_SITE_KEY, useValue: environment.recaptchaSiteKey },
        ConfigService,
        ConfigModule.init(),
        AuthGuard,
        AuthService,
        Title
        // TaskTemplateService,
        // TaskListService,
        // RobotMapService,
    ],
    exports: [
        A11yModule,
        ClipboardModule,
        CdkStepperModule,
        CdkTableModule,
        CdkTreeModule,
        DragDropModule,
        MatAutocompleteModule,
        MatBadgeModule,
        MatBottomSheetModule,
        MatButtonModule,
        MatButtonToggleModule,
        MatCardModule,
        MatCheckboxModule,
        MatChipsModule,
        MatStepperModule,
        MatDatepickerModule,
        MatDialogModule,
        MatDividerModule,
        MatExpansionModule,
        MatGridListModule,
        MatIconModule,
        MatInputModule,
        MatListModule,
        MatMenuModule,
        MatNativeDateModule,
        MatPaginatorModule,
        MatProgressBarModule,
        MatProgressSpinnerModule,
        MatRadioModule,
        MatRippleModule,
        MatSelectModule,
        MatSidenavModule,
        MatSliderModule,
        MatSlideToggleModule,
        MatSnackBarModule,
        MatSortModule,
        MatTableModule,
        MatTabsModule,
        MatToolbarModule,
        MatTooltipModule,
        MatTreeModule,
        OverlayModule,
        PortalModule,
        ScrollingModule,
      ],

    bootstrap: [AppComponent]
})
export class AppModule { 
}
