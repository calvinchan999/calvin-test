import { Injectable } from '@angular/core';
import { ActivatedRoute , Router} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
// @ts-ignore
@Injectable({
  providedIn: 'root'
})

export class RouteService {
  queryParams = new BehaviorSubject<any>(null)
  constructor(public route : ActivatedRoute , public router : Router) { 
    this.route.queryParams.pipe().subscribe((params)=>{
      this.queryParams.next(params)
      // this.refreshQueryParam()
    })
  }

  refreshQueryParam(queryParams = null){
    this.router.navigate(
      [], 
      {
        relativeTo: this.route,
        queryParams :queryParams  ? queryParams : {},  
        queryParamsHandling: 'merge', // remove to replace all query params by provided
      });
  }
}

   // this.router.navigate(
    //   [], 
    //   {
    //     relativeTo: this.route,
    //     queryParams, 
    //     queryParamsHandling: 'merge', // remove to replace all query params by provided
    //   });
