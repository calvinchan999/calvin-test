import { Injectable } from '@angular/core';
import { IDBPDatabase, openDB } from 'idb';
import { FloorPlanState } from './map.service';
import { base64ToBlob, blobToBase64 } from '../utils/general/general.util';

const DB_NAME = 'RV'
// @ts-ignore
@Injectable({
  providedIn: 'root'
})
export class IndexedDBService {
  floorPlans : IndexedDBStore
  constructor() {
    this.floorPlans = new IndexedDBStore("FLOORPLAN")
  }
}


export class IndexedDBStore {
  dbPromise: Promise<IDBPDatabase<unknown>>;
  storeName: string
  constructor(_storeName: string) {
    this.storeName = _storeName
    this.dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(_storeName);
      },
    });
  }

  async get(key): Promise<any> {
    let ret  = await (await this.dbPromise).get(this.storeName, key);
    return ret ? JSON.parse(ret) : ret
  }
  async set(key, val: any) {
    val = val ? JSON.stringify(val) : val
    return (await this.dbPromise).put(this.storeName, val, key);
  }
  async del(key) {
    return (await this.dbPromise).delete(this.storeName, key);
  }
  async clear() {
    return (await this.dbPromise).clear(this.storeName);
  }
  async keys() {
    return (await this.dbPromise).getAllKeys(this.storeName);
  }
}
