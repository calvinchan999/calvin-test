//import standard library
import { Injectable, APP_INITIALIZER } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

//import { environment } from 'environments/environment'; //path to your environment files

//import custom library
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { RvHttpService } from './rv-http.service';

@Injectable()
export class ConfigService {
    
	private _config: Object
    private _env: string;


	constructor(private http        : HttpClient,
                private httpSrv : RvHttpService,
		        private generalUtil : GeneralUtil) { 

	}

    async loadDbConfig(getFrApi = false){
        // let endpoint = "api/sysparas"
        // try{
        //     let dbCfg 
        //     if(getFrApi || !sessionStorage.getItem("dbconfig")){
        //         dbCfg = await this.httpSrv.get(endpoint,undefined,undefined,undefined,undefined,true)
        //         sessionStorage.setItem("dbconfig",JSON.stringify(dbCfg))
        //     }else{
        //         dbCfg = JSON.parse(sessionStorage.getItem("dbconfig"))
        //     }
        //     this.generalUtil.setDbConfig(dbCfg)
        // }catch(e){
        //     console.log(e)
        //     window.confirm("Fail to get DB config. Close the tab directly or the page will keep refreshing until DB config can be retrieved from API successfully... \n(url : " + 
        //                     this.generalUtil.getAPIUrl() + '/' + endpoint + ")" )
        //     window.location.reload()
        // }
    }
	
    load() {
        this.http.get("assets/config/formConfig.json")
        .subscribe((data) => {
            this.generalUtil.setFormConfig(data);
        },
        (error: any) => {
            console.error(error);
            return Observable.throw(error.json().error || 'Server error');
        });
        return new Promise((resolve, reject) => {
            console.log('loadConfig')
            this._env = 'development';
            // if (environment.production)
            //     this._env = 'production';
            // console.log(this._env)

            //this.http.get('./assets/config/' + this._env + '.json')
            // this.http.get("assets/config/formConfig.json").subscribe((data)=>{
            //     this.generalUtil.formConfig = data;
            //     (error: any) => {
            //         console.error(error);
            //     }
            // })

			this.http.get("assets/config/config.json")
                // .map(res => res.json())
                .subscribe((data) => {
                    this._config = data;
					this.generalUtil.setConfig(data);
                    // this.loadDbConfig()
                    resolve(true);
                },
                (error: any) => {
                    console.error(error);
                    return Observable.throw(error.json().error || 'Server error');
                });
        });
    }

    // Is app in the development mode?
    isDevmode() {
        return this._env === 'development';
    }

    // Gets API route based on the provided key
    getApi(key: string): string {
        return this._config["API_ENDPOINTS"][key];
    }

    // Gets a value of specified property in the configuration file
    get(key: any) {
        return this._config[key];
    }
}

export function ConfigFactory(config: ConfigService) {
    return () => config.load();
}

export function init() {
    return {
        provide: APP_INITIALIZER,
        useFactory: ConfigFactory,
        deps: [ConfigService],
        multi: true
    }
}

const ConfigModule = {
    init: init
}

export { ConfigModule };
