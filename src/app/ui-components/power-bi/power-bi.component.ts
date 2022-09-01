import { PowerBIEmbedModule, PowerBIReportEmbedComponent } from 'powerbi-client-angular';
import { Component, ElementRef, ViewChild ,OnInit } from '@angular/core';
import { IHttpPostMessageResponse } from 'http-post-message';
import { IReportEmbedConfiguration, models, Page, Report, service, VisualDescriptor } from 'powerbi-client';
import { HttpClient, HttpHeaders } from '@angular/common/http';

const successElement = document.createElement('img');
successElement.className = 'status-img';
// successElement.src = '/assets/success.svg';

// Error Image element
const errorElement = document.createElement('img');
errorElement.className = 'status-img';
// errorElement.src = '/assets/error.svg';

// Endpoint to get report config
const reportUrl = 'http://localhost:5000/api/sysparas/powerbi'//'https://aka.ms/CaptureViewsReportEmbedConfig';

const errorClass = 'error';
const successClass = 'success';

// To show / hide the report container
const hidden = 'hidden';

// To position the display message
const position = 'position';

@Component({
  selector: 'app-power-bi',
  templateUrl: './power-bi.component.html',
  styleUrls: ['./power-bi.component.scss']
})
export class PowerBiComponent implements OnInit {

  constructor(private element: ElementRef<HTMLDivElement>, private httpClient : HttpClient) {}

  ngOnInit(): void {
  }

  ngAfterViewInit(){
    this.embedReport()
  }

  @ViewChild(PowerBIReportEmbedComponent) reportObj!: PowerBIReportEmbedComponent;

  // Div object to show status of the demo app
  @ViewChild('status') private statusRef!: ElementRef<HTMLDivElement>;

  // Embed Report button element of the demo app
  @ViewChild('embedReportBtn') private embedBtnRef!: ElementRef<HTMLButtonElement>;

  // Track Report embedding status
  isEmbedded = false;

  // Overall status message of embedding
  displayMessage = 'The report is bootstrapped. Click Embed Report button to set the access token.';

  // CSS Class to be passed to the wrapper
  // Hide the report container initially
  reportClass = 'report-container hidden';

  // Flag which specify the type of embedding
  phasedEmbeddingFlag = false;

  // Pass the basic embed configurations to the wrapper to bootstrap the report on first load
  // Values for properties like embedUrl, accessToken and settings will be set on click of button
  reportConfig: IReportEmbedConfiguration = {
    type: 'report',
    embedUrl: undefined,
    tokenType: models.TokenType.Embed,
    accessToken: undefined,
    settings: undefined,
  };

  /**
   * Map of event handlers to be applied to the embedded report
   */
  // Update event handlers for the report by redefining the map using this.eventHandlersMap
  // Set event handler to null if event needs to be removed
  // More events can be provided from here
  // https://docs.microsoft.com/en-us/javascript/api/overview/powerbi/handle-events#report-events
  eventHandlersMap = new Map<string, (event?: service.ICustomEvent<any>) => void>([
    ['loaded', () => console.log('Report has loaded')],
    [
      'rendered',
      () => {
        console.log('Report has rendered');

        // Set displayMessage to empty when rendered for the first time
        if (!this.isEmbedded) {
          this.displayMessage = 'Use the buttons above to interact with the report using Power BI Client APIs.';
        }

        // Update embed status
        this.isEmbedded = true;
      },
    ],
    [
      'error',
      (event?: service.ICustomEvent<any>) => {
        if (event) {
          console.error(event.detail);
        }
      },
    ],
    ['visualClicked', () => console.log('visual clicked')],
    ['pageChanged', (event) => console.log(event)],
  ]);

  /**
   * Embeds report
   *
   * @returns Promise<void>
   */
  async embedReport(): Promise<void> {
    let reportConfigResponse
    let reportId = "5c8ce2ff-0488-4605-b4de-f90072dfc8e4"

    // Get the embed config from the service and set the reportConfigResponse
    try {
    //   reportConfigResponse =  JSON.parse(`{"Id":"5c8ce2ff-0488-4605-b4de-f90072dfc8e4",
    //   "embedUrl":"https://app.powerbi.com/reportEmbed?reportId=5c8ce2ff-0488-4605-b4de-f90072dfc8e4",
    //   "type":"report",
    //   "embedToken":{
    //     "token":"H4sIAAAAAAAEACWUNQ7sCAJE7_JTr2SmlSYwM3NnZmwzj_bu26PJKyg9vaq__9jpM0xp8ee_f3piXKomeXHaGFrs9BivYdiJS2kfgjdX5OLU_TZ-xa_fZd1ItofoBz-zUNKFRrgraxHtIjEUm946PtvMETMpPLzbiijZUiTMUqv1pR4fnIxpSdawoJYgvocTm5MqQTmEB4tOoOhtN-X98zQb-GQVwjdIpqCk-DYmN8TW_tkmHgI0cjpy6xWODGRenLA-CJ6gDyBTrJDaKr2EOzMuViALV893YW7diZWeZZsufnc9Cgr7zwfUbB07JlLbwavzT5GrZIW2rXT2us4ypRBituMrPzYTrMPavk4Uu6w9KeZrXAsE5xtnk6bnNtARE9h124RLlgONcIoPLR4030-IRxHXoBeZBuF6-hs4XhBr9Xxgoiq_g0N_DWNMJmLesndDfVcFRUmblfMXb0UjiGE5ilzUG1GxDN5k5MDPsfhUAeQhvzc0mojIa6xKUG26WNsCHzCAi0baKGbtyC4GhMsN3QZVfIu8aVUfq0CPR8ZOsT5Bo35gEEppE2JW_-X3nf2QgHQQ0kk5KzrCZlurYR_L0hTBi9_UHIMDuB9tmtg9PrD2kQ6TmN9KD4rwDBaSX6IU0JyoMhfUEJ5Vg-ocgQuwI3GVbJfzZ0BKuno31isSkw645eJah49kwWN7BUkz5mWJnMszSMLix4PdtlyLLDvJhg7UzB_UgFUGu4u3AGbCQBSuWphBcL8oKQ-GWkngOJ7wIFZVR0KvnWXQt5XAYGQJ3_Q8BJCJpYSQLoaLa8tNS6wmKx1HHgLrqZW4Fke_5mQLYBMxiYM3QvSpmgUxFwqUoX6FCGk6TqZtYd1SSVLChCkE9UZoTYvxbhI-YZUzRMD3j_2ac06I_vznD7c-8z5p5fObk-lQpTe5NooJGSfgGKB8BluLKsJfpzlVlGl0skM_K6p7IkqgCZdfgpvEW0WqU5c2turhL6cE8-7Z8bEDw-m6kVrMPJAGvB0p_bUBU-bCr0s1Nodk6YHIvhT1GIbMXkZwExWxmofpNLCsRdEMnCDkdlzViC64v-Ygm8sWRYsZ16EeyGPLaxFIESCXfdUWwLN8lkNKZIyiFh5tYM_OQdKKPD7mFscIB2Rfvj7AaeiyuUPoyCNCKXJZ1eICpXA-TuwIva7lmW952WBw7uyC3pHWo615H2ZlLplxfkxoxBWRIQUbUiJ4YxGIJj8KJr3Q-CpG8ZU-5bImOqSpsor5-6aCK4wyf_31D-ZnbspVCX-Uu7XSd_6lOmjhbyyHoIrZiX9TXluP6X6s5S_G3Tr7aePlidqOxU5w8aSWdK6zdh9u4Uo-CK3ivL7-tk_jMapf4dfck5Pl9WpnslA31TgYonBRvTwTIVdIVvZrGvsI5M8a8-8Kn2O6Q6KLXZHs25np75TIY5pfQ-rHmDl6hrKar689liYkk9k9G47Uw5MWYDkpHpFFi0NcGF1KcovZAhlNTMFvaxtwaLV1nQ7qhZ6bKgcyMc-r0NvyifQN15rRF36vmiKAD_iwUDRKe67xjOzSeTAAtp9iPi7iNtM_PEVcmerKJ6WfuGlIqxfOC29Zba0cnYscHcA6noyZJdrc-5BMUSB0H61IIDag5p882GGOJaNq7u8JSLSgkErdZOeH-X__BxM9To9CBgAA.eyJjbHVzdGVyVXJsIjoiaHR0cHM6Ly9XQUJJLVNPVVRILUVBU1QtQVNJQS1yZWRpcmVjdC5hbmFseXNpcy53aW5kb3dzLm5ldCIsImVtYmVkRmVhdHVyZXMiOnsibW9kZXJuRW1iZWQiOmZhbHNlfX0=",
    //     "tokenId":"89582e80-8034-40bd-935c-1c56024d3ea9",
    //     "expiration":"\/Date(1641948670000)\/"
    //   }
    // }`)
     reportConfigResponse = await this.httpClient.get(reportUrl).toPromise()
      console.log(reportConfigResponse)
    } catch (error: any) {
      // Prepare status message for Embed failure
      await this.prepareDisplayMessageForEmbed(errorElement, errorClass);
      this.displayMessage = `Failed to fetch config for report. Status: ${error.statusText} Status Code: ${error.status}`;
      console.error(this.displayMessage);
      return;
    }

    // Update the reportConfig to embed the PowerBI report
    this.reportConfig = {
      ...this.reportConfig,
      id: reportId,
      embedUrl: "https://app.powerbi.com/reportEmbed?reportId=" + reportId ,
      accessToken: reportConfigResponse.embedToken.token,
      settings: {
        background: models.BackgroundType.Transparent
      }
    };

    // Get the reference of the report-container div
    const reportDiv = this.element.nativeElement.querySelector('.report-container');
    if (reportDiv) {
      // When Embed report is clicked, show the report container div
      reportDiv.classList.remove(hidden);
    }

    // Get the reference of the display-message div
    const displayMessage = this.element.nativeElement.querySelector('.display-message');
    if (displayMessage) {
      // When Embed report is clicked, change the position of the display-message
      displayMessage.classList.remove(position);
    }

    // Prepare status message for Embed success
    await this.prepareDisplayMessageForEmbed(successElement, successClass);

    // Update the display message
    this.displayMessage = 'Access token is successfully set. Loading Power BI report.';
  }

  /**
   * Handle Report embedding flow
   * @param img Image to show with the display message
   * @param type Type of the message
   *
   * @returns Promise<void>
   */
  async prepareDisplayMessageForEmbed(img: HTMLImageElement, type: string): Promise<void> {
    // Remove the Embed Report button from UI
    this.embedBtnRef?.nativeElement.remove();

    // Prepend the Image element to the display message
    this.statusRef?.nativeElement.prepend(img);

    // Set type of the message
    this.statusRef?.nativeElement.classList.add(type);
  }

  /**
   * Delete visual
   *
   * @returns Promise<void>
   */
  async deleteVisual(): Promise<void> {
    // Get report from the wrapper component
    const report: Report = this.reportObj.getReport();

    if (!report) {
      // Prepare status message for Error
      this.prepareStatusMessage(errorElement, errorClass);
      this.displayMessage = 'Report not available.';
      console.log(this.displayMessage);
      return;
    }

    // Get all the pages of the report
    const pages: Page[] = await report.getPages();

    // Check if all the pages of the report deleted
    if (pages.length === 0) {
      // Prepare status message for Error
      this.prepareStatusMessage(errorElement, errorClass);
      this.displayMessage = 'No pages found.';
      console.log(this.displayMessage);
      return;
    }

    // Get active page of the report
    const activePage: Page | undefined = pages.find((page) => page.isActive);

    if (activePage) {
      // Get all visuals in the active page of the report
      const visuals: VisualDescriptor[] = await activePage.getVisuals();

      if (visuals.length === 0) {
        // Prepare status message for Error
        this.prepareStatusMessage(errorElement, errorClass);
        this.displayMessage = 'No visuals found.';
        console.log(this.displayMessage);
        return;
      }

      // Get first visible visual
      const visual: VisualDescriptor | undefined = visuals.find((v) => v.layout.displayState?.mode === models.VisualContainerDisplayMode.Visible);

      // No visible visual found
      if (!visual) {
        // Prepare status message for Error
        this.prepareStatusMessage(errorElement, errorClass);
        this.displayMessage = 'No visible visual available to delete.';
        console.log(this.displayMessage);
        return;
      }

      try {
        // Delete the visual using powerbi-report-authoring
        // For more information: https://docs.microsoft.com/en-us/javascript/api/overview/powerbi/report-authoring-overview
        const response = await (<any>activePage).deleteVisual(visual.name);

        // Prepare status message for success
        this.prepareStatusMessage(successElement, successClass);
        this.displayMessage = `${visual.type} visual was deleted.`;
        console.log(this.displayMessage);

        return response;
      } catch (error) {
        console.error(error);
      }
    }
  }

  /**
   * Hide Filter Pane
   *
   * @returns Promise<IHttpPostMessageResponse<void> | undefined>
   */
  async hideFilterPane(): Promise<IHttpPostMessageResponse<void> | undefined> {
    // Get report from the wrapper component
    const report: Report = this.reportObj.getReport();

    if (!report) {
      // Prepare status message for Error
      this.prepareStatusMessage(errorElement, errorClass);
      this.displayMessage = 'Report not available.';
      console.log(this.displayMessage);
      return;
    }

    // New settings to hide filter pane
    const settings = {
      panes: {
        filters: {
          expanded: false,
          visible: false,
        },
      },
    };

    try {
      const response = await report.updateSettings(settings);

      // Prepare status message for success
      this.prepareStatusMessage(successElement, successClass);
      this.displayMessage = 'Filter pane is hidden.';
      console.log(this.displayMessage);

      return response;
    } catch (error) {
      console.error(error);
      return;
    }
  }

  /**
   * Set data selected event
   *
   * @returns void
   */
  setDataSelectedEvent(): void {
    // Adding dataSelected event in eventHandlersMap
    this.eventHandlersMap = new Map<string, (event?: service.ICustomEvent<any>) => void>([
      ...this.eventHandlersMap,
      ['dataSelected', (event) => console.log(event)],
    ]);

    // Prepare status message for success
    this.prepareStatusMessage(successElement, successClass);
    this.displayMessage = 'Data Selected event set successfully. Select data to see event in console.';
  }

  /**
   * Prepare status message while using JS SDK APIs
   * @param img Image to show with the display message
   * @param type Type of the message
   *
   * @returns void
   */
  prepareStatusMessage(img: HTMLImageElement, type: string) {
    // Prepend Image to the display message
    this.statusRef.nativeElement.prepend(img);

    // Add class to the display message
    this.statusRef.nativeElement.classList.add(type);
  }

}
