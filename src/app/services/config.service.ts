//import standard library
import { Injectable, APP_INITIALIZER } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
//import { environment } from 'environments/environment'; //path to your environment files

//import custom library
import { GeneralUtil } from 'src/app/utils/general/general.util';
import { RvHttpService } from './rv-http.service';

@Injectable()
export class ConfigService {
    public disabledModule_SA = {
        fan: false,
        brake: false,
        led: false,
        followMe: false,
        manual: false,
        pathFollowing: false,
        restart: false,
        charge: false,
        stop: false,
        pause: false,
        pairing: false,
        auto: false,
        changeMap: false,
        localize: false,
        maxSpeed: false,
        safetyZone: false,
        shutdown: false
    }
	private _config: Object
    private _env: string;
    public dbConfig  = {
        DISABLE_PATH_FOLLOWING : false
    }


	constructor(private http : HttpClient,
                private httpSrv : RvHttpService,
		        private generalUtil : GeneralUtil) { 

	}

    setDbConfig(dbConfig: { configKey: string, configValue: string }[]) {
        dbConfig.forEach(c => {
            const needDeserialize = Object.keys(this.dbConfig).includes(c.configKey) && !(c.configValue == null || this.dbConfig[c.configKey] == null || typeof this.dbConfig[c.configKey] === 'string' || this.dbConfig[c.configKey] instanceof String)
            try{
                this.dbConfig[c.configKey] = needDeserialize ? JSON.parse(c.configValue) : c.configValue
            }catch(e){
                let err = `INVALID CONFIG VALUE : ${JSON.stringify(dbConfig.filter(c2=>c.configKey == c2.configKey)[0])}`
                console.log(err)
                throw new Error(err);
            }
        })
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
            console.log("AZURE STATIC WEB APP CONFIG : ")
            console.log(process?.env.CONFIG)
            if (process?.env.CONFIG) {
                this.generalUtil.setConfig(JSON.parse(process.env.CONFIG))
            } else {
                this.http.get(environment.production ? "assets/config/config.json" : "assets/config/config_dev.json")
                    .subscribe((data) => {
                        this._config = data;
                        this.generalUtil.setConfig(data);
                        resolve(true);
                    },
                        (error: any) => {
                            console.error(error);
                            return Observable.throw(error.json().error || 'Server error');
                        });
            }
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
