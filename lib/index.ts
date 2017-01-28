/// <reference path="../typings/index.d.ts" />
import {detectEnv} from './util'
if (detectEnv() == "node") {
    require('./libs.js');
}

import {getConfigVariable, guid, int, getGlobal} from './util'

import {main} from './main'

declare var module:any;
if(detectEnv() == "browser") {
   $(document).ready(main);
} else if (detectEnv() == "node" && !module.parent) { //if we are node and we ran this script
    main();
}
