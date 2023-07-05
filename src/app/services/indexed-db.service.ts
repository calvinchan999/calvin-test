import { Injectable } from '@angular/core';
import { IDBPDatabase, openDB } from 'idb';
import { FloorPlanState } from './map.service';
import { base64ToBlob, blobToBase64 } from '../utils/general/general.util';
import { environment } from 'src/environments/environment';

const DB_NAME = 'RV'
// @ts-ignore
@Injectable({
  providedIn: 'root'
})

export class IndexedDBService {
  floorPlans : IndexedDBStore
  versions : IndexedDBStore
  constructor() {
    this.floorPlans = new IndexedDBStore("FLOORPLAN")
    this.versions = new IndexedDBStore("VERSIONS")    
    this.houseKeeping();  
  }

  async houseKeeping(){
    const latestVersion = environment.version
    const versions = await this.versions.keys()
    const db = await IndexedDBStore.dbPromise
    if(!versions.includes(latestVersion)){     
        for(let i = versions.length - 1 ; i > 0 ; i --){
          if(await db.get(this.versions.storeName, versions[i]) == 'ACTIVE'){
            console.log(`INDEXD DB OUTDATED - OLD VERSION : ${versions[i]}`)
            break;
          }
        }
        this.clearAllStores()        
        versions.forEach(async (v) => (db.put(this.versions.storeName, 'INACTIVE' , v)));
        db.put(this.versions.storeName, 'ACTIVE' , latestVersion);
        console.log(`NEW INDEXED DB READY -  VERSION : ${latestVersion}`)
    }
  }

  async clearAllStores(){    
    Object.values(this).filter(p=> p instanceof IndexedDBStore && p!= this.versions).forEach((db:IndexedDBStore)=> db.clear())
    console.log(`ALL OLD CACHE CLEARED FROM INDEXD DB`)
  } 
}


export class IndexedDBStore {
  static dbPromise: Promise<IDBPDatabase<unknown>>;
  storeName: string;

  constructor(storeName: string) {
    this.storeName = storeName;

    if (!IndexedDBStore.dbPromise) {
      IndexedDBStore.dbPromise = openDB(DB_NAME, 1, {
        upgrade(db) {
          db.createObjectStore("FLOORPLAN");
          db.createObjectStore("VERSIONS");
        },
      });
    }
  }

  async get(key): Promise<any> {
    let ret = await (await IndexedDBStore.dbPromise).get(
      this.storeName,
      key
    );
    return ret ? JSON.parse(ret) : ret;
  }

  async set(key, val: any) {
    val = val ? JSON.stringify(val) : val;
    return (await IndexedDBStore.dbPromise).put(
      this.storeName,
      val,
      key
    );
  }

  async del(key) {
    return (await IndexedDBStore.dbPromise).delete(
      this.storeName,
      key
    );
  }

  async clear() {
    return (await IndexedDBStore.dbPromise).clear(
      this.storeName
    );
  }

  async keys() {
    return (await IndexedDBStore.dbPromise).getAllKeys(
      this.storeName
    );
  }

  async getAll() {
    return (await IndexedDBStore.dbPromise).getAll(
      this.storeName
    );
  }
  // dbPromise: Promise<IDBPDatabase<unknown>>;
  // storeName: string
  // constructor(_storeName: string) {
  //   const timestamp = new Date().getTime();
  //   this.storeName = _storeName
  //   this.dbPromise = openDB(DB_NAME , timestamp, {
  //     upgrade(db) {
  //       if(!db.objectStoreNames.contains(_storeName)){
  //         db.createObjectStore(_storeName);
  //       }
  //     },
  //   });
  // }


  // async get(key): Promise<any> {
  //   let ret  = await (await this.dbPromise).get(this.storeName, key);
  //   return ret ? JSON.parse(ret) : ret
  // }
  // async set(key, val: any) {
  //   val = val ? JSON.stringify(val) : val
  //   return (await this.dbPromise).put(this.storeName, val, key);
  // }
  // async del(key) {
  //   return (await this.dbPromise).delete(this.storeName, key);
  // }
  // async clear() {
  //   return (await this.dbPromise).clear(this.storeName);
  // }
  // async keys() {
  //   return (await this.dbPromise).getAllKeys(this.storeName);
  // }

  // async getAll(){
  //   return (await this.dbPromise).getAll(this.storeName);
  // }
}
