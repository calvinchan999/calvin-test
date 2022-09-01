// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  app: 'standalone',
  routes:
  [
    { text: 'delivery', icon: 'mdi mdi-truck-fast', path: '/delivery', },
    { text: 'floor scrub', icon: 'mdi mdi-broom', path: '/floor_scrub', },
    { text: "mobility Chair", icon: "mdi mdi-wheelchair-accessibility", path: "/mobile_chair" },
    { text: 'disinfection', icon: 'mdi mdi-spray', path: '/disinfection', },
    { text: "patrol", icon: "mdi mdi-robot", path: "/patrol" },
    { text: 'forklift', icon: 'mdi mdi-forklift', path: '/forklift', },
    { text: 'stocktake', icon: 'mdi mdi-package-variant-closed', path: '/stocktaking', }, 
    // { text: 'beverage', icon: 'mdi mdi-silverware-fork-knife', path: '/beverage', },
  ]
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/dist/zone-error';  // Included with Angular CLI.
