var replace = require('replace-in-file');
var app = process.argv[2];
var date = new Date();
const buildDateString = (new Date(date.getTime() - (date.getTimezoneOffset() * 60000))).toISOString().replace(/[^0-9]/g, "");
const buildVersion = `${buildDateString.slice(0 , 8)}-${buildDateString.slice(8, 12)}`
const options1 = {
    files: 'src/environments/environment.prod.ts',
    from: /{APP}/g,
    to: app,
    allowEmptyPaths: false,
};
const options2 = {
    files: 'src/environments/environment.prod.ts',
    from: /{BUILD_VERSION}/g,
    to: buildVersion,
    allowEmptyPaths: false,
};

async function main(){
    try {
	  var fs = require('fs');
      var isArcs = app.toUpperCase() == "ARCS";
	  fs.copyFile('src/environments/environment.template.ts', 'src/environments/environment.prod.ts', async(err) => {
		 if(err){
  		  console.log('An error has occured');
		    console.log(err)
		  throw err;
		 }else{
            await replace(options1);
            await replace(options2);
            console.log('Build version set: ' + buildVersion );
         }
	  });
      fs.copyFile(`src/assets/base_${isArcs? 'arcs': 'sa'}.css`, 'src/assets/base.css', async(err) => {
        if(err){
  		  console.log('An error has occured during base.css replacement');
		    console.log(err)
		  throw err;
		 }
      })
      fs.copyFile(`src/assets/theme-default/custom_${isArcs? 'arcs': 'sa'}.css`, 'src/assets/theme-default/custom.css', async(err) => {
        if(err){
  		  console.log('An error has occured during custom.css replacement');
		    console.log(err)
		  throw err;
		 }
      })
    }catch (error) {
          console.error('Error occurred:', error);
    }
}


main();
 

