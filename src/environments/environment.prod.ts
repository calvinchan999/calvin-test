// This file can be replaced during build by using the `fileReplacements` array.
// `ng build --prod` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: true,
  version: '20230801-1626',
  app : 'standalone',
  recaptchaSiteKey : '6LdzgfUhAAAAALqOYXkFO__F3Juldg7N500ld1CM',
  routes:
  [
    { text: "Patrol", icon: "mdi mdi-security", path: "/patrol" },
    { text: 'Delivery', icon: 'mdi mdi-truck-fast', path: '/delivery', },
    { text: 'Floor Scrub', icon: 'mdi mdi-broom', path: '/floor_scrub', },
    { text: "Mobility Chair", icon: "mdi mdi-wheelchair-accessibility", path: "/mobile_chair" },
    { text: 'Disinfection', icon: 'mdi mdi-spray', path: '/disinfection', },
    { text: 'Concierge', icon: 'mdi mdi-robot', path: '/concierge', },
    { text: 'Forklift', icon: 'mdi mdi-forklift', path: '/forklift', },
    { text: 'Stocktake', icon: 'mdi mdi-package-variant-closed', path: '/stocktaking', }, 
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

// [
//   { text: "patrol", icon: "mdi mdi-robot", path: "/patrol" },
//   { text: "mobility Chair", icon: "mdi mdi-wheelchair-accessibility", path: "/mobile_chair" },
//   { text: 'beverage', icon: 'mdi mdi-silverware-fork-knife', path: '/beverage', },
//   { text: 'delivery', icon: 'mdi mdi-truck-fast', path: '/delivery', },
//   { text: 'disinfection', icon: 'mdi mdi-spray', path: '/disinfection', },
//   { text: 'forklift', icon: 'mdi mdi-forklift', path: '/forklift', },
//   { text: 'warehouse', icon: 'mdi mdi-warehouse', path: '/warehouse', },
//   { text: 'stocktake', icon: 'mdi mdi-package-variant-closed', path: '/stocktake', },
//   { text: 'floor scrub', icon: 'mdi mdi-broom', path: '/floor_scrub', },
// ]